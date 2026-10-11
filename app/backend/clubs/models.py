from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
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
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_by: Mapped[str | None] = mapped_column(
        String(26),
        ForeignKey("profiles.id", name="fk_clubs_deleted_by_profiles"),
        nullable=True,
    )
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


class ClubInviteCode(UlidMixin, Base):
    __tablename__ = "club_invite_codes"
    __table_args__ = (
        Index("ix_club_invite_codes_club_id", "club_id"),
        Index(
            "uq_club_invite_codes_one_active_per_club",
            "club_id",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
            sqlite_where=text("revoked_at IS NULL"),
        ),
    )

    club_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    code: Mapped[str | None] = mapped_column(String(8), nullable=True)
    created_by: Mapped[str] = mapped_column(
        String(26), ForeignKey("profiles.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_by: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("profiles.id"), nullable=True
    )


class ClubDeletionRequest(UlidMixin, Base):
    __tablename__ = "club_deletion_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_club_deletion_requests_status",
        ),
        Index("ix_club_deletion_requests_status", "status"),
        Index(
            "uq_club_deletion_requests_one_pending_per_club",
            "club_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
            sqlite_where=text("status = 'pending'"),
        ),
    )

    club_id: Mapped[str] = mapped_column(
        String(26), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    requested_by: Mapped[str] = mapped_column(
        String(26), ForeignKey("profiles.id"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC).replace(tzinfo=None)
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    reviewed_by: Mapped[str | None] = mapped_column(
        String(26), ForeignKey("profiles.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    club: Mapped[Club] = relationship()
    requester: Mapped[Profile] = relationship(foreign_keys=[requested_by])
