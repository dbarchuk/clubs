from fastapi import HTTPException
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.backend.clubs.models import Club, ClubMember, ClubMemberAccessType


def _get_club_and_access_type(
    db: Session, club_id: str, profile_id: str
) -> tuple[Club, ClubMemberAccessType | None]:
    """Fetch one club and the caller's access type in one targeted query.

    This avoids loading the club's full membership collection.
    """
    row = db.execute(
        select(Club, ClubMember.access_type)
        .outerjoin(
            ClubMember,
            and_(
                ClubMember.club_id == Club.id,
                ClubMember.user_id == profile_id,
            ),
        )
        .where(Club.id == club_id, Club.deleted_at.is_(None))
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Club not found")
    return row[0], row[1]


def require_member(db: Session, club_id: str, profile_id: str) -> Club:
    club, access_type = _get_club_and_access_type(db, club_id, profile_id)
    if access_type is None:
        raise HTTPException(status_code=403, detail="Club membership is required")
    return club


def require_manager(db: Session, club_id: str, profile_id: str) -> Club:
    club, access_type = _get_club_and_access_type(db, club_id, profile_id)
    if access_type is None:
        raise HTTPException(status_code=403, detail="Club membership is required")
    if access_type not in {ClubMemberAccessType.OWNER, ClubMemberAccessType.ADMIN}:
        raise HTTPException(status_code=403, detail="Club manager access is required")
    return club
