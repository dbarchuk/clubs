from abc import ABC, abstractmethod

from app.backend.books.schemas import BookProviderResult


class BookBaseClient(ABC):
    @abstractmethod
    async def search(
        self,
        query: str,
        *,
        language: str | None = None,
        start_index: int = 0,
        max_results: int = 10,
    ) -> list[BookProviderResult]:
        """Search the provider and return normalized book results."""

    @abstractmethod
    async def get_by_id(self, external_id: str) -> BookProviderResult | None:
        """Fetch authoritative metadata for a provider volume."""
