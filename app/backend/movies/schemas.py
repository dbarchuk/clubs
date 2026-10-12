from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field


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


class MovieCreate(BaseModel):
    external_id: str = Field(
        min_length=1, max_length=100, pattern=r"^[1-9][0-9]*$"
    )


class MovieResponse(MovieSearchResult):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by: str
    created_at: datetime
    updated_at: datetime
