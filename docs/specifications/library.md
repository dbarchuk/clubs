# Library

**Status:** Initial implementation
**Scope:** Shared movie, book, and board game catalogs, with filters for a user's clubs and catalog date metadata.

## Purpose

The Library exposes every movie, book, and board game in the local catalog to any authenticated user. Each item includes references to non-deleted clubs the current user belongs to where the item is linked to a non-deleted event. The default scope can show all catalog items or only items linked to the user's clubs.

## Sections

- **Movies:** The tab panel includes a search field and expandable filters. Search covers title and original title. Each card includes the movie poster, title, release year, and the user's clubs where it is used; those club names link to their details. Soft-deleted events and deleted clubs are excluded from club references. Held and cancelled events still count as club selections.
- **Movie details and editing:** Clicking a movie card opens its details for any user. Non-admins get a read-only view. Platform admins get editable fields for title, original title, overview, release date, poster URL, and backdrop URL; the backend independently enforces the same permission. Movie cards are about 20% smaller than the initial layout.
- **Books:** Search filters the full book catalog. Cards show the localized title, authors, publication date, cover, and club links. Clicking a card opens read-only details for regular users; platform admins can edit catalog metadata and Ukrainian title/description, with the backend enforcing permission. The Google Books information link is shown where available.
- **Board games:** The tab lists the full catalog and shows the user's linked clubs where available.
- **Filters and sorting:** A collapsible panel provides Mine/All scope, a publication/release year range, and sorting by date added or release year. The API applies these options; newest dates and latest years appear first, and items with no year appear last when sorting by year. Search text continues to filter the returned rows in the interface.

## API

### `GET /api/movies/library`

Requires authentication. Returns all movies in the catalog. Each movie includes club IDs and titles for non-deleted movie clubs where the current user is a member and the movie is linked to a non-deleted event. A movie linked in multiple events within one club is listed once for that club.

`GET /api/books/library` and `GET /api/board-games/library` follow the same behavior for their respective full catalogs and club types. All three endpoints accept `scope=all|mine`, optional `year_from` and `year_to`, and `sort=date_added|year_released`; defaults are `all` and `date_added`. A reversed year range receives HTTP 422.

### `PATCH /api/movies/{movie_id}`

Requires authentication and `Profile.is_admin = true`. Accepts optional movie metadata fields: `title`, `original_title`, `overview`, `release_date`, `cover_image_url`, `backdrop_image_url`, and `original_language`. Returns the updated movie. Non-admin profiles receive HTTP 403; missing movies receive HTTP 404.

## Acceptance criteria

1. The authenticated app has a Library navigation section with Movies, Books, and Board games tabs.
2. Every authenticated user can load all saved movies, books, and board games; the Mine filter limits results to items linked from their clubs.
3. Searching filters movies by current or original title, and no-match results have a distinct empty state.
4. All users can open movie details; only admins can edit and save changes, and API requests from other profiles are rejected.
5. Movie cards use a compact layout approximately 20% smaller than the initial implementation.
6. The Books and Board games tabs list all catalog items and show the current user's eligible club links.
7. Every tab supports Mine/All, release/publication year range, and sorting by date added or release year.
