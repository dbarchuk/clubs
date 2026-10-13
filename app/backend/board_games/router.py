from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backend.board_games.models import BoardGame
from app.backend.board_games.schemas import BoardGameCreate, BoardGameResponse
from app.backend.users.models import Profile
from app.backend.users.router import get_current_profile
from app.core.database import get_db

router = APIRouter(prefix="/board-games", tags=["board-games"])


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
    values = payload.model_dump(exclude={"cover_image_url"})
    game = BoardGame(
        **values,
        cover_image_url=(str(payload.cover_image_url) if payload.cover_image_url else None),
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
