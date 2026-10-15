from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backend.board_games.models import BoardGame, BoardGameTranslation
from app.backend.board_games.clients import GeekachBoardGameClient
from app.backend.board_games.schemas import (
    BoardGameCreate,
    BoardGameClubReference,
    BoardGameProviderResult,
    BoardGameResponse,
    BoardGameUpdate,
    LibraryBoardGameResponse,
)
from app.backend.clubs.models import Club, ClubMember, ClubType
from app.backend.events.models import Event, EventStatus
from app.backend.users.models import Profile
from app.backend.users.router import get_active_profile, is_superuser_email
from app.core.database import get_db

router = APIRouter(prefix="/board-games", tags=["board-games"])
geekach_client = GeekachBoardGameClient()


@router.get("", response_model=list[BoardGameResponse | BoardGameProviderResult])
async def search_board_games(
    title: Annotated[str, Query(min_length=1, max_length=200)],
    _: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> list[BoardGameResponse | BoardGameProviderResult]:
    normalized_title = title.strip()
    if not normalized_title:
        raise HTTPException(status_code=422, detail="Title must not be blank")

    games = db.scalars(
        select(BoardGame)
        .outerjoin(BoardGameTranslation)
        .where(
            or_(
                func.lower(BoardGame.title).contains(normalized_title.lower()),
                func.lower(BoardGameTranslation.title).contains(normalized_title.lower()),
            )
        )
        .distinct()
        .order_by(BoardGame.title, BoardGame.year_published)
    ).all()
    local_results = [BoardGameResponse.model_validate(game) for game in games]
    try:
        provider_results = await geekach_client.search(normalized_title)
    except (httpx.HTTPError, ValueError) as exc:
        # Keep local catalog search usable while the external shop is unavailable.
        if not local_results:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Board game provider search is temporarily unavailable",
            ) from exc
        provider_results = []
    return [*local_results, *provider_results]


@router.get("/library", response_model=list[LibraryBoardGameResponse])
async def list_library_board_games(
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> list[LibraryBoardGameResponse]:
    rows = db.execute(
        select(BoardGame, Club)
        .join(Event, Event.linked_item_id == cast(BoardGame.id, String))
        .join(Club, Club.id == Event.club_id)
        .join(ClubMember, ClubMember.club_id == Club.id)
        .where(
            ClubMember.user_id == profile.id,
            Club.club_type == ClubType.BOARD_GAMES,
            Club.deleted_at.is_(None),
            Event.deleted_at.is_(None),
            Event.status != EventStatus.DELETED,
        )
        .order_by(BoardGame.title, BoardGame.year_published, Club.title)
    ).all()

    library: dict[int, LibraryBoardGameResponse] = {}
    for game, club in rows:
        entry = library.get(game.id)
        if entry is None:
            entry = LibraryBoardGameResponse(
                board_game=BoardGameResponse.model_validate(game),
                clubs=[],
            )
            library[game.id] = entry
        if all(reference.id != club.id for reference in entry.clubs):
            entry.clubs.append(BoardGameClubReference(id=club.id, title=club.title))
    return list(library.values())


@router.post("", response_model=BoardGameResponse, status_code=status.HTTP_201_CREATED)
async def create_board_game(
    payload: BoardGameCreate,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> BoardGameResponse:
    values = payload.model_dump(exclude={"cover_image_url", "translations"})
    game = BoardGame(
        **values,
        cover_image_url=(str(payload.cover_image_url) if payload.cover_image_url else None),
        created_by=profile.id,
        translations=[
            BoardGameTranslation(
                locale=translation.locale,
                title=translation.title.strip() if translation.title else None,
                description=translation.description,
            )
            for translation in payload.translations
            if translation.title or translation.description
        ],
    )
    db.add(game)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Board game could not be saved",
        ) from exc
    db.refresh(game)
    return BoardGameResponse.model_validate(game)


@router.patch("/{board_game_id}", response_model=BoardGameResponse)
async def update_board_game(
    board_game_id: int,
    payload: BoardGameUpdate,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> BoardGameResponse:
    if not is_superuser_email(profile.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a superuser can edit board games",
        )
    game = db.get(BoardGame, board_game_id)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board game not found")

    translations = payload.translations
    values = payload.model_dump(exclude_unset=True, exclude={"translations"})
    if "title" in values:
        if values["title"] is None or not values["title"].strip():
            raise HTTPException(status_code=422, detail="title must not be blank")
        game.title = values["title"].strip()
    for field in ("year_published", "description", "min_players", "max_players"):
        if field in values:
            setattr(game, field, values[field])
    if "cover_image_url" in values:
        game.cover_image_url = (
            str(values["cover_image_url"]) if values["cover_image_url"] else None
        )
    if (
        game.min_players is not None
        and game.max_players is not None
        and game.max_players < game.min_players
    ):
        raise HTTPException(
            status_code=422,
            detail="max_players must be greater than or equal to min_players",
        )
    if translations is not None:
        translations_by_locale = {item.locale: item for item in game.translations}
        for translation in translations:
            title = translation.title.strip() if translation.title else None
            description = (
                translation.description.strip()
                if translation.description and translation.description.strip()
                else None
            )
            existing = translations_by_locale.get(translation.locale)
            if title is None and description is None:
                if existing is not None:
                    game.translations.remove(existing)
                continue
            if existing is None:
                game.translations.append(
                    BoardGameTranslation(
                        locale=translation.locale,
                        title=title,
                        description=description,
                    )
                )
            else:
                existing.title = title
                existing.description = description
    db.commit()
    db.refresh(game)
    return BoardGameResponse.model_validate(game)
