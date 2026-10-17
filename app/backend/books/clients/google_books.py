from urllib.parse import quote

import httpx
from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError

from app.backend.books.clients.base import BookBaseClient
from app.backend.books.schemas import BookProviderResult
from app.core.config import settings


class GoogleVolumeInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    subtitle: str | None = None
    authors: list[str] = Field(default_factory=list)
    publisher: str | None = None
    publishedDate: str | None = None
    description: str | None = None
    industryIdentifiers: list[dict[str, str]] = Field(default_factory=list)
    pageCount: int | None = None
    categories: list[str] = Field(default_factory=list)
    imageLinks: dict[str, str] = Field(default_factory=dict)
    language: str | None = None
    infoLink: str | None = None
    canonicalVolumeLink: str | None = None
    averageRating: float | None = None
    ratingsCount: int | None = None


class GoogleVolume(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    volumeInfo: GoogleVolumeInfo = Field(default_factory=GoogleVolumeInfo)


class GoogleSearchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    items: list[GoogleVolume] = Field(default_factory=list)


class GoogleBooksClient(BookBaseClient):
    API_URL = "https://www.googleapis.com/books/v1/volumes"

    def __init__(self, api_key: SecretStr | None = None) -> None:
        self._api_key = api_key

    def _key(self) -> SecretStr:
        """Return the API key/access token configured for public Books API calls.

        Despite the environment variable name, Google Books does not accept an
        OAuth client secret as request authentication.
        """
        api_key = self._api_key or settings.google_books_api_secret
        if api_key is None:
            raise RuntimeError("GOOGLE_BOOKS_API_SECRET is not configured")
        return api_key

    async def search(
        self,
        query: str,
        *,
        language: str | None = None,
        start_index: int = 0,
        max_results: int = 10,
    ) -> list[BookProviderResult]:
        normalized_query = query.strip()
        if not normalized_query:
            return []
        if start_index < 0:
            raise ValueError("start_index must be non-negative")
        if not 1 <= max_results <= 40:
            raise ValueError("max_results must be between 1 and 40")
        isbn = normalized_query.replace("-", "").replace(" ", "")
        provider_query = (
            f"isbn:{isbn}"
            if isbn.isdigit() and len(isbn) in {10, 13}
            else normalized_query
        )
        params: dict[str, str | int] = {
            "q": provider_query,
            "printType": "books",
            "startIndex": start_index,
            "maxResults": max_results,
            "key": self._key().get_secret_value(),
        }
        if language in {"en", "uk"}:
            params["langRestrict"] = language
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.API_URL, params=params)
            response.raise_for_status()
        try:
            payload = GoogleSearchResponse.model_validate(response.json())
        except ValidationError as exc:
            raise ValueError("Google Books returned an invalid search response") from exc
        return [self._normalize(volume) for volume in payload.items]

    async def get_by_id(self, external_id: str) -> BookProviderResult | None:
        if not external_id.strip():
            return None
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{self.API_URL}/{quote(external_id, safe='')}",
                params={"key": self._key().get_secret_value()},
            )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        try:
            volume = GoogleVolume.model_validate(response.json())
        except ValidationError as exc:
            raise ValueError("Google Books returned an invalid volume") from exc
        return self._normalize(volume)

    @staticmethod
    def _normalize(volume: GoogleVolume) -> BookProviderResult:
        info = volume.volumeInfo
        identifiers = {
            item.get("type"): item.get("identifier")
            for item in info.industryIdentifiers
        }
        image = info.imageLinks.get("thumbnail") or info.imageLinks.get("smallThumbnail")
        if image and image.startswith("http://"):
            image = "https://" + image.removeprefix("http://")
        return BookProviderResult(
            provider="google_books",
            external_id=volume.id,
            title=(info.title or "Untitled book")[:500],
            subtitle=info.subtitle,
            authors=info.authors,
            publisher=info.publisher,
            published_date=info.publishedDate,
            description=info.description,
            isbn_10=identifiers.get("ISBN_10"),
            isbn_13=identifiers.get("ISBN_13"),
            page_count=info.pageCount if info.pageCount and info.pageCount > 0 else None,
            categories=info.categories,
            language=info.language,
            cover_image_url=image,
            info_url=info.infoLink or info.canonicalVolumeLink,
            provider_average_rating=info.averageRating,
            provider_ratings_count=info.ratingsCount,
        )
