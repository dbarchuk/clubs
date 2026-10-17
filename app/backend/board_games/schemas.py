from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class BoardGameTranslationCreate(BaseModel):
    locale: str = Field(min_length=2, max_length=6, pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$")
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None


class BoardGameTranslationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    locale: str
    title: str | None
    description: str | None


class BoardGameCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    year_published: int | None = Field(default=None, ge=1000, le=2200)
    description: str | None = None
    min_players: int | None = Field(default=None, ge=1)
    max_players: int | None = Field(default=None, ge=1)
    cover_image_url: HttpUrl | None = None
    translations: list[BoardGameTranslationCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_player_range(self) -> "BoardGameCreate":
        if (
            self.min_players is not None
            and self.max_players is not None
            and self.max_players < self.min_players
        ):
            raise ValueError("max_players must be greater than or equal to min_players")
        locales: set[str] = set()
        for translation in self.translations:
            if translation.locale in locales:
                raise ValueError("translation locales must be unique")
            locales.add(translation.locale)
            if not (translation.title and translation.title.strip()) and not (
                translation.description and translation.description.strip()
            ):
                raise ValueError("each translation must include a title or description")
        return self


class BoardGameUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    year_published: int | None = Field(default=None, ge=1000, le=2200)
    description: str | None = None
    min_players: int | None = Field(default=None, ge=1)
    max_players: int | None = Field(default=None, ge=1)
    cover_image_url: HttpUrl | None = None
    translations: list[BoardGameTranslationCreate] | None = None

    @model_validator(mode="after")
    def validate_translations(self) -> "BoardGameUpdate":
        if self.translations is None:
            return self
        locales: set[str] = set()
        for translation in self.translations:
            if translation.locale in locales:
                raise ValueError("translation locales must be unique")
            locales.add(translation.locale)
        return self


class BoardGameResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    year_published: int | None
    description: str | None
    min_players: int | None
    max_players: int | None
    cover_image_url: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    translations: list[BoardGameTranslationResponse] = Field(default_factory=list)


class BoardGameProviderResult(BaseModel):
    """A search hit from an external board game catalog, not yet saved locally."""

    id: None = None
    provider: Literal["geekach"]
    external_id: str
    title: str
    cover_image_url: str | None = None
    product_url: str
    price: float | None = None
    in_stock: bool | None = None


class BoardGameClubReference(BaseModel):
    id: str
    title: str


class LibraryBoardGameResponse(BaseModel):
    board_game: BoardGameResponse
    clubs: list[BoardGameClubReference]
    my_rating: int | None = None
