from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.backend.clubs.models import (
    Club,
    ClubMember,
    ClubMemberAccessType,
)
from app.backend.events.models import Event, EventStatus
from app.backend.events.schemas import EventCreate, EventResponse, EventUpdate
from app.backend.users.models import Profile
from app.backend.users.router import get_current_profile
from app.core.database import get_db

router = APIRouter(prefix="/events", tags=["events"])


def require_member(db: Session, club_id: str, profile_id: str) -> Club:
    club = db.scalar(
        select(Club).where(Club.id == club_id, Club.deleted_at.is_(None))
    )
    if club is None:
        raise HTTPException(status_code=404, detail="Club not found")
    membership = db.get(ClubMember, (club_id, profile_id))
    if membership is None:
        raise HTTPException(status_code=403, detail="Club membership is required")
    return club


def require_manager(db: Session, club_id: str, profile_id: str) -> Club:
    club = require_member(db, club_id, profile_id)
    membership = db.get(ClubMember, (club_id, profile_id))
    if membership is None or membership.access_type not in {
        ClubMemberAccessType.OWNER,
        ClubMemberAccessType.ADMIN,
    }:
        raise HTTPException(status_code=403, detail="Club manager access is required")
    return club


def active_event(db: Session, event_id: str) -> Event:
    event = db.scalar(
        select(Event).where(
            Event.id == event_id,
            Event.deleted_at.is_(None),
            Event.status != EventStatus.DELETED,
        )
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


def validate_schedule(event: Event) -> None:
    if event.end_date < event.start_date:
        raise HTTPException(status_code=422, detail="End date must be on or after start date")
    if (event.start_time is None) != (event.end_time is None):
        raise HTTPException(status_code=422, detail="Start and end times must both be provided")
    if (
        event.start_date == event.end_date
        and event.start_time is not None
        and event.end_time is not None
        and event.end_time < event.start_time
    ):
        raise HTTPException(status_code=422, detail="End time must not be before start time")


@router.get("/clubs/{club_id}", response_model=list[EventResponse])
async def list_club_events(
    club_id: str,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> list[EventResponse]:
    require_member(db, club_id, profile.id)
    events = db.scalars(
        select(Event)
        .where(
            Event.club_id == club_id,
            Event.deleted_at.is_(None),
            Event.status != EventStatus.DELETED,
        )
        .order_by(Event.start_date, Event.start_time, Event.created_at)
    ).all()
    return [EventResponse.model_validate(event) for event in events]


@router.post(
    "/clubs/{club_id}",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_club_event(
    club_id: str,
    payload: EventCreate,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> EventResponse:
    require_manager(db, club_id, profile.id)
    event = Event(
        club_id=club_id,
        title=payload.title,
        linked_item_id=payload.linked_item_id,
        avatar_url=str(payload.avatar_url) if payload.avatar_url else None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        created_by=profile.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return EventResponse.model_validate(event)


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    payload: EventUpdate,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> EventResponse:
    event = active_event(db, event_id)
    require_manager(db, event.club_id, profile.id)
    changes = payload.model_dump(exclude_unset=True)
    if "avatar_url" in changes:
        event.avatar_url = str(changes["avatar_url"]) if changes["avatar_url"] else None
        changes.pop("avatar_url")
    for field, value in changes.items():
        setattr(event, field, value)
    validate_schedule(event)
    db.commit()
    db.refresh(event)
    return EventResponse.model_validate(event)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    event = active_event(db, event_id)
    require_manager(db, event.club_id, profile.id)
    event.status = EventStatus.DELETED
    event.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    event.deleted_by = profile.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
