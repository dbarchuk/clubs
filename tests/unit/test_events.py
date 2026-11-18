from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.backend.clubs.models import ClubMember, ClubMemberAccessType
from app.backend.users.router import SupabaseUser, get_current_user
from app.main import app


AUTH_HEADERS = {"Authorization": "Bearer test-token"}


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
        json={"club_type": "book", "title": "Events club", "is_public": is_public},
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 201
    return response.json()


def get_profile_id(client: TestClient) -> str:
    response = client.get("/api/users/me", headers=AUTH_HEADERS)
    assert response.status_code == 200
    return response.json()["id"]


def add_member(
    test_session_factory: sessionmaker[Session], club_id: str, profile_id: str
) -> None:
    with test_session_factory() as session:
        session.add(
            ClubMember(
                club_id=club_id,
                user_id=profile_id,
                access_type=ClubMemberAccessType.MEMBER,
            )
        )
        session.commit()


def test_private_club_members_can_create_and_edit_only_their_own_events(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    authenticate_as("private-event-owner", "owner@example.com")
    club = create_club(client, is_public=False)

    authenticate_as("private-event-creator", "creator@example.com")
    creator_id = get_profile_id(client)
    add_member(test_session_factory, club["id"], creator_id)
    created = client.post(
        f"/api/events/clubs/{club['id']}",
        json={"title": "Member event"},
        headers=AUTH_HEADERS,
    )
    assert created.status_code == 201
    event_id = created.json()["id"]
    assert created.json()["created_by"] == creator_id

    own_edit = client.patch(
        f"/api/events/{event_id}",
        json={"title": "Updated by creator"},
        headers=AUTH_HEADERS,
    )
    assert own_edit.status_code == 200
    assert own_edit.json()["title"] == "Updated by creator"

    authenticate_as("private-event-other-member", "other@example.com")
    other_member_id = get_profile_id(client)
    add_member(test_session_factory, club["id"], other_member_id)
    forbidden_edit = client.patch(
        f"/api/events/{event_id}",
        json={"title": "Not allowed"},
        headers=AUTH_HEADERS,
    )
    forbidden_status_change = client.patch(
        f"/api/events/{event_id}",
        json={"status": "cancelled"},
        headers=AUTH_HEADERS,
    )
    assert forbidden_edit.status_code == 403
    assert forbidden_status_change.status_code == 403

    authenticate_as("private-event-owner", "owner@example.com")
    manager_edit = client.patch(
        f"/api/events/{event_id}",
        json={"title": "Updated by owner"},
        headers=AUTH_HEADERS,
    )
    assert manager_edit.status_code == 200
    assert manager_edit.json()["title"] == "Updated by owner"
    manager_status_change = client.patch(
        f"/api/events/{event_id}",
        json={"status": "cancelled"},
        headers=AUTH_HEADERS,
    )
    assert manager_status_change.status_code == 200
    assert manager_status_change.json()["status"] == "cancelled"
    deleted = client.delete(f"/api/events/{event_id}", headers=AUTH_HEADERS)
    assert deleted.status_code == 204


def test_public_club_event_creation_and_editing_remain_manager_only(
    client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    authenticate_as("public-event-owner", "public-owner@example.com")
    club = create_club(client, is_public=True)
    created = client.post(
        f"/api/events/clubs/{club['id']}",
        json={"title": "Owner event"},
        headers=AUTH_HEADERS,
    )
    assert created.status_code == 201

    authenticate_as("public-event-member", "public-member@example.com")
    member_id = get_profile_id(client)
    add_member(test_session_factory, club["id"], member_id)

    member_create = client.post(
        f"/api/events/clubs/{club['id']}",
        json={"title": "Member event"},
        headers=AUTH_HEADERS,
    )
    member_edit = client.patch(
        f"/api/events/{created.json()['id']}",
        json={"title": "Member edit"},
        headers=AUTH_HEADERS,
    )
    assert member_create.status_code == 403
    assert member_edit.status_code == 403
