import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.backend.users.models import Profile
from app.backend.users.router import SupabaseUser, get_current_user
from app.core.config import settings
from app.main import app


def test_me_creates_profile_for_supabase_user_without_local_profile(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
    supabase_identity: SupabaseUser,
) -> None:
    response = client.get("/api/users/me", headers={"Authorization": "Bearer test"})

    assert response.status_code == 200
    profile_data = response.json()
    assert profile_data["user_id"] == supabase_identity.user_id
    assert profile_data["email"] == supabase_identity.email
    assert profile_data["display_name"] == supabase_identity.display_name
    assert profile_data["avatar_url"] == supabase_identity.avatar_url
    assert profile_data["is_admin"] is False

    with test_session_factory() as session:
        saved_profile = session.scalar(
            select(Profile).where(Profile.user_id == supabase_identity.user_id)
        )

    assert saved_profile is not None
    assert saved_profile.id == profile_data["id"]


def test_me_returns_existing_local_profile(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
    supabase_identity: SupabaseUser,
) -> None:
    with test_session_factory() as session:
        profile = Profile(
            user_id=supabase_identity.user_id,
            email=supabase_identity.email,
            display_name="Saved Display Name",
            avatar_url=None,
            bio="Already stored",
        )
        session.add(profile)
        session.commit()
        profile_id = profile.id

    response = client.get("/api/users/me", headers={"Authorization": "Bearer test"})

    assert response.status_code == 200
    assert response.json()["id"] == profile_id
    assert response.json()["display_name"] == "Saved Display Name"
    assert response.json()["bio"] == "Already stored"


def test_me_rejects_wrong_token(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "supabase_url", "https://project.example")
    monkeypatch.setattr(
        settings,
        "supabase_jwks_url",
        "https://project.example/auth/v1/.well-known/jwks.json",
    )
    app.dependency_overrides.pop(get_current_user, None)

    response = client.get(
        "/api/users/me",
        headers={"Authorization": "Bearer definitely-not-a-jwt"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid token"}
