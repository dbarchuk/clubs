import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.backend.users.models import Profile
from app.backend.users.router import SupabaseUser, get_current_user
from app.core.config import settings
from app.main import app


def authenticate_as(user_id: str, email: str) -> None:
    identity = SupabaseUser(
        user_id=user_id,
        email=email,
        display_name=email.split("@", maxsplit=1)[0].title(),
        avatar_url=None,
    )
    app.dependency_overrides[get_current_user] = lambda: identity


def create_profile(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
    user_id: str,
    email: str,
    *,
    is_admin: bool = False,
) -> dict[str, object]:
    authenticate_as(user_id, email)
    response = client.get("/api/users/me", headers={"Authorization": "Bearer test"})
    assert response.status_code == 200
    if is_admin:
        profile_id = response.json()["id"]
        with test_session_factory() as session:
            profile = session.get(Profile, profile_id)
            assert profile is not None
            profile.is_admin = True
            session.commit()
        response = client.get("/api/users/me", headers={"Authorization": "Bearer test"})
    return response.json()


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
    assert profile_data["is_active"] is True

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
    assert response.json()["is_active"] is True


def test_me_returns_inactive_status(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
    supabase_identity: SupabaseUser,
) -> None:
    with test_session_factory() as session:
        profile = Profile(
            user_id=supabase_identity.user_id,
            email=supabase_identity.email,
            display_name=supabase_identity.display_name,
            is_active=False,
        )
        session.add(profile)
        session.commit()

    response = client.get("/api/users/me", headers={"Authorization": "Bearer test"})

    assert response.status_code == 200
    assert response.json()["is_active"] is False


def test_me_restores_admin_for_configured_superuser(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "superuser_emails", ["root@example.com"])
    authenticate_as("root-user", "ROOT@example.com")
    with test_session_factory() as session:
        profile = Profile(
            user_id="root-user",
            email="root@example.com",
            display_name="Root User",
            is_admin=False,
        )
        session.add(profile)
        session.commit()
        profile_id = profile.id

    response = client.get("/api/users/me", headers={"Authorization": "Bearer test"})

    assert response.status_code == 200
    assert response.json()["is_admin"] is True
    assert response.json()["is_superuser"] is True
    with test_session_factory() as session:
        saved_profile = session.get(Profile, profile_id)
        assert saved_profile is not None
        assert saved_profile.is_admin is True


def test_me_can_update_profile_fields(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
    supabase_identity: SupabaseUser,
) -> None:
    create_response = client.get(
        "/api/users/me", headers={"Authorization": "Bearer test"}
    )
    profile_id = create_response.json()["id"]

    response = client.put(
        "/api/users/me",
        json={
            "display_name": "Updated Name",
            "date_of_birth": "1990-05-12",
            "bio": "A short bio",
        },
        headers={"Authorization": "Bearer test"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == profile_id
    assert response.json()["display_name"] == "Updated Name"
    assert response.json()["date_of_birth"] == "1990-05-12"
    assert response.json()["bio"] == "A short bio"
    assert response.json()["is_active"] is True
    with test_session_factory() as session:
        saved_profile = session.get(Profile, profile_id)
        assert saved_profile is not None
        assert saved_profile.email == supabase_identity.email
        assert saved_profile.display_name == "Updated Name"


def test_regular_user_cannot_view_or_edit_user_management(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    profile = create_profile(
        client, test_session_factory, "regular-user", "regular@example.com"
    )

    list_response = client.get(
        "/api/users/management", headers={"Authorization": "Bearer test"}
    )
    update_response = client.patch(
        f"/api/users/management/{profile['id']}",
        json={"is_active": False},
        headers={"Authorization": "Bearer test"},
    )

    assert list_response.status_code == 403
    assert update_response.status_code == 403


def test_admin_can_view_users_and_change_active_status(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    admin = create_profile(
        client,
        test_session_factory,
        "management-admin",
        "admin@example.com",
        is_admin=True,
    )
    target = create_profile(
        client, test_session_factory, "management-target", "target@example.com"
    )
    authenticate_as("management-admin", "admin@example.com")

    list_response = client.get(
        "/api/users/management", headers={"Authorization": "Bearer test"}
    )
    update_response = client.patch(
        f"/api/users/management/{target['id']}",
        json={"is_active": False},
        headers={"Authorization": "Bearer test"},
    )

    assert list_response.status_code == 200
    assert {user["id"] for user in list_response.json()["users"]} >= {
        admin["id"], target["id"]
    }
    assert list_response.json()["current_user_is_superuser"] is False
    assert update_response.status_code == 200
    assert update_response.json()["is_active"] is False
    with test_session_factory() as session:
        saved_target = session.get(Profile, target["id"])
        assert saved_target is not None
        assert saved_target.is_active is False


def test_admin_cannot_remove_admin_access(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    create_profile(
        client,
        test_session_factory,
        "management-admin",
        "admin@example.com",
        is_admin=True,
    )
    target = create_profile(
        client,
        test_session_factory,
        "target-admin",
        "target-admin@example.com",
        is_admin=True,
    )
    authenticate_as("management-admin", "admin@example.com")

    response = client.patch(
        f"/api/users/management/{target['id']}",
        json={"is_admin": False},
        headers={"Authorization": "Bearer test"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only a superuser can remove administrator access"


def test_superuser_can_remove_admin_access(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    test_session_factory: sessionmaker[Session],
) -> None:
    monkeypatch.setattr(settings, "superuser_emails", ["root@example.com"])
    target = create_profile(
        client,
        test_session_factory,
        "target-admin",
        "target-admin@example.com",
        is_admin=True,
    )
    create_profile(client, test_session_factory, "root-user", "ROOT@example.com")

    response = client.patch(
        f"/api/users/management/{target['id']}",
        json={"is_admin": False},
        headers={"Authorization": "Bearer test"},
    )

    assert response.status_code == 200
    assert response.json()["is_admin"] is False
    with test_session_factory() as session:
        saved_target = session.get(Profile, target["id"])
        assert saved_target is not None
        assert saved_target.is_admin is False


def test_user_management_prevents_self_and_superuser_deactivation(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    test_session_factory: sessionmaker[Session],
) -> None:
    monkeypatch.setattr(settings, "superuser_emails", ["root@example.com"])
    root = create_profile(client, test_session_factory, "root-user", "root@example.com")

    self_response = client.patch(
        f"/api/users/management/{root['id']}",
        json={"is_active": False},
        headers={"Authorization": "Bearer test"},
    )
    assert self_response.status_code == 403
    assert self_response.json()["detail"] == "You cannot deactivate your own account"

    create_profile(
        client,
        test_session_factory,
        "admin-user",
        "admin@example.com",
        is_admin=True,
    )
    authenticate_as("admin-user", "admin@example.com")
    protected_root_response = client.patch(
        f"/api/users/management/{root['id']}",
        json={"is_active": False},
        headers={"Authorization": "Bearer test"},
    )
    assert protected_root_response.status_code == 403
    assert protected_root_response.json()["detail"] == "Superuser accounts cannot be deactivated"


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
