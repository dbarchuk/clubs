from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import OwnedModelMixin


class BoardGame(OwnedModelMixin, Base):
    __tablename__ = "board_games"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    year_published: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_players: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_players: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    translations: Mapped[list["BoardGameTranslation"]] = relationship(
        back_populates="board_game", cascade="all, delete-orphan", passive_deletes=True
    )


class BoardGameTranslation(Base):
    __tablename__ = "board_game_translations"

    board_game_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("board_games.id", ondelete="CASCADE"), primary_key=True
    )
    locale: Mapped[str] = mapped_column(String(6), primary_key=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    board_game: Mapped[BoardGame] = relationship(back_populates="translations")
