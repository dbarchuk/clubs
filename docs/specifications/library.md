# Library

**Status:** Initial implementation
**Scope:** A movie library for club members, with an administrative view of the shared movie catalog.

## Purpose

The Library gathers items already selected in a user's clubs. Regular users see movies from clubs they belong to. Platform admins (`Profile.is_admin = true`) see every movie in the database, including movies not currently linked to an event.

## Sections

- **Movies:** The tab panel starts with a search field instead of a second section heading. It filters loaded movies by title or original title. Each card includes the movie poster, title, release year, and clubs where it is used; those club names link to their details. Soft-deleted events and deleted clubs are excluded from club references. Held and cancelled events still count as club selections.
- **Movie details and editing:** Clicking a movie card opens its details for any user. Non-admins get a read-only view. Platform admins get editable fields for title, original title, overview, release date, poster URL, and backdrop URL; the backend independently enforces the same permission. Movie cards are about 20% smaller than the initial layout.
- **Books:** Placeholder section. Book catalog data is not implemented.
- **Board games:** Placeholder section. Board game library data is not implemented.

## API

### `GET /api/movies/library`

Requires authentication. For regular profiles, returns each distinct movie linked to a non-deleted event in a non-deleted movie club where the current profile is a member, along with the matching club IDs and titles. A movie linked in multiple events within one club is listed once for that club. For platform admins, returns all movies in the database and includes any references from non-deleted movie clubs and events. Results are ordered by movie title, release date, and club title.

### `PATCH /api/movies/{movie_id}`

Requires authentication and `Profile.is_admin = true`. Accepts optional movie metadata fields: `title`, `original_title`, `overview`, `release_date`, `cover_image_url`, `backdrop_image_url`, and `original_language`. Returns the updated movie. Non-admin profiles receive HTTP 403; missing movies receive HTTP 404.

## Acceptance criteria

1. The authenticated app has a Library navigation section with Movies, Books, and Board games tabs.
2. Regular users see movies linked from their clubs; admins see every saved movie and its eligible club references.
3. Searching filters movies by current or original title, and no-match results have a distinct empty state.
4. All users can open movie details; only admins can edit and save changes, and API requests from other profiles are rejected.
5. Movie cards use a compact layout approximately 20% smaller than the initial implementation.
6. Books and board games show placeholders until their library sources are implemented.
