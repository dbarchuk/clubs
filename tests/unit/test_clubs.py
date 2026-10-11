from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.backend.clubs.models import (
    Club,
    ClubDeletionRequest,
    ClubInviteCode,
    ClubMember,
)
from app.backend.users.models import Profile
from app.backend.users.router import SupabaseUser, get_current_user
from app.main import app


def authenticate_as(user_id: str, email: str) -> None:
    identity = SupabaseUser(
        user_id=user_id,
        email=email,
        display_name=email.split("@", maxsplit=1)[0].title(),
        avatar_url=None,
    )
    app.dependency_overrides[get_current_user] = lambda: identity


def create_club(client: TestClient, *, is_public: bool) -> dict[str, object]:
    response = client.post(
        "/api/clubs",
        json={"club_type": "book", "title": "Test club", "is_public": is_public},
        headers={"Authorization": "Bearer test"},
    )
    assert response.status_code == 201
    return response.json()


def test_registered_user_can_join_public_club_once(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    authenticate_as("club-owner", "owner@example.com")
    public_club = create_club(client, is_public=True)
    authenticate_as("another-user", "another@example.com")
    client.get("/api/users/me", headers={"Authorization": "Bearer test"})

    join_response = client.post(
        f"/api/clubs/{public_club['id']}/join",
        headers={"Authorization": "Bearer test"},
    )
    repeated_join = client.post(
        f"/api/clubs/{public_club['id']}/join",
        headers={"Authorization": "Bearer test"},
    )

    assert join_response.status_code == 200
    assert join_response.json()["already_member"] is False
    assert repeated_join.status_code == 200
    assert repeated_join.json()["already_member"] is True
    with test_session_factory() as session:
        memberships = session.scalars(
            select(ClubMember).where(ClubMember.club_id == public_club["id"])
        ).all()
    assert len(memberships) == 2


def test_private_club_requires_active_single_invite_code(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    authenticate_as("private-owner", "private-owner@example.com")
    private_club = create_club(client, is_public=False)
    authenticate_as("private-outsider", "outsider@example.com")
    public_clubs = client.get(
        "/api/clubs?scope=public",
        headers={"Authorization": "Bearer test"},
    )
    assert public_clubs.status_code == 200
    assert all(item["id"] != private_club["id"] for item in public_clubs.json()["items"])

    authenticate_as("private-owner", "private-owner@example.com")
    headers = {"Authorization": "Bearer test"}
    create_code = client.post(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    )
    code_data = create_code.json()

    assert create_code.status_code == 201
    assert len(code_data["code"]) == 8
    assert all(character in "23456789ABCDEFGHJKMNPQRSTUVWXYZ" for character in code_data["code"])
    second_code = client.post(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    )
    active_codes = client.get(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    )
    assert second_code.status_code == 409
    assert active_codes.status_code == 200
    assert len(active_codes.json()) == 1
    assert active_codes.json()[0]["code"] == code_data["code"]

    authenticate_as("invitee-user", "invitee@example.com")
    client.get("/api/users/me", headers=headers)
    invalid_join = client.post(
        "/api/clubs/join-private",
        json={"invite_code": "Z" * 8},
        headers=headers,
    )
    malformed_join = client.post(
        "/api/clubs/join-private",
        json={"invite_code": "O0IL1234"},
        headers=headers,
    )
    valid_join = client.post(
        "/api/clubs/join-private",
        json={"invite_code": code_data["code"]},
        headers=headers,
    )
    assert invalid_join.status_code == 404
    assert malformed_join.status_code == 422
    assert valid_join.status_code == 200
    assert valid_join.json() == {
        "club_id": private_club["id"],
        "already_member": False,
    }
    duplicate_join = client.post(
        "/api/clubs/join-private",
        json={"invite_code": code_data["code"]},
        headers=headers,
    )
    assert duplicate_join.status_code == 200
    assert duplicate_join.json() == {
        "club_id": private_club["id"],
        "already_member": True,
    }
    with test_session_factory() as session:
        invitee = session.scalar(
            select(Profile).where(Profile.user_id == "invitee-user")
        )
        assert invitee is not None
        memberships = session.scalars(
            select(ClubMember).where(
                ClubMember.club_id == private_club["id"],
                ClubMember.user_id == invitee.id,
            )
        ).all()
        assert len(memberships) == 1
        assert memberships[0].access_type.value == "member"

    authenticate_as("private-owner", "private-owner@example.com")
    revoke_code = client.delete(
        f"/api/clubs/{private_club['id']}/invite-codes/{code_data['id']}",
        headers=headers,
    )
    assert revoke_code.status_code == 200
    authenticate_as("third-user", "third@example.com")
    client.get("/api/users/me", headers=headers)
    revoked_join = client.post(
        "/api/clubs/join-private",
        json={"invite_code": code_data["code"]},
        headers=headers,
    )
    assert revoked_join.status_code == 404

    authenticate_as("private-owner", "private-owner@example.com")
    replacement = client.post(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    )
    assert replacement.status_code == 201
    assert replacement.json()["code"] != code_data["code"]

    with test_session_factory() as session:
        saved_code = session.get(ClubInviteCode, code_data["id"])
    assert saved_code is not None
    assert saved_code.revoked_at is not None


def test_only_club_owner_or_admin_can_manage_invite_codes(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    authenticate_as("club-owner", "owner@example.com")
    private_club = create_club(client, is_public=False)
    authenticate_as("regular-member", "member@example.com")
    client.get("/api/users/me", headers={"Authorization": "Bearer test"})
    with test_session_factory() as session:
        member = session.scalar(
            select(Profile).where(Profile.user_id == "regular-member")
        )
        assert member is not None
        session.add(
            ClubMember(
                club_id=private_club["id"],
                user_id=member.id,
                access_type="member",
            )
        )
        session.commit()

    headers = {"Authorization": "Bearer test"}
    denied = client.post(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    )
    assert denied.status_code == 403

    with test_session_factory() as session:
        member = session.scalar(
            select(Profile).where(Profile.user_id == "regular-member")
        )
        assert member is not None
        membership = session.get(ClubMember, (private_club["id"], member.id))
        assert membership is not None
        membership.access_type = "admin"
        session.commit()

    allowed = client.post(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    )
    assert allowed.status_code == 201


def test_private_club_membership_requires_invite_and_private_details_are_hidden(
    client: TestClient,
) -> None:
    headers = {"Authorization": "Bearer test"}
    authenticate_as("membership-owner", "owner@example.com")
    private_club = create_club(client, is_public=False)
    code = client.post(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    ).json()["code"]

    authenticate_as("membership-outsider", "outsider@example.com")
    client.get("/api/users/me", headers=headers)
    assert client.get(f"/api/clubs/{private_club['id']}", headers=headers).status_code == 404
    assert client.get(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    ).status_code == 403

    joined = client.post(
        "/api/clubs/join-private", json={"invite_code": code}, headers=headers
    )
    assert joined.status_code == 200
    visible = client.get(f"/api/clubs/{private_club['id']}", headers=headers)
    assert visible.status_code == 200
    assert visible.json()["my_access_type"] == "member"


def test_owner_can_soft_delete_public_club_without_other_members(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    authenticate_as("public-owner", "owner@example.com")
    public_club = create_club(client, is_public=True)
    response = client.delete(
        f"/api/clubs/{public_club['id']}",
        headers={"Authorization": "Bearer test"},
    )

    assert response.status_code == 204
    with test_session_factory() as session:
        saved_club = session.get(Club, public_club["id"])
        assert saved_club is not None
        assert saved_club.deleted_at is not None
        assert saved_club.deleted_by == public_club["created_by"]
    hidden = client.get(
        "/api/clubs?scope=my", headers={"Authorization": "Bearer test"}
    )
    assert hidden.status_code == 200
    assert hidden.json()["items"] == []


def test_public_club_with_members_requires_platform_admin_review(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    owner_id = "deletion-owner"
    authenticate_as(owner_id, "owner@example.com")
    headers = {"Authorization": "Bearer test"}
    public_club = create_club(client, is_public=True)
    authenticate_as("joined-member", "joined@example.com")
    client.get("/api/users/me", headers=headers)
    joined = client.post(
        f"/api/clubs/{public_club['id']}/join", headers=headers
    )
    assert joined.status_code == 200

    authenticate_as(owner_id, "owner@example.com")
    deletion_response = client.delete(
        f"/api/clubs/{public_club['id']}", headers=headers
    )
    assert deletion_response.status_code == 202
    request_id = deletion_response.json()["id"]
    assert deletion_response.json()["status"] == "pending"
    denied_list = client.get("/api/clubs/deletion-requests", headers=headers)
    assert denied_list.status_code == 403

    authenticate_as("platform-admin", "admin@example.com")
    admin_profile = client.get("/api/users/me", headers=headers).json()
    with test_session_factory() as session:
        profile = session.get(Profile, admin_profile["id"])
        assert profile is not None
        profile.is_admin = True
        session.commit()

    requests = client.get("/api/clubs/deletion-requests", headers=headers)
    assert requests.status_code == 200
    assert requests.json()[0]["club_title"] == "Test club"
    rejected = client.patch(
        f"/api/clubs/deletion-requests/{request_id}",
        json={"approved": False},
        headers=headers,
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"

    authenticate_as(owner_id, "owner@example.com")
    second_request = client.delete(
        f"/api/clubs/{public_club['id']}", headers=headers
    )
    assert second_request.status_code == 202
    assert second_request.json()["id"] != request_id

    authenticate_as("platform-admin", "admin@example.com")
    approved = client.patch(
        f"/api/clubs/deletion-requests/{second_request.json()['id']}",
        json={"approved": True},
        headers=headers,
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    with test_session_factory() as session:
        saved_club = session.get(Club, public_club["id"])
        saved_request = session.get(ClubDeletionRequest, second_request.json()["id"])
        admin = session.scalar(select(Profile).where(Profile.user_id == "platform-admin"))
        assert saved_club is not None and saved_club.deleted_at is not None
        assert saved_request is not None and saved_club.deleted_by == admin.id


def test_private_owner_can_delete_club_with_members_and_invalidates_code(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    authenticate_as("private-owner", "private-owner@example.com")
    private_club = create_club(client, is_public=False)
    headers = {"Authorization": "Bearer test"}
    code = client.post(
        f"/api/clubs/{private_club['id']}/invite-codes", headers=headers
    ).json()
    authenticate_as("private-member", "private-member@example.com")
    client.get("/api/users/me", headers=headers)
    joined = client.post(
        "/api/clubs/join-private",
        json={"invite_code": code["code"]},
        headers=headers,
    )
    assert joined.status_code == 200

    authenticate_as("private-owner", "private-owner@example.com")
    deleted = client.delete(f"/api/clubs/{private_club['id']}", headers=headers)
    assert deleted.status_code == 204
    with test_session_factory() as session:
        saved_club = session.get(Club, private_club["id"])
        saved_code = session.get(ClubInviteCode, code["id"])
        assert saved_club is not None and saved_club.deleted_at is not None
        assert saved_code is not None and saved_code.revoked_at is not None
