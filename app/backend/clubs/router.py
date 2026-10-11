from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.backend.clubs.models import Club, ClubMember, ClubMemberAccessType, ClubType
from app.backend.clubs.schemas import (
    ClubCreate,
    ClubResponse,
    PaginatedClubs,
    PaginationParams,
)
from app.backend.users.models import Profile
from app.backend.users.router import get_current_profile
from app.core.database import get_db

router = APIRouter(prefix="/clubs", tags=["clubs"])


@router.get("", response_model=PaginatedClubs)
async def list_clubs(
    pagination: Annotated[PaginationParams, Depends()],
    club_type: Annotated[ClubType | None, Query()] = None,
    scope: Annotated[Literal["my", "public"], Query()] = "my",
    search: Annotated[str | None, Query(max_length=100)] = None,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> PaginatedClubs:
    statement = select(Club)
    if club_type is not None:
        statement = statement.where(Club.club_type == club_type)
    if scope == "my":
        statement = statement.where(Club.memberships.any(ClubMember.user_id == profile.id))
    else:
        statement = statement.where(
            Club.is_public.is_(True),
            ~Club.memberships.any(ClubMember.user_id == profile.id),
        )
    if search and search.strip():
        statement = statement.where(Club.title.ilike(f"%{search.strip()}%"))

    clubs = list(
        db.scalars(
            statement.order_by(Club.created_at.desc(), Club.id)
            .offset((pagination.page - 1) * pagination.size)
            .limit(pagination.size + 1)
        ).all()
    )
    has_more = len(clubs) > pagination.size
    items = clubs[: pagination.size]

    return PaginatedClubs(
        items=[ClubResponse.model_validate(club) for club in items],
        page=pagination.page,
        size=pagination.size,
        has_more=has_more,
    )


@router.post("", response_model=ClubResponse, status_code=201)
async def create_club(
    club_data: ClubCreate,
    profile: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
) -> Club:
    club = Club(
        club_type=club_data.club_type,
        title=club_data.title,
        avatar_url=str(club_data.avatar_url) if club_data.avatar_url else None,
        is_public=club_data.is_public,
        created_by=profile.id,
    )
    club.memberships.append(
        ClubMember(
            user_id=profile.id,
            access_type=ClubMemberAccessType.OWNER,
        )
    )
    db.add(club)
    db.commit()
    db.refresh(club)
    return club
