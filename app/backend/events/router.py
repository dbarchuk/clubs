from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from app.backend.board_games.models import BoardGame
from app.backend.board_games.schemas import BoardGameResponse
from app.backend.books.models import Book
from app.backend.books.schemas import BookResponse
from app.backend.clubs.models import Club, ClubType
from app.backend.clubs.permissions import require_manager, require_member
from app.backend.events.models import Event, EventStatus
from app.backend.events.schemas import EventCreate, EventResponse, EventUpdate
from app.backend.movies.models import Movie
from app.backend.movies.schemas import MovieResponse
from app.backend.users.models import Profile
from app.backend.users.router import get_active_profile
from app.core.database import get_db

router = APIRouter(prefix="/events", tags=["events"])


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
    if club.club_type in {ClubType.MOVIE, ClubType.BOARD_GAMES, ClubType.BOOK}:
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


def validate_movie_link(
    db: Session, club: Club, linked_item_id: str | None
) -> Movie | None:
    if club.club_type != ClubType.MOVIE or linked_item_id is None:
        return None
    movie = db.get(Movie, int(linked_item_id)) if linked_item_id.isdecimal() else None
    if movie is None:
        raise HTTPException(status_code=422, detail="Select a movie from the movie catalog")
    return movie


def get_linked_board_game(
    db: Session, club: Club, linked_item_id: str | None
) -> BoardGame | None:
    if club.club_type != ClubType.BOARD_GAMES:
        return None
    if linked_item_id is None or not linked_item_id.isdecimal():
        raise HTTPException(status_code=422, detail="Select a game from the board game catalog")
    game = db.get(BoardGame, int(linked_item_id))
    if game is None:
        raise HTTPException(status_code=422, detail="Select a game from the board game catalog")
    return game


def get_linked_book(db: Session, club: Club, linked_item_id: str | None) -> Book | None:
    if club.club_type != ClubType.BOOK or linked_item_id is None:
        return None
    book = db.get(Book, int(linked_item_id)) if linked_item_id.isdecimal() else None
    if book is None:
        raise HTTPException(status_code=422, detail="Select a book from the book catalog")
    return book


def to_event_response(db: Session, event: Event, club: Club) -> EventResponse:
    response = EventResponse.model_validate(event)
    linked_movie = None
    if club.club_type == ClubType.MOVIE and event.linked_item_id is not None:
        if event.linked_item_id.isdecimal():
            movie = db.get(Movie, int(event.linked_item_id))
            if movie is not None:
                linked_movie = MovieResponse.model_validate(movie)
    linked_board_game = None
    if club.club_type == ClubType.BOARD_GAMES and event.linked_item_id is not None:
        if event.linked_item_id.isdecimal():
            board_game = db.get(BoardGame, int(event.linked_item_id))
            if board_game is not None:
                linked_board_game = BoardGameResponse.model_validate(board_game)
    linked_book = None
    if club.club_type == ClubType.BOOK and event.linked_item_id is not None:
        if event.linked_item_id.isdecimal():
            book = db.get(Book, int(event.linked_item_id))
            if book is not None:
                linked_book = BookResponse.model_validate(book)
    return response.model_copy(
        update={
            "linked_movie": linked_movie,
            "linked_board_game": linked_board_game,
            "linked_book": linked_book,
        }
    )


@router.get("/clubs/{club_id}", response_model=list[EventResponse])
async def list_club_events(
    club_id: str,
    profile: Annotated[Profile, Depends(get_active_profile)],
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
        .order_by(
            case((Event.status == EventStatus.HELD, 0), else_=1),
            case(
                (Event.status == EventStatus.HELD, Event.start_date),
                else_=None,
            ).desc().nullslast(),
            Event.start_date,
            Event.start_time,
            Event.created_at,
        )
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
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> EventResponse:
    club = require_manager(db, club_id, profile.id)
    if club.club_type == ClubType.MOVIE and payload.linked_item_id is None:
        raise HTTPException(status_code=422, detail="Select a movie from the movie catalog")
    movie = validate_movie_link(db, club, payload.linked_item_id)
    board_game = get_linked_board_game(db, club, payload.linked_item_id)
    book = get_linked_book(db, club, payload.linked_item_id)
    if club.club_type not in {ClubType.MOVIE, ClubType.BOARD_GAMES, ClubType.BOOK} and (
        payload.start_date is None or payload.end_date is None
    ):
        raise HTTPException(status_code=422, detail="Start and end dates are required")
    if club.club_type in {ClubType.MOVIE, ClubType.BOARD_GAMES, ClubType.BOOK} and (
        payload.end_date is not None
        or payload.start_time is not None
        or payload.end_time is not None
    ):
        raise HTTPException(
            status_code=422,
            detail="Movie, book, and board game entries only support an optional start date",
        )
    event = Event(
        club_id=club_id,
        title=(board_game.title if board_game is not None else book.title if book is not None and payload.title is None else payload.title),
        linked_item_id=payload.linked_item_id,
        avatar_url=(
            board_game.cover_image_url
            if board_game is not None
            else book.cover_image_url
            if book is not None
            else movie.cover_image_url
            if movie is not None
            else str(payload.avatar_url) if payload.avatar_url else None
        ),
        start_date=payload.start_date,
        end_date=None if club.club_type in {ClubType.MOVIE, ClubType.BOARD_GAMES, ClubType.BOOK} else payload.end_date,
        start_time=None if club.club_type in {ClubType.MOVIE, ClubType.BOARD_GAMES, ClubType.BOOK} else payload.start_time,
        end_time=None if club.club_type in {ClubType.MOVIE, ClubType.BOARD_GAMES, ClubType.BOOK} else payload.end_time,
        status=(
            EventStatus.HELD
            if club.club_type in {ClubType.MOVIE, ClubType.BOARD_GAMES, ClubType.BOOK}
            and payload.start_date is not None
            and payload.start_date <= datetime.now(UTC).date()
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
    profile: Annotated[Profile, Depends(get_active_profile)],
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
    board_game = get_linked_board_game(db, club, event.linked_item_id)
    book = get_linked_book(db, club, event.linked_item_id)
    if club.club_type in {ClubType.MOVIE, ClubType.BOARD_GAMES, ClubType.BOOK} and any(
        field in changes for field in ("start_date", "end_date", "start_time", "end_time")
    ) and (event.end_date is not None or event.start_time is not None or event.end_time is not None):
        raise HTTPException(
            status_code=422,
            detail="Movie, book, and board game entries only support an optional start date",
        )
    if board_game is not None:
        event.title = board_game.title
        event.avatar_url = board_game.cover_image_url
        event.end_date = None
        event.start_time = None
        event.end_time = None
    if book is not None:
        if event.title is None:
            event.title = book.title
        if "avatar_url" not in payload.model_fields_set:
            event.avatar_url = book.cover_image_url
    validate_schedule(event, club)
    movie = validate_movie_link(db, club, event.linked_item_id)
    if movie is not None:
        event.avatar_url = movie.cover_image_url
    if club.club_type == ClubType.BOARD_GAMES and event.linked_item_id is None:
        raise HTTPException(status_code=422, detail="Select a game from the board game catalog")
    db.commit()
    db.refresh(event)
    return to_event_response(db, event, club)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: str,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    event = active_event(db, event_id)
    require_manager(db, event.club_id, profile.id)
    event.status = EventStatus.DELETED
    event.deleted_at = datetime.now(UTC).replace(tzinfo=None)
    event.deleted_by = profile.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
