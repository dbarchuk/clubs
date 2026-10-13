from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import OwnedModelMixin


board_game_type_links = Table(
    "board_game_type_links",
    Base.metadata,
    Column(
        "board_game_id",
        ForeignKey("board_games.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "board_game_type_id",
        ForeignKey("board_game_types.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class BoardGameType(Base):
    __tablename__ = "board_game_types"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    games: Mapped[list["BoardGame"]] = relationship(
        secondary=board_game_type_links, back_populates="game_types"
    )


class BoardGame(OwnedModelMixin, Base):
    __tablename__ = "board_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    game_types: Mapped[list[BoardGameType]] = relationship(
        secondary=board_game_type_links,
        back_populates="games",
        order_by=BoardGameType.id,
    )
    year_published: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_players: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_players: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
