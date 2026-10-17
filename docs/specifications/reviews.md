# Reviews

**Status:** Draft requirements  
**Scope:** User-authored reviews for books, movies, and board games, stored in a separate table for each catalog type.

## Purpose

Reviews let users record and share their opinions about catalog items. A review belongs to one user and exactly one catalog item. Book, movie, and board game reviews share common fields and behavior, while remaining independently stored and linked through type-specific foreign keys.

## Data model

### Shared review base

Define a shared abstract ORM base class for the common review fields. It is a code-level base only and does not create a `reviews` database table. Each concrete review model inherits the shared fields and maps to its own table:

| Model | Table | Item reference |
| --- | --- | --- |
| `BookReview` | `book_reviews` | `book_id` → `books.id` |
| `MovieReview` | `movie_reviews` | `movie_id` → `movies.id` |
| `BoardGameReview` | `board_game_reviews` | `board_game_id` → `board_games.id` |

The shared base defines:

| Field | Requirement |
| --- | --- |
| `id` | Application-owned unique identifier; use the same identifier strategy as the corresponding catalog model unless a decision requires otherwise |
| `reviewer_id` | Required foreign key to `profiles.id`; identifies the author |
| `rating` | Optional integer from 1 through 10; null means the review has no rating |
| `body` | Review text; empty/null behavior and maximum length are open product decisions |
| `is_public` | Boolean visibility flag; defaults to false. Public reviews are visible to other authenticated users, while private reviews are visible only to their author |
| `created_at`, `updated_at` | Inherited from the shared SQLAlchemy `Base` timestamp behavior |

Each concrete model adds its required catalog foreign key. The catalog relationship and foreign key must be type-safe and enforced by the database. Deleting a catalog item should cascade to its reviews only if catalog deletion is supported; the application currently favors retaining catalog records, so the final delete behavior should match each catalog's lifecycle.

The database must enforce the rating range (`rating IS NULL OR rating BETWEEN 1 AND 10`) in each concrete review table as well as validating it in the API.

## Average rating on catalog items

Each linked catalog model (`Book`, `Movie`, and `BoardGame`) should expose an `average_rating` annotation when loaded for an API response or query that needs rating data. Compute it from public reviews in that type's review table with `AVG(rating)`, excluding null ratings. Private ratings must not affect a value visible to other users. The result is null when the item has no rated public reviews. Do not store the average as a catalog column because it is derived data and would need synchronization after every review change.

Use SQLAlchemy's query-time expression support (for example, `query_expression()` with `with_expression()` and a grouped or correlated aggregate) so callers can request the annotation as part of the catalog query instead of loading each item's reviews and calculating averages in Python. Apply the same field name and semantics to all three catalog types. Include it in catalog response schemas where the API needs to display it; omit it from responses that do not load the annotation rather than triggering a per-item query.

Do not use a generic `item_type` plus `item_id` reference. Separate tables preserve real foreign keys and allow the database to enforce that each review targets the correct catalog type.

## Uniqueness and editing

Recommended default: allow at most one review from a profile for a given catalog item, enforced with a unique constraint on (`reviewer_id`, item foreign key) in each review table. Submitting another review for the same item updates that user's existing review. Different users may review the same item, and a user may review the same title in different catalog records, such as separate editions.

Only the author may edit or remove their review. Administrators do not gain permission to edit a user's review by virtue of their catalog-management role. Review deletion should be a hard delete unless moderation or audit requirements call for soft deletion.

## Shared behavior

- The same validation and request/response conventions apply to all three review types.
- API routes and response models remain separated by catalog type; a review response identifies the corresponding typed item ID and does not expose a polymorphic item pointer.
- Review lists should have deterministic ordering and pagination when they can grow beyond a small response. Ordering and page limits need to be selected during API design.
- A review references a catalog record, not a club event. Any authenticated active user may read public reviews; a user can also read their own private review. Only the author may change the visibility flag.
- Book reviews depend on the catalog defined in the [books specification](books.md). The `book_reviews` table can be added only after the `books` table and its migration exist.
- Movie and board game review relations use the existing `movies` and `board_games` catalog tables.

## Suggested API shape

Use type-specific endpoints so permissions and relationships are explicit:

- `GET /api/movies/{movie_id}/reviews`
- `POST /api/movies/{movie_id}/reviews`
- `PATCH /api/movie-reviews/{review_id}`
- `DELETE /api/movie-reviews/{review_id}`
- Equivalent paths for board games and books.

The exact route layout is open for implementation, but it must preserve type-specific item references and enforce author ownership on update/delete. Read visibility rules must be consistent with the product decision below.

## Migrations

- Create `movie_reviews`, `board_game_reviews`, and `book_reviews` in the books catalog migration, with real foreign keys to their respective catalog tables.
- Every concrete review table includes the shared `is_public` visibility field, defaulting to false.
- Each migration must include matching downgrade operations and constraints for the table's profile and catalog references.
- Keep the abstract base out of metadata as a standalone table.

## Acceptance criteria

1. The shared review fields are defined once in an abstract ORM base class.
2. Book, movie, and board game reviews are stored in separate concrete tables.
3. Each concrete review table has a required, database-enforced foreign key to its corresponding catalog table and to the author profile.
4. No generic item type/ID pair is used to associate a review with a catalog item.
5. A profile can create, read, and edit reviews according to the visibility flag; other users see only public reviews, and only the author can edit or delete their review.
6. The uniqueness rule prevents duplicate reviews by the same author for the same catalog record, if the recommended one-review-per-user rule is accepted.
7. Book review persistence is introduced only after the books catalog exists.
8. Rated reviews accept only integers from 1 through 10, with the database constraint matching API validation.
9. Catalog queries that request rating data expose a computed `average_rating` based on public reviews; unrated reviews are excluded and items without rated public reviews return null.

## Open questions

1. May a review omit its rating, or should every review include an integer from 1 through 10? The current draft permits a missing rating.
2. Is review text required, and what maximum length should it have? Should a short review title be supported?
3. Can a user have one review per item, or multiple dated reviews? The current recommendation is one editable review per user/item.
4. Should public reviews also be visible to unauthenticated visitors, or only authenticated users?
5. Should users be able to delete reviews, and should deletions be permanent or retained for moderation/audit?
6. Do reviews need spoiler flags, reactions, reporting, or moderation workflows?
7. Should a review be linked to a specific club or event as well as the catalog item, or remain a single user-level review of the item?
