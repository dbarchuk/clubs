from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


CatalogType = Literal["books", "movies", "board-games"]


class ReviewUpsert(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=10)
    body: str | None = Field(default=None, max_length=5000)
    is_public: bool = False

    @model_validator(mode="after")
    def require_content(self) -> "ReviewUpsert":
        if self.body is not None:
            self.body = self.body.strip() or None
        if self.rating is None and self.body is None:
            raise ValueError("A review must include a rating or text")
        return self


class ReviewResponse(BaseModel):
    id: int
    item_id: int
    reviewer_id: str
    reviewer_name: str
    rating: int | None
    body: str | None
    is_public: bool
    is_mine: bool
    created_at: datetime
    updated_at: datetime


class ReviewListResponse(BaseModel):
    reviews: list[ReviewResponse]
    average_rating: float | None
