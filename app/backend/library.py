from sqlalchemy import Select, select

from app.backend.clubs.models import Club, ClubMember, ClubType
from app.backend.events.models import Event, EventStatus


def my_club_item_ids(club_type: ClubType, profile_id: str) -> Select[tuple[str | None]]:
    """Return catalog IDs linked from active events in the user's clubs."""
    return (
        select(Event.linked_item_id)
        .join(Club, Club.id == Event.club_id)
        .join(ClubMember, ClubMember.club_id == Club.id)
        .where(
            ClubMember.user_id == profile_id,
            Club.club_type == club_type,
            Club.deleted_at.is_(None),
            Event.deleted_at.is_(None),
            Event.status != EventStatus.DELETED,
            Event.linked_item_id.is_not(None),
        )
        .distinct()
    )
