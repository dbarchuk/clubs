from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Text, UniqueConstraint, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.backend.board_games.models import BoardGame
    from app.backend.books.models import Book
    from app.backend.movies.models import Movie


class ReviewBase(Base):
    """Abstract fields shared by each catalog-specific review table."""

    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reviewer_id: Mapped[str] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )


class MovieReview(ReviewBase):
    __tablename__ = "movie_reviews"
    __table_args__ = (
        UniqueConstraint("reviewer_id", "movie_id", name="uq_movie_reviews_reviewer_movie"),
        CheckConstraint(
            "rating IS NULL OR rating BETWEEN 1 AND 10",
            name="ck_movie_reviews_rating_range",
        ),
    )

    movie_id: Mapped[int] = mapped_column(
        ForeignKey("movies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    movie: Mapped[Movie] = relationship(back_populates="reviews")


class BoardGameReview(ReviewBase):
    __tablename__ = "board_game_reviews"
    __table_args__ = (
        UniqueConstraint(
            "reviewer_id", "board_game_id", name="uq_board_game_reviews_reviewer_game"
        ),
        CheckConstraint(
            "rating IS NULL OR rating BETWEEN 1 AND 10",
            name="ck_board_game_reviews_rating_range",
        ),
    )

    board_game_id: Mapped[int] = mapped_column(
        ForeignKey("board_games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    board_game: Mapped[BoardGame] = relationship(back_populates="reviews")


class BookReview(ReviewBase):
    __tablename__ = "book_reviews"
    __table_args__ = (
        UniqueConstraint("reviewer_id", "book_id", name="uq_book_reviews_reviewer_book"),
        CheckConstraint(
            "rating IS NULL OR rating BETWEEN 1 AND 10",
            name="ck_book_reviews_rating_range",
        ),
    )

    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    book: Mapped[Book] = relationship(back_populates="reviews")
