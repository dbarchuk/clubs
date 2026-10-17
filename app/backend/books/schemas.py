from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BookTranslationInput(BaseModel):
    locale: str = Field(min_length=2, max_length=6, pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$")
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None


class BookTranslationResponse(BookTranslationInput):
    model_config = ConfigDict(from_attributes=True)


class BookProviderResult(BaseModel):
    id: int | None = None
    provider: str = "google_books"
    external_id: str
    title: str
    subtitle: str | None = None
    authors: list[str] = Field(default_factory=list)
    publisher: str | None = None
    published_date: str | None = None
    description: str | None = None
    isbn_10: str | None = None
    isbn_13: str | None = None
    page_count: int | None = None
    categories: list[str] = Field(default_factory=list)
    language: str | None = None
    cover_image_url: str | None = None
    info_url: str | None = None
    provider_average_rating: float | None = None
    provider_ratings_count: int | None = None
    average_rating: float | None = None
    translations: list[BookTranslationResponse] = Field(default_factory=list)


class BookCreate(BaseModel):
    external_id: str = Field(min_length=1, max_length=150)


class BookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    authors: list[str] | None = None
    publisher: str | None = Field(default=None, max_length=500)
    published_date: str | None = Field(default=None, max_length=10)
    description: str | None = None
    isbn_10: str | None = Field(default=None, max_length=20)
    isbn_13: str | None = Field(default=None, max_length=20)
    page_count: int | None = Field(default=None, gt=0)
    categories: list[str] | None = None
    language: str | None = Field(default=None, max_length=10)
    cover_image_url: str | None = None
    info_url: str | None = None
    translations: list[BookTranslationInput] | None = None


class BookResponse(BookProviderResult):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by: str
    created_at: datetime
    updated_at: datetime


class BookClubReference(BaseModel):
    id: str
    title: str


class LibraryBookResponse(BaseModel):
    book: BookResponse
    clubs: list[BookClubReference]
