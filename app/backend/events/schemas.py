from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

from app.backend.events.models import EventStatus
from app.backend.board_games.schemas import BoardGameResponse
from app.backend.books.schemas import BookResponse
from app.backend.movies.schemas import MovieResponse


class EventCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    linked_item_id: str | None = Field(default=None, max_length=100)
    avatar_url: HttpUrl | None = None
    start_date: date | None = None
    end_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "EventCreate":
        if self.start_date is not None and self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("End date must be on or after start date")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Start and end times must both be provided")
        if self.start_date == self.end_date and self.start_time and self.end_time:
            if self.end_time < self.start_time:
                raise ValueError("End time must not be before start time")
        if self.title is not None:
            self.title = self.title.strip() or None
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    linked_item_id: str | None = Field(default=None, max_length=100)
    avatar_url: HttpUrl | None = None
    start_date: date | None = None
    end_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    status: Literal["scheduled", "delayed", "cancelled", "held"] | None = None

    @model_validator(mode="after")
    def require_changes(self) -> "EventUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        for required_field in ("status",):
            if required_field in self.model_fields_set and getattr(self, required_field) is None:
                raise ValueError(f"{required_field} must not be null")
        if self.title is not None:
            self.title = self.title.strip() or None
        return self


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    club_id: str
    title: str | None
    linked_item_id: str | None
    linked_movie: MovieResponse | None = None
    linked_board_game: BoardGameResponse | None = None
    linked_book: BookResponse | None = None
    my_rating: int | None = None
    avatar_url: str | None
    start_date: date | None
    end_date: date | None
    start_time: time | None
    end_time: time | None
    status: EventStatus
    created_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    deleted_by: str | None
