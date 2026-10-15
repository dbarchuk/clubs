from abc import ABC, abstractmethod

from app.backend.board_games.schemas import BoardGameProviderResult


class BoardGameBaseClient(ABC):
    @abstractmethod
    async def search(self, title: str) -> list[BoardGameProviderResult]:
        """Search a provider and return normalized board game results."""
