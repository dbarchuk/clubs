"""add club invite codes, deletion requests, and soft deletion

Revision ID: 000002
Revises: 000001
Create Date: 2026-10-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "000002"
down_revision: Union[str, None] = "000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clubs", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("clubs", sa.Column("deleted_by", sa.String(length=26), nullable=True))
    op.create_foreign_key(
        "fk_clubs_deleted_by_profiles",
        "clubs",
        "profiles",
        ["deleted_by"],
        ["id"],
    )
    op.create_table(
        "club_invite_codes",
        sa.Column("club_id", sa.String(length=26), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.String(length=26), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_by", sa.String(length=26), nullable=True),
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["profiles.id"]),
        sa.ForeignKeyConstraint(["revoked_by"], ["profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_hash"),
    )
    op.create_index(
        "ix_club_invite_codes_club_id", "club_invite_codes", ["club_id"]
    )
    op.create_index(
        "uq_club_invite_codes_one_active_per_club",
        "club_invite_codes",
        ["club_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
        sqlite_where=sa.text("revoked_at IS NULL"),
    )
    op.create_table(
        "club_deletion_requests",
        sa.Column("club_id", sa.String(length=26), nullable=False),
        sa.Column("requested_by", sa.String(length=26), nullable=False),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reviewed_by", sa.String(length=26), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.String(length=26), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_club_deletion_requests_status",
        ),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["profiles.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_club_deletion_requests_status", "club_deletion_requests", ["status"]
    )
    op.create_index(
        "uq_club_deletion_requests_one_pending_per_club",
        "club_deletion_requests",
        ["club_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_club_deletion_requests_one_pending_per_club",
        table_name="club_deletion_requests",
    )
    op.drop_index("ix_club_deletion_requests_status", table_name="club_deletion_requests")
    op.drop_table("club_deletion_requests")
    op.drop_index("ix_club_invite_codes_club_id", table_name="club_invite_codes")
    op.drop_index(
        "uq_club_invite_codes_one_active_per_club", table_name="club_invite_codes"
    )
    op.drop_table("club_invite_codes")
    op.drop_constraint("fk_clubs_deleted_by_profiles", "clubs", type_="foreignkey")
    op.drop_column("clubs", "deleted_by")
    op.drop_column("clubs", "deleted_at")
