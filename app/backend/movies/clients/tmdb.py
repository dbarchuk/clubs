from datetime import date

import httpx
from pydantic import BaseModel, ConfigDict, SecretStr, ValidationError

from app.backend.movies.clients.base import MovieBaseClient
from app.backend.movies.schemas import MovieSearchResult
from app.core.config import settings


class TMDBMovieResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    title: str
    original_title: str
    overview: str | None = None
    release_date: str | None = None
    poster_path: str | None = None
    backdrop_path: str | None = None
    original_language: str | None = None
    popularity: float | None = None
    vote_average: float | None = None


class TMDBSearchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    results: list[TMDBMovieResult]


class TMDBMovieClient(MovieBaseClient):
    API_URL = "https://api.themoviedb.org/3/search/movie"
    DETAIL_URL = "https://api.themoviedb.org/3/movie/{movie_id}"
    IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500"

    def __init__(self, api_key: SecretStr | None = None) -> None:
        self._api_key = api_key

    async def search_by_title(
        self,
        title: str,
        *,
        year: int | None = None,
        language: str = "en-US",
        page: int = 1,
    ) -> list[MovieSearchResult]:
        normalized_title = title.strip()
        if not normalized_title:
            return []
        if page < 1:
            raise ValueError("page must be greater than or equal to 1")

        api_key = self._api_key or settings.tmdb_api_key
        if api_key is None:
            raise RuntimeError("TMDB_API_KEY is not configured")

        params: dict[str, str | int | bool] = {
            "api_key": api_key.get_secret_value(),
            "query": normalized_title,
            "include_adult": False,
            "language": language,
            "page": page,
        }
        if year is not None:
            params["primary_release_year"] = year

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(self.API_URL, params=params)
            response.raise_for_status()

        try:
            payload = TMDBSearchResponse.model_validate(response.json())
        except ValidationError as exc:
            raise ValueError("TMDB returned an invalid movie search response") from exc

        return [self._normalize_result(result) for result in payload.results]

    async def get_by_id(
        self,
        external_id: str,
        *,
        language: str = "en-US",
    ) -> MovieSearchResult | None:
        api_key = self._api_key or settings.tmdb_api_key
        if api_key is None:
            raise RuntimeError("TMDB_API_KEY is not configured")
        if not external_id.isdecimal() or int(external_id) < 1:
            raise ValueError("TMDB movie ID must be a positive integer")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                self.DETAIL_URL.format(movie_id=int(external_id)),
                params={"api_key": api_key.get_secret_value(), "language": language},
            )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        try:
            result = TMDBMovieResult.model_validate(response.json())
        except ValidationError as exc:
            raise ValueError("TMDB returned an invalid movie response") from exc
        return self._normalize_result(result)

    @classmethod
    def _normalize_result(cls, result: TMDBMovieResult) -> MovieSearchResult:
        release_date = (
            date.fromisoformat(result.release_date) if result.release_date else None
        )
        return MovieSearchResult(
            provider="tmdb",
            external_id=str(result.id),
            title=result.title,
            original_title=result.original_title,
            overview=result.overview or "",
            release_date=release_date,
            cover_image_url=cls._image_url(result.poster_path),
            backdrop_image_url=cls._image_url(result.backdrop_path),
            original_language=result.original_language,
            popularity=result.popularity,
            vote_average=result.vote_average,
        )

    @classmethod
    def _image_url(cls, path: str | None) -> str | None:
        if not path:
            return None
        return f"{cls.IMAGE_BASE_URL}{path}"
