"""store active invite codes for club managers

Revision ID: 000003
Revises: 000002
Create Date: 2026-10-11
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "000003"
down_revision: Union[str, None] = "000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("club_invite_codes", sa.Column("code", sa.String(length=8), nullable=True))


def downgrade() -> None:
    op.drop_column("club_invite_codes", "code")
