from collections.abc import Generator
from datetime import UTC, datetime

from sqlalchemy import DateTime, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.sqlalchemy_database_url,
    pool_pre_ping=True,
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for SQLAlchemy ORM models."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
        onupdate=lambda: datetime.now(UTC).replace(tzinfo=None),
    )


def check_database_connection() -> None:
    """Run a lightweight query to verify that PostgreSQL is reachable."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1")).scalar_one()


def get_db() -> Generator[Session, None, None]:
    """Yield a database session and close it after the request."""
    with SessionLocal() as session:
        yield session
