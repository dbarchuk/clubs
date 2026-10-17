from datetime import date

from sqlalchemy import (
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Integer,
    Select,
    func,
    select,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, query_expression, relationship, with_expression

from app.backend.reviews.models import MovieReview
from app.core.database import Base
from app.core.models import OwnedModelMixin


class Movie(OwnedModelMixin, Base):
    __tablename__ = "movies"
    __table_args__ = (
        UniqueConstraint(
            "provider", "external_id", name="uq_movies_provider_external_id"
        ),
        CheckConstraint(
            "popularity IS NULL OR popularity >= 0",
            name="ck_movies_popularity_nonnegative",
        ),
        CheckConstraint(
            "vote_average IS NULL OR vote_average BETWEEN 0 AND 10",
            name="ck_movies_vote_average_range",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    original_title: Mapped[str] = mapped_column(String(500), nullable=False)
    overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    backdrop_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    popularity: Mapped[float | None] = mapped_column(Float, nullable=True)
    vote_average: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_rating: Mapped[float | None] = query_expression()
    translations: Mapped[list["MovieTranslation"]] = relationship(
        back_populates="movie", cascade="all, delete-orphan", passive_deletes=True
    )
    reviews: Mapped[list[MovieReview]] = relationship(
        back_populates="movie", cascade="all, delete-orphan", passive_deletes=True
    )

    @classmethod
    def with_average_rating(cls, statement: Select) -> Select:
        average_rating = (
            select(func.avg(MovieReview.rating))
            .where(MovieReview.movie_id == cls.id, MovieReview.is_public.is_(True))
            .correlate_except(MovieReview)
            .scalar_subquery()
        )
        return statement.options(with_expression(cls.average_rating, average_rating))


class MovieTranslation(Base):
    __tablename__ = "movie_translations"

    movie_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("movies.id", ondelete="CASCADE"), primary_key=True
    )
    locale: Mapped[str] = mapped_column(String(6), primary_key=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    movie: Mapped[Movie] = relationship(back_populates="translations")
