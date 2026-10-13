import asyncio

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import SQLAlchemyError

from app.backend.board_games.router import router as board_games_router
from app.backend.clubs.router import router as clubs_router
from app.backend.events.router import router as events_router
from app.backend.movies.router import router as movies_router
from app.backend.users.router import router as users_router
from app.core.database import check_database_connection

router = APIRouter(prefix="/api")

router.include_router(clubs_router)
router.include_router(users_router)
router.include_router(events_router)
router.include_router(movies_router)
router.include_router(board_games_router)


@router.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    try:
        await asyncio.to_thread(check_database_connection)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database is unavailable",
        ) from exc

    return {"status": "ok", "database": "connected"}
