from __future__ import annotations

from enum import Enum

from sqlalchemy import Boolean, Enum as SqlEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import OwnedModelMixin, TimestampMixin, UlidMixin


class ClubType(str, Enum):
    BOOK = "book"
    MOVIE = "movie"
    SPORT = "sport"
    BOARD_GAMES = "board_games"


class ClubMemberAccessType(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MODERATOR = "moderator"
    MEMBER = "member"


class Club(UlidMixin, TimestampMixin, OwnedModelMixin, Base):
    __tablename__ = "clubs"

    club_type: Mapped[ClubType] = mapped_column(
        SqlEnum(
            ClubType,
            name="club_type",
            values_callable=lambda types: [club_type.value for club_type in types],
        ),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(50), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    creator: Mapped[Profile] = relationship(
        foreign_keys="Club.created_by", back_populates="created_clubs"
    )
    memberships: Mapped[list[ClubMember]] = relationship(
        back_populates="club", cascade="all, delete-orphan"
    )


class ClubMember(Base):
    __tablename__ = "club_members"

    club_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("clubs.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    access_type: Mapped[ClubMemberAccessType] = mapped_column(
        SqlEnum(
            ClubMemberAccessType,
            name="club_member_access_type",
            values_callable=lambda types: [access_type.value for access_type in types],
        ),
        nullable=False,
        default=ClubMemberAccessType.MEMBER,
    )
    club: Mapped[Club] = relationship(back_populates="memberships")
    user: Mapped[Profile] = relationship(back_populates="club_memberships")
