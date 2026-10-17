import logging
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, and_, cast, extract, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backend.movies.clients.tmdb import TMDBMovieClient
from app.backend.clubs.models import Club, ClubMember, ClubType
from app.backend.events.models import Event, EventStatus
from app.backend.movies.models import Movie, MovieTranslation
from app.backend.reviews.models import MovieReview
from app.backend.movies.schemas import (
    LibraryClubReference,
    LibraryMovieResponse,
    MovieCreate,
    MovieResponse,
    MovieSearchResult,
    MovieUpdate,
)
from app.backend.library import my_club_item_ids
from app.backend.users.models import Profile
from app.backend.users.router import get_active_profile
from app.core.config import settings
from app.core.database import get_db
from app.core.logging import log_external_error

router = APIRouter(prefix="/movies", tags=["movies"])
movie_client = TMDBMovieClient()
logger = logging.getLogger(__name__)


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
        translations=[
            {"locale": translation.locale, "title": translation.title, "overview": translation.overview}
            for translation in movie.translations
        ],
    )


async def fetch_ukrainian_translation(
    movie_id: str, base_movie: MovieSearchResult
) -> MovieTranslation | None:
    try:
        translated = await movie_client.get_by_id(movie_id, language="uk-UA")
    except RuntimeError:
        return None
    except (httpx.HTTPError, ValueError) as exc:
        configured_key = settings.tmdb_api_key
        log_external_error(
            logger,
            "TMDB Ukrainian translation lookup failed",
            exc,
            secrets=(configured_key.get_secret_value(),) if configured_key else (),
        )
        return None
    if translated is None:
        return None
    if (
        translated.title == base_movie.title
        and translated.overview == base_movie.overview
    ):
        return None
    return MovieTranslation(
        locale="uk-UA",
        title=translated.title if translated.title else None,
        overview=translated.overview or None,
    )


def update_movie_translations(movie: Movie, incoming: list[dict[str, str | None]]) -> None:
    for translation_data in incoming:
        locale = translation_data["locale"]
        title = translation_data.get("title")
        overview = translation_data.get("overview")
        title = title.strip() if title and title.strip() else None
        overview = overview.strip() if overview and overview.strip() else None
        existing = next(
            (translation for translation in movie.translations if translation.locale == locale),
            None,
        )
        if title is None and overview is None:
            if existing is not None:
                movie.translations.remove(existing)
            continue
        if existing is None:
            movie.translations.append(
                MovieTranslation(locale=locale, title=title, overview=overview)
            )
        else:
            existing.title = title
            existing.overview = overview


@router.get("/library", response_model=list[LibraryMovieResponse])
async def list_library_movies(
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
    scope: Literal["all", "mine"] = "all",
    year_from: Annotated[int | None, Query(ge=1000, le=2200)] = None,
    year_to: Annotated[int | None, Query(ge=1000, le=2200)] = None,
    sort: Literal["date_added", "year_released"] = "date_added",
) -> list[LibraryMovieResponse]:
    if year_from is not None and year_to is not None and year_from > year_to:
        raise HTTPException(status_code=422, detail="year_from must be on or before year_to")
    query = select(Movie)
    if scope == "mine":
        query = query.where(
            cast(Movie.id, String).in_(my_club_item_ids(ClubType.MOVIE, profile.id))
        )
    release_year = extract("year", Movie.release_date)
    if year_from is not None:
        query = query.where(release_year >= year_from)
    if year_to is not None:
        query = query.where(release_year <= year_to)
    query = query.order_by(
        Movie.created_at.desc()
        if sort == "date_added"
        else Movie.release_date.desc().nulls_last(),
        Movie.title,
    )
    movies = db.scalars(query).all()
    ratings = dict(
        db.execute(
            select(MovieReview.movie_id, MovieReview.rating).where(
                MovieReview.reviewer_id == profile.id,
                MovieReview.movie_id.in_([movie.id for movie in movies]),
            )
        ).all()
    ) if movies else {}
    library = {
        movie.id: LibraryMovieResponse(
            movie=MovieResponse.model_validate(movie),
            clubs=[],
            my_rating=ratings.get(movie.id),
        )
        for movie in movies
    }
    rows = db.execute(
        select(Movie.id, Club)
        .select_from(Event)
        .join(Movie, Event.linked_item_id == cast(Movie.id, String))
        .join(Club, Club.id == Event.club_id)
        .join(ClubMember, ClubMember.club_id == Club.id)
        .where(
            ClubMember.user_id == profile.id,
            Club.club_type == ClubType.MOVIE,
            Club.deleted_at.is_(None),
            Event.deleted_at.is_(None),
            Event.status != EventStatus.DELETED,
        )
        .order_by(Club.title)
    ).all()
    for movie_id, club in rows:
        entry = library.get(movie_id)
        if entry is not None and all(reference.id != club.id for reference in entry.clubs):
            entry.clubs.append(LibraryClubReference(id=club.id, title=club.title))
    return list(library.values())


