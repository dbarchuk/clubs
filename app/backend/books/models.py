from sqlalchemy import (
    CheckConstraint,
    Float,
    ForeignKey,
    Integer,
    JSON,
    Select,
    String,
    Text,
    UniqueConstraint,
    func,
    select,
)
from sqlalchemy.orm import Mapped, mapped_column, query_expression, relationship, with_expression

from app.backend.reviews.models import BookReview
from app.core.database import Base
from app.core.models import OwnedModelMixin


class Book(OwnedModelMixin, Base):
    __tablename__ = "books"
    __table_args__ = (
        UniqueConstraint(
            "provider", "external_id", name="uq_books_provider_external_id"
        ),
        CheckConstraint(
            "page_count IS NULL OR page_count > 0",
            name="ck_books_page_count_positive",
        ),
        CheckConstraint(
            "provider_average_rating IS NULL OR provider_average_rating BETWEEN 0 AND 5",
            name="ck_books_provider_rating_range",
        ),
        CheckConstraint(
            "provider_ratings_count IS NULL OR provider_ratings_count >= 0",
            name="ck_books_provider_ratings_count_nonnegative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(
        String(50), nullable=False, default="google_books"
    )
    external_id: Mapped[str] = mapped_column(String(150), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    subtitle: Mapped[str | None] = mapped_column(String(500), nullable=True)
    authors: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    publisher: Mapped[str | None] = mapped_column(String(500), nullable=True)
    published_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    isbn_10: Mapped[str | None] = mapped_column(String(20), nullable=True)
    isbn_13: Mapped[str | None] = mapped_column(String(20), nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    categories: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    info_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_average_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    provider_ratings_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    average_rating: Mapped[float | None] = query_expression()
    translations: Mapped[list["BookTranslation"]] = relationship(
        back_populates="book", cascade="all, delete-orphan", passive_deletes=True
    )
    reviews: Mapped[list[BookReview]] = relationship(
        back_populates="book", cascade="all, delete-orphan", passive_deletes=True
    )

    @classmethod
    def with_average_rating(cls, statement: Select) -> Select:
        average_rating = (
            select(func.avg(BookReview.rating))
            .where(BookReview.book_id == cls.id, BookReview.is_public.is_(True))
            .correlate_except(BookReview)
            .scalar_subquery()
        )
        return statement.options(with_expression(cls.average_rating, average_rating))


class BookTranslation(Base):
    __tablename__ = "book_translations"

    book_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("books.id", ondelete="CASCADE"), primary_key=True
    )
    locale: Mapped[str] = mapped_column(String(6), primary_key=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    book: Mapped[Book] = relationship(back_populates="translations")
