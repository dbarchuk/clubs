import logging
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.backend.books.clients import GoogleBooksClient
from app.backend.books.localization import (
    UKRAINIAN_LOCALE,
    is_ukrainian_language,
    is_ukrainian_text,
)
from app.backend.books.models import Book, BookTranslation
from app.backend.reviews.models import BookReview
from app.backend.books.schemas import (
    BookClubReference,
    BookCreate,
    BookProviderResult,
    BookResponse,
    BookUpdate,
    LibraryBookResponse,
)
from app.backend.library import my_club_item_ids
from app.backend.clubs.models import Club, ClubMember, ClubType
from app.backend.events.models import Event, EventStatus
from app.backend.users.models import Profile
from app.backend.users.router import get_active_profile
from app.core.config import settings
from app.core.database import get_db
from app.core.logging import log_external_error

router = APIRouter(prefix="/books", tags=["books"])
google_books_client = GoogleBooksClient()
logger = logging.getLogger(__name__)


def google_books_error_detail(status_code: int) -> str:
    if status_code == 503:
        return "Google Books is temporarily unavailable. Please try again later."
    if status_code in {400, 401, 403}:
        return (
            "Google Books rejected the request. Check that "
            "GOOGLE_BOOKS_API_SECRET contains a Google Books API key or OAuth access token, "
            "that the Books API is enabled, and that the credential permits server requests."
        )
    if status_code == 429:
        return "Google Books API quota was exceeded. Try again later."
    return "Google Books search is temporarily unavailable"


def google_books_error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.reason_phrase or "No provider error message"

    provider_error = body.get("error") if isinstance(body, dict) else None
    message = provider_error.get("message") if isinstance(provider_error, dict) else None
    if not isinstance(message, str) or not message.strip():
        return response.reason_phrase or "No provider error message"

    configured_secret = settings.google_books_api_secret
    if configured_secret is not None:
        secret_value = configured_secret.get_secret_value()
        if secret_value:
            message = message.replace(secret_value, "[REDACTED]")
    return message


@router.get("", response_model=list[BookResponse | BookProviderResult])
async def search_books(
    query: Annotated[str, Query(min_length=1, max_length=200)],
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
    search_provider: bool = False,
    language: str | None = Query(default=None, pattern=r"^(en|uk)$"),
    start_index: int = Query(default=0, ge=0),
    max_results: int = Query(default=10, ge=1, le=40),
) -> list[BookResponse | BookProviderResult]:
    del profile
    normalized_query = query.strip()
    if not normalized_query:
        raise HTTPException(status_code=422, detail="Query must not be blank")

    pattern = f"%{normalized_query.lower()}%"
    local_books = db.scalars(
        select(Book)
        .options(selectinload(Book.translations))
        .where(
            or_(
                func.lower(Book.title).like(pattern),
                Book.translations.any(
                    func.lower(BookTranslation.title).like(pattern)
                ),
                func.lower(cast(Book.authors, String)).like(pattern),
                func.lower(Book.isbn_10) == normalized_query.lower(),
                func.lower(Book.isbn_13) == normalized_query.lower(),
            )
        )
        .order_by(Book.title, Book.published_date)
    ).all()
    local_results = [BookResponse.model_validate(book) for book in local_books]
    if not search_provider:
        return local_results

    try:
        provider_results = await google_books_client.search(
            normalized_query,
            language=language,
            start_index=start_index,
            max_results=max_results,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        provider_message = google_books_error_message(exc.response)
        configured_secret = settings.google_books_api_secret
        log_external_error(
            logger,
            f"Google Books search returned HTTP {status_code}: {provider_message}",
            exc,
            secrets=(
                configured_secret.get_secret_value(),
            ) if configured_secret is not None else (),
        )
        if not local_results:
            raise HTTPException(
                status_code=status_code,
                detail=google_books_error_detail(status_code),
            ) from exc
        provider_results = []
    except (httpx.HTTPError, ValueError) as exc:
        configured_secret = settings.google_books_api_secret
        log_external_error(
            logger,
            "Google Books search failed",
            exc,
            secrets=(
                configured_secret.get_secret_value(),
            ) if configured_secret is not None else (),
        )
        if not local_results:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google Books search is temporarily unavailable",
            ) from exc
        provider_results = []
    saved_external_ids = {book.external_id for book in local_books if book.provider == "google_books"}
    return [
        *local_results,
        *(book for book in provider_results if book.external_id not in saved_external_ids),
    ]


