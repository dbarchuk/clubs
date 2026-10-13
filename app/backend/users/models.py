from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.core.database import Base
from app.core.models import UlidMixin

if TYPE_CHECKING:
    from app.backend.clubs.models import Club, ClubMember


class Profile(UlidMixin, Base):
    __tablename__ = "profiles"

    user_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    created_clubs: Mapped[list[Club]] = relationship(
        foreign_keys="Club.created_by", back_populates="creator"
    )
    club_memberships: Mapped[list[ClubMember]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @validates("email")
    def normalize_email(self, _key: str, email: str) -> str:
        return email.strip().lower()

    def __repr__(self) -> str:
        return f"<Profile(id={self.id}, display_name={self.display_name})>"
