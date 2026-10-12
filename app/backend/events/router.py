from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.backend.clubs.models import (
    Club,
    ClubMember,
    ClubMemberAccessType,
    ClubType,
)
from app.backend.events.models import Event, EventStatus
from app.backend.events.schemas import EventCreate, EventResponse, EventUpdate
from app.backend.movies.models import Movie
from app.backend.movies.schemas import MovieResponse
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


def validate_schedule(event: Event, club: Club) -> None:
    if club.club_type == ClubType.MOVIE:
        return
    if event.start_date is None or event.end_date is None:
        raise HTTPException(status_code=422, detail="Start and end dates are required")
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


def validate_movie_link(db: Session, club: Club, linked_item_id: str | None) -> None:
    if club.club_type != ClubType.MOVIE or linked_item_id is None:
        return
    if not linked_item_id.isdecimal() or db.get(Movie, int(linked_item_id)) is None:
        raise HTTPException(status_code=422, detail="Select a movie from the movie catalog")


def to_event_response(db: Session, event: Event, club: Club) -> EventResponse:
    response = EventResponse.model_validate(event)
    linked_movie = None
    if club.club_type == ClubType.MOVIE and event.linked_item_id is not None:
        if event.linked_item_id.isdecimal():
            movie = db.get(Movie, int(event.linked_item_id))
            if movie is not None:
                linked_movie = MovieResponse.model_validate(movie)
    return response.model_copy(update={"linked_movie": linked_movie})


@router.get("/clubs/{club_id}", response_model=list[EventResponse])
async def list_club_events(
    club_id: str,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> list[EventResponse]:
    club = require_member(db, club_id, profile.id)
    events = db.scalars(
        select(Event)
        .where(
            Event.club_id == club_id,
            Event.deleted_at.is_(None),
            Event.status != EventStatus.DELETED,
        )
        .order_by(Event.start_date, Event.start_time, Event.created_at)
    ).all()
    return [to_event_response(db, event, club) for event in events]


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
    club = require_manager(db, club_id, profile.id)
    validate_movie_link(db, club, payload.linked_item_id)
    if club.club_type != ClubType.MOVIE and (
        payload.start_date is None or payload.end_date is None
    ):
        raise HTTPException(status_code=422, detail="Start and end dates are required")
    if club.club_type == ClubType.MOVIE and (
        payload.end_date is not None
        or payload.start_time is not None
        or payload.end_time is not None
    ):
        raise HTTPException(
            status_code=422,
            detail="Movie club entries only support an optional start date",
        )
    event = Event(
        club_id=club_id,
        title=payload.title,
        linked_item_id=payload.linked_item_id,
        avatar_url=str(payload.avatar_url) if payload.avatar_url else None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status=(
            EventStatus.HELD
            if club.club_type == ClubType.MOVIE
            and payload.start_date is not None
            and payload.start_date < datetime.now(UTC).date()
            else EventStatus.SCHEDULED
        ),
        created_by=profile.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return to_event_response(db, event, club)


@router.patch("/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    payload: EventUpdate,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> EventResponse:
    event = active_event(db, event_id)
    club = require_manager(db, event.club_id, profile.id)
    changes = payload.model_dump(exclude_unset=True)
    if "avatar_url" in changes:
        event.avatar_url = str(changes["avatar_url"]) if changes["avatar_url"] else None
        changes.pop("avatar_url")
    for field, value in changes.items():
        setattr(event, field, value)
    if club.club_type == ClubType.MOVIE and any(
        field in changes for field in ("start_date", "end_date", "start_time", "end_time")
    ) and (event.end_date is not None or event.start_time is not None or event.end_time is not None):
        raise HTTPException(
            status_code=422,
            detail="Movie club entries only support an optional start date",
        )
    validate_schedule(event, club)
    validate_movie_link(db, club, event.linked_item_id)
    db.commit()
    db.refresh(event)
    return to_event_response(db, event, club)


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
