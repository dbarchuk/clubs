import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.backend.router import router as backend_router
from app.core.config import settings
from app.core.database import check_database_connection, engine
from app.core.logging import configure_logging
from app.frontend import router as frontend_router

configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    """Verify the database at startup and dispose its pool at shutdown."""
    logger.info("Running database startup health probe")
    try:
        await asyncio.to_thread(check_database_connection)
    except Exception:
        logger.exception("Database startup health probe failed")
        await asyncio.to_thread(engine.dispose)
        raise

    logger.info("Database startup health probe succeeded")
    try:
        yield
    finally:
        await asyncio.to_thread(engine.dispose)


app = FastAPI(
    title="Clubs",
    description="Book, movie, sport, and board game clubs, brought together.",
    debug=settings.debug,
    lifespan=lifespan,
)

app.include_router(backend_router)
# Register the frontend last; API path operations take precedence over frontend files.
app.include_router(frontend_router)
