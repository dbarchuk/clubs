from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backend.board_games.models import BoardGame
from app.backend.books.models import Book
from app.backend.movies.models import Movie
from app.backend.reviews.models import BoardGameReview, BookReview, MovieReview
from app.backend.reviews.schemas import (
    CatalogType,
    ReviewListResponse,
    ReviewResponse,
    ReviewUpsert,
)
from app.backend.users.models import Profile
from app.backend.users.router import get_active_profile
from app.core.database import get_db

router = APIRouter(prefix="/reviews", tags=["reviews"])

_CATALOGS: dict[str, tuple[type[Any], str, type[Any]]] = {
    "books": (BookReview, "book_id", Book),
    "movies": (MovieReview, "movie_id", Movie),
    "board-games": (BoardGameReview, "board_game_id", BoardGame),
}


def catalog_config(catalog_type: CatalogType) -> tuple[type[Any], str, type[Any]]:
    return _CATALOGS[catalog_type]


def serialize_review(
    review: Any,
    item_id: int,
    reviewer_name: str,
    current_profile_id: str,
) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        item_id=item_id,
        reviewer_id=review.reviewer_id,
        reviewer_name=reviewer_name,
        rating=review.rating,
        body=review.body,
        is_public=review.is_public,
        is_mine=review.reviewer_id == current_profile_id,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.get("/{catalog_type}/{item_id}", response_model=ReviewListResponse)
async def list_reviews(
    catalog_type: CatalogType,
    item_id: int,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> ReviewListResponse:
    review_model, item_column_name, catalog_model = catalog_config(catalog_type)
    item_column = getattr(review_model, item_column_name)
    if db.get(catalog_model, item_id) is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    rows = db.execute(
        select(review_model, Profile.display_name)
        .join(Profile, review_model.reviewer_id == Profile.id)
        .where(
            item_column == item_id,
            or_(review_model.is_public.is_(True), review_model.reviewer_id == profile.id),
        )
        .order_by(review_model.updated_at.desc(), review_model.id.desc())
    ).all()
    reviews = [
        serialize_review(review, item_id, display_name, profile.id)
        for review, display_name in rows
    ]
    average_rating = db.scalar(
        select(func.avg(review_model.rating)).where(
            item_column == item_id,
            review_model.is_public.is_(True),
            review_model.rating.is_not(None),
        )
    )
    return ReviewListResponse(reviews=reviews, average_rating=average_rating)


@router.put("/{catalog_type}/{item_id}", response_model=ReviewResponse)
async def save_review(
    catalog_type: CatalogType,
    item_id: int,
    payload: ReviewUpsert,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> ReviewResponse:
    review_model, item_column_name, catalog_model = catalog_config(catalog_type)
    item_column = getattr(review_model, item_column_name)
    if db.get(catalog_model, item_id) is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")

    review = db.scalar(
        select(review_model).where(
            item_column == item_id,
            review_model.reviewer_id == profile.id,
        )
    )
    created = review is None
    if review is None:
        review = review_model(
            **{item_column_name: item_id},
            reviewer_id=profile.id,
        )
        db.add(review)
    review.rating = payload.rating
    review.body = payload.body
    review.is_public = payload.is_public

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # A concurrent first save may have inserted this user's unique review.
        existing = db.scalar(
            select(review_model).where(
                item_column == item_id,
                review_model.reviewer_id == profile.id,
            )
        )
        if created and existing is not None:
            existing.rating = payload.rating
            existing.body = payload.body
            existing.is_public = payload.is_public
            db.commit()
            review = existing
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Review could not be saved",
            ) from exc
    db.refresh(review)
    return serialize_review(review, item_id, profile.display_name, profile.id)


@router.delete("/{catalog_type}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    catalog_type: CatalogType,
    item_id: int,
    profile: Annotated[Profile, Depends(get_active_profile)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    review_model, item_column_name, catalog_model = catalog_config(catalog_type)
    item_column = getattr(review_model, item_column_name)
    if db.get(catalog_model, item_id) is None:
        raise HTTPException(status_code=404, detail="Catalog item not found")
    review = db.scalar(
        select(review_model).where(
            item_column == item_id,
            review_model.reviewer_id == profile.id,
        )
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    db.delete(review)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
