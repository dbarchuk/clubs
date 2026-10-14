from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field


class MovieTranslationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    locale: str
    title: str | None
    overview: str | None


class MovieTranslationInput(BaseModel):
    locale: str = Field(min_length=2, max_length=6, pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$")
    title: str | None = Field(default=None, max_length=500)
    overview: str | None = None


class MovieSearchResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: int | None = None
    provider: str
    external_id: str
    title: str
    original_title: str
    overview: str | None
    release_date: date | None
    cover_image_url: str | None
    backdrop_image_url: str | None
    original_language: str | None
    popularity: float | None
    vote_average: float | None
    translations: list[MovieTranslationResponse] = Field(default_factory=list)


class MovieCreate(BaseModel):
    external_id: str = Field(
        min_length=1, max_length=100, pattern=r"^[1-9][0-9]*$"
    )


class MovieUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    original_title: str | None = Field(default=None, min_length=1, max_length=500)
    overview: str | None = None
    release_date: date | None = None
    cover_image_url: str | None = None
    backdrop_image_url: str | None = None
    original_language: str | None = Field(default=None, max_length=10)
    translations: list[MovieTranslationInput] | None = None


class MovieResponse(MovieSearchResult):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by: str
    created_at: datetime
    updated_at: datetime


class LibraryClubReference(BaseModel):
    id: str
    title: str


class LibraryMovieResponse(BaseModel):
    movie: MovieResponse
    clubs: list[LibraryClubReference]
