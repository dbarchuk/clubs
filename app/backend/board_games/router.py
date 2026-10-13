from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backend.board_games.models import BoardGame, BoardGameType
from app.backend.board_games.schemas import (
    BoardGameCreate,
    BoardGameResponse,
    BoardGameTypeResponse,
)
from app.backend.users.models import Profile
from app.backend.users.router import get_current_profile
from app.core.database import get_db

router = APIRouter(prefix="/board-games", tags=["board-games"])


@router.get("/types", response_model=list[BoardGameTypeResponse])
async def list_board_game_types(
    _: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> list[BoardGameTypeResponse]:
    game_types = db.scalars(select(BoardGameType).order_by(BoardGameType.name)).all()
    return [BoardGameTypeResponse.model_validate(game_type) for game_type in game_types]


@router.get("", response_model=list[BoardGameResponse])
async def search_board_games(
    title: Annotated[str, Query(min_length=1, max_length=200)],
    _: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> list[BoardGameResponse]:
    normalized_title = title.strip()
    if not normalized_title:
        raise HTTPException(status_code=422, detail="Title must not be blank")

    games = db.scalars(
        select(BoardGame)
        .where(func.lower(BoardGame.title).contains(normalized_title.lower()))
        .order_by(BoardGame.title, BoardGame.year_published)
    ).all()
    return [BoardGameResponse.model_validate(game) for game in games]


@router.post("", response_model=BoardGameResponse, status_code=status.HTTP_201_CREATED)
async def create_board_game(
    payload: BoardGameCreate,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> BoardGameResponse:
    game_types = (
        db.scalars(
            select(BoardGameType).where(
                BoardGameType.id.in_(payload.game_type_ids)
            )
        ).all()
        if payload.game_type_ids
        else []
    )
    values = payload.model_dump(exclude={"cover_image_url", "game_type_ids"})
    game = BoardGame(
        **values,
        cover_image_url=(str(payload.cover_image_url) if payload.cover_image_url else None),
        game_types=list(game_types),
        created_by=profile.id,
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
