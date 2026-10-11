from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from app.backend.clubs.models import ClubType


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


class ClubCreate(BaseModel):
    club_type: ClubType
    title: str = Field(min_length=1, max_length=50)
    avatar_url: HttpUrl | None = None
    is_public: bool = False

    @field_validator("title")
    @classmethod
    def strip_title(cls, title: str) -> str:
        title = title.strip()
        if not title:
            raise ValueError("Title must not be blank")
        return title


class ClubResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    club_type: ClubType
    title: str
    avatar_url: str | None
    is_public: bool
    created_by: str
    created_at: datetime
    updated_at: datetime


class PaginatedClubs(BaseModel):
    items: list[ClubResponse]
    page: int
    size: int
    has_more: bool
