from __future__ import annotations

from datetime import date, datetime, time
from enum import Enum

from sqlalchemy import Date, DateTime, Enum as SqlEnum, ForeignKey, Index, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import UlidMixin


class EventStatus(str, Enum):
    SCHEDULED = "scheduled"
    DELAYED = "delayed"
    CANCELLED = "cancelled"
    HELD = "held"
    DELETED = "deleted"


class Event(UlidMixin, Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_club_start", "club_id", "start_date"),)

    club_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    linked_item_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        SqlEnum(
            EventStatus,
            name="event_status",
            values_callable=lambda values: [value.value for value in values],
        ),
        nullable=False,
        default=EventStatus.SCHEDULED,
    )
    created_by: Mapped[str] = mapped_column(
        String(26), ForeignKey("profiles.id"), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_by: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("profiles.id"), nullable=True
    )
