from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backend.movies.clients.tmdb import TMDBMovieClient
from app.backend.movies.models import Movie
from app.backend.movies.schemas import MovieCreate, MovieResponse, MovieSearchResult
from app.backend.users.models import Profile
from app.backend.users.router import get_current_profile
from app.core.database import get_db

router = APIRouter(prefix="/movies", tags=["movies"])
movie_client = TMDBMovieClient()


def movie_search_result(movie: Movie) -> MovieSearchResult:
    return MovieSearchResult(
        id=movie.id,
        provider=movie.provider,
        external_id=movie.external_id,
        title=movie.title,
        original_title=movie.original_title,
        overview=movie.overview or "",
        release_date=movie.release_date,
        cover_image_url=movie.cover_image_url,
        backdrop_image_url=movie.backdrop_image_url,
        original_language=movie.original_language,
        popularity=movie.popularity,
        vote_average=movie.vote_average,
    )


@router.get(
    "",
    response_model=list[MovieSearchResult],
    dependencies=[Depends(get_current_profile)],
)
async def search_movies_by_title(
    title: Annotated[str, Query(min_length=1, max_length=200)],
    db: Annotated[Session, Depends(get_db)],
    year: Annotated[int | None, Query(ge=1870, le=2200)] = None,
    language: Annotated[str, Query(min_length=2, max_length=10)] = "en-US",
    page: Annotated[int, Query(ge=1)] = 1,
) -> list[MovieSearchResult]:
    normalized_title = title.strip()
    if not normalized_title:
        raise HTTPException(status_code=422, detail="Title must not be blank")

    saved_movies = db.scalars(
        select(Movie)
        .where(func.lower(Movie.title) == normalized_title.lower())
        .order_by(Movie.id)
    ).all()
    if saved_movies:
        return [movie_search_result(movie) for movie in saved_movies]

    try:
        return await movie_client.search_by_title(
            normalized_title,
            year=year,
            language=language,
            page=page,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Movie catalog is not configured",
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to search the movie catalog",
        ) from exc


@router.post("", response_model=MovieResponse)
async def save_selected_movie(
    payload: MovieCreate,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> MovieResponse:
    existing_movie = db.scalar(
        select(Movie).where(
            Movie.provider == "tmdb",
            Movie.external_id == payload.external_id,
        )
    )
    if existing_movie is not None:
        return MovieResponse.model_validate(existing_movie)

    try:
        result = await movie_client.get_by_id(payload.external_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Movie catalog is not configured",
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid TMDB movie ID",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to retrieve movie details",
        ) from exc

    if result is None:
        raise HTTPException(status_code=404, detail="Movie not found in TMDB")

    movie = Movie(
        provider=result.provider,
        external_id=result.external_id,
        title=result.title,
        original_title=result.original_title,
        overview=result.overview,
        release_date=result.release_date,
        cover_image_url=result.cover_image_url,
        backdrop_image_url=result.backdrop_image_url,
        original_language=result.original_language,
        popularity=result.popularity,
        vote_average=result.vote_average,
        created_by=profile.id,
    )
    db.add(movie)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing_movie = db.scalar(
            select(Movie).where(
                Movie.provider == "tmdb",
                Movie.external_id == payload.external_id,
            )
        )
        if existing_movie is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Movie could not be saved",
            )
        return MovieResponse.model_validate(existing_movie)
    db.refresh(movie)
    return MovieResponse.model_validate(movie)
