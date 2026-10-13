from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

BoardGameTypeId = Literal[
    "eurogame",
    "ameritrash",
    "cooperative",
    "party",
    "social_deduction",
    "abstract",
    "deck_building",
    "area_control",
    "legacy_campaign",
]


class BoardGameCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    game_type_ids: list[BoardGameTypeId] = Field(default_factory=list, max_length=9)
    year_published: int | None = Field(default=None, ge=1000, le=2200)
    description: str | None = None
    min_players: int | None = Field(default=None, ge=1)
    max_players: int | None = Field(default=None, ge=1)
    min_age: int | None = Field(default=None, ge=0)
    cover_image_url: HttpUrl | None = None

    @model_validator(mode="after")
    def validate_player_range(self) -> "BoardGameCreate":
        if (
            self.min_players is not None
            and self.max_players is not None
            and self.max_players < self.min_players
        ):
            raise ValueError("max_players must be greater than or equal to min_players")
        return self


class BoardGameTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: BoardGameTypeId
    name: str
    description: str


class BoardGameResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    game_types: list[BoardGameTypeResponse]
    year_published: int | None
    description: str | None
    min_players: int | None
    max_players: int | None
    min_age: int | None
    cover_image_url: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