@router.get("/library", response_model=list[LibraryBookResponse])
async def list_library_books(
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
    scope: Literal["all", "mine"] = "all",
    year_from: Annotated[int | None, Query(ge=1000, le=2200)] = None,
    year_to: Annotated[int | None, Query(ge=1000, le=2200)] = None,
    sort: Literal["date_added", "year_released"] = "date_added",
) -> list[LibraryBookResponse]:
    if year_from is not None and year_to is not None and year_from > year_to:
        raise HTTPException(status_code=422, detail="year_from must be on or before year_to")
    query = select(Book).options(selectinload(Book.translations))
    if scope == "mine":
        query = query.where(
            cast(Book.id, String).in_(my_club_item_ids(ClubType.BOOK, profile.id))
        )
    if year_from is not None:
        query = query.where(Book.published_date >= str(year_from))
    if year_to is not None:
        query = query.where(Book.published_date < str(year_to + 1))
    query = query.order_by(
        Book.created_at.desc()
        if sort == "date_added"
        else Book.published_date.desc().nulls_last(),
        Book.title,
    )
    books = db.scalars(query).all()
    ratings = dict(
        db.execute(
            select(BookReview.book_id, BookReview.rating).where(
                BookReview.reviewer_id == profile.id,
                BookReview.book_id.in_([book.id for book in books]),
            )
        ).all()
    ) if books else {}
    library = {
        book.id: LibraryBookResponse(
            book=BookResponse.model_validate(book),
            clubs=[],
            my_rating=ratings.get(book.id),
        )
        for book in books
    }
    rows = db.execute(
        select(Book.id, Club)
        .select_from(Event)
        .join(Book, Event.linked_item_id == cast(Book.id, String))
        .join(Club, Club.id == Event.club_id)
        .join(ClubMember, ClubMember.club_id == Club.id)
        .where(
            ClubMember.user_id == profile.id,
            Club.club_type == ClubType.BOOK,
            Club.deleted_at.is_(None),
            Event.deleted_at.is_(None),
            Event.status != EventStatus.DELETED,
        )
        .order_by(Club.title)
    ).all()
    for book_id, club in rows:
        entry = library.get(book_id)
        if entry is not None and all(reference.id != club.id for reference in entry.clubs):
            entry.clubs.append(BookClubReference(id=club.id, title=club.title))
    return list(library.values())


@router.post("", response_model=BookResponse, status_code=status.HTTP_201_CREATED)
async def save_selected_book(
    payload: BookCreate,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> BookResponse:
    existing = db.scalar(
        select(Book)
        .options(selectinload(Book.translations))
        .where(Book.provider == "google_books", Book.external_id == payload.external_id)
    )
    if existing is not None:
        return BookResponse.model_validate(existing)
    try:
        provider_book = await google_books_client.get_by_id(payload.external_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        provider_message = google_books_error_message(exc.response)
        status_code = exc.response.status_code
        configured_secret = settings.google_books_api_secret
        log_external_error(
            logger,
            f"Google Books volume lookup returned HTTP {status_code}: {provider_message}",
            exc,
            secrets=(
                configured_secret.get_secret_value(),
            ) if configured_secret is not None else (),
        )
        raise HTTPException(
            status_code=status_code,
            detail=google_books_error_detail(status_code),
        ) from exc
    except (httpx.HTTPError, ValueError) as exc:
        configured_secret = settings.google_books_api_secret
        log_external_error(
            logger,
            "Google Books volume lookup failed",
            exc,
            secrets=(
                configured_secret.get_secret_value(),
            ) if configured_secret is not None else (),
        )
        raise HTTPException(status_code=502, detail="Unable to load the Google Books volume") from exc
    if provider_book is None:
        raise HTTPException(status_code=404, detail="Google Books volume not found")

    values = provider_book.model_dump(
        exclude={"id", "average_rating", "translations", "provider"}
    )
    book = Book(provider="google_books", **values, created_by=profile.id)
    metadata_is_ukrainian = is_ukrainian_language(provider_book.language)
    ukrainian_title = metadata_is_ukrainian or is_ukrainian_text(provider_book.title)
    ukrainian_description = metadata_is_ukrainian or is_ukrainian_text(
        provider_book.description
    )
    if ukrainian_title or ukrainian_description:
        # Keep the provider's primary values intact and also expose their
        # Ukrainian version to localized clients. For Ukrainian-only volumes,
        # the provider title already serves as both the base and uk-UA title.
        book.translations.append(
            BookTranslation(
                locale=UKRAINIAN_LOCALE,
                title=provider_book.title if ukrainian_title else None,
                description=(
                    provider_book.description if ukrainian_description else None
                ),
            )
        )
    db.add(book)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        existing = db.scalar(
            select(Book)
            .options(selectinload(Book.translations))
            .where(Book.provider == "google_books", Book.external_id == payload.external_id)
        )
        if existing is not None:
            return BookResponse.model_validate(existing)
        raise HTTPException(status_code=409, detail="Book could not be saved") from exc
    db.refresh(book)
    return BookResponse.model_validate(book)


@router.patch("/{book_id}", response_model=BookResponse)
async def update_book(
    book_id: int,
    payload: BookUpdate,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> BookResponse:
    if not profile.is_admin:
        raise HTTPException(status_code=403, detail="Only admins can edit books")
    book = db.scalar(
        select(Book).options(selectinload(Book.translations)).where(Book.id == book_id)
    )
    if book is None:
        raise HTTPException(status_code=404, detail="Book not found")
    values = payload.model_dump(exclude_unset=True, exclude={"translations"})
    if "title" in values:
        if values["title"] is None or not values["title"].strip():
            raise HTTPException(status_code=422, detail="title must not be blank")
        values["title"] = values["title"].strip()
    for field, value in values.items():
        setattr(book, field, value)
    if payload.translations is not None:
        translations = {translation.locale: translation for translation in book.translations}
        for translation in payload.translations:
            title = translation.title.strip() if translation.title else None
            description = translation.description.strip() if translation.description else None
            current = translations.get(translation.locale)
            if not title and not description:
                if current is not None:
                    book.translations.remove(current)
                continue
            if current is None:
                book.translations.append(
                    BookTranslation(
                        locale=translation.locale,
                        title=title,
                        description=description,
                    )
                )
            else:
                current.title = title
                current.description = description
    db.commit()
    db.refresh(book)
    return BookResponse.model_validate(book)