@router.patch("/{movie_id}", response_model=MovieResponse)
async def update_movie(
    movie_id: int,
    payload: MovieUpdate,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> MovieResponse:
    if not profile.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can edit movies")
    movie = db.get(Movie, movie_id)
    if movie is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movie not found")
    values = payload.model_dump(exclude_unset=True)
    translations = values.pop("translations", None)
    for field, value in values.items():
        if field in {"title", "original_title"} and value is None:
            raise HTTPException(status_code=422, detail=f"{field} cannot be null")
        setattr(movie, field, value)
    if translations is not None:
        update_movie_translations(movie, translations)
    db.commit()
    db.refresh(movie)
    return MovieResponse.model_validate(movie)


@router.get(
    "",
    response_model=list[MovieSearchResult],
    dependencies=[Depends(get_active_profile)],
)
async def search_movies_by_title(
    title: Annotated[str, Query(min_length=1, max_length=200)],
    db: Annotated[Session, Depends(get_db)],
    year: Annotated[int | None, Query(ge=1870, le=2200)] = None,
    language: Annotated[str, Query(min_length=2, max_length=10)] = "en-US",
    page: Annotated[int, Query(ge=1)] = 1,
    include_tmdb: bool = False,
) -> list[MovieSearchResult]:
    normalized_title = title.strip()
    if not normalized_title:
        raise HTTPException(status_code=422, detail="Title must not be blank")

    saved_movies = db.scalars(
        select(Movie)
        .outerjoin(
            MovieTranslation,
            and_(MovieTranslation.movie_id == Movie.id, MovieTranslation.locale == language),
        )
        .where(
            or_(
                func.lower(Movie.title) == normalized_title.lower(),
                func.lower(MovieTranslation.title) == normalized_title.lower(),
            )
        )
        .distinct()
        .order_by(Movie.id)
    ).all()
    saved_results = [movie_search_result(movie) for movie in saved_movies]
    if saved_results and not include_tmdb:
        return saved_results

    try:
        tmdb_results = await movie_client.search_by_title(
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
        configured_key = settings.tmdb_api_key
        log_external_error(
            logger,
            "TMDB movie search failed",
            exc,
            secrets=(configured_key.get_secret_value(),) if configured_key else (),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to search the movie catalog",
        ) from exc

    if not saved_results:
        return tmdb_results

    saved_external_ids = {movie.external_id for movie in saved_results}
    return saved_results + [
        movie for movie in tmdb_results if movie.external_id not in saved_external_ids
    ]


@router.post("", response_model=MovieResponse)
async def save_selected_movie(
    payload: MovieCreate,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> MovieResponse:
    existing_movie = db.scalar(
        select(Movie).where(
            Movie.provider == "tmdb",
            Movie.external_id == payload.external_id,
        )
    )
    if existing_movie is not None:
        if not any(translation.locale == "uk-UA" for translation in existing_movie.translations):
            translation = await fetch_ukrainian_translation(
                existing_movie.external_id, movie_search_result(existing_movie)
            )
            if translation is not None:
                existing_movie.translations.append(translation)
                db.commit()
                db.refresh(existing_movie)
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
        configured_key = settings.tmdb_api_key
        log_external_error(
            logger,
            "TMDB movie lookup failed",
            exc,
            secrets=(configured_key.get_secret_value(),) if configured_key else (),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to retrieve movie details",
        ) from exc

    if result is None:
        raise HTTPException(status_code=404, detail="Movie not found in TMDB")

    ukrainian_translation = await fetch_ukrainian_translation(
        payload.external_id, result
    )

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
        translations=[ukrainian_translation] if ukrainian_translation else [],
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
        if ukrainian_translation is not None and not any(
            translation.locale == "uk-UA" for translation in existing_movie.translations
        ):
            existing_movie.translations.append(ukrainian_translation)
            db.commit()
            db.refresh(existing_movie)
        return MovieResponse.model_validate(existing_movie)
    db.refresh(movie)
    return MovieResponse.model_validate(movie)
