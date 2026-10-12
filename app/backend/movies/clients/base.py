from abc import ABC, abstractmethod

from app.backend.movies.schemas import MovieSearchResult


class MovieBaseClient(ABC):
    @abstractmethod
    async def search_by_title(
        self,
        title: str,
        *,
        year: int | None = None,
        language: str = "en-US",
        page: int = 1,
    ) -> list[MovieSearchResult]:
        """Search the provider catalog and return normalized movie results."""

    @abstractmethod
    async def get_by_id(
        self,
        external_id: str,
        *,
        language: str = "en-US",
    ) -> MovieSearchResult | None:
        """Fetch authoritative details for a selected provider result."""

