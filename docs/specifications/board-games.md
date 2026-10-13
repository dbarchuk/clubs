# Board games

**Status:** Draft, based on the current implementation  
**Scope:** A local board game catalog that members can search and add to, and associate with board game club events.

## Purpose

Board game records provide shared metadata for games discussed by board game clubs. The catalog is local to the application: users add records directly, and authenticated users can search saved records. No external catalog provider is currently configured.

## Board game identity

- Each saved game has an application-owned integer `id`.
- The catalog currently has no provider identifier or uniqueness rule. Duplicate titles, including different editions, are allowed.
- `created_by` records the profile that added the game.
- Board game club events link to a saved game record. The event title and cover image come from the linked game; see the [event specification](events.md#catalog-item-association).

## Board game metadata

| Field | Requirement |
| --- | --- |
| `title` | Required display title; request length is 1–500 characters |
| `year_published` | Optional publication year, from 1000 through 2200 |
| `description` | Optional description or summary |
| `min_players` | Optional minimum supported player count; when provided, must be at least 1 |
| `max_players` | Optional maximum supported player count; when both player limits are provided, must be at least `min_players` |
| `cover_image_url` | Optional absolute HTTP or HTTPS URL for the game's cover image |
| `created_by` | Profile that added the game |
| `created_at`, `updated_at` | Creation and last-update timestamps |

## Catalog behavior

- The catalog is populated by authenticated users through the create endpoint; there is no external search/import provider.
- Search matches saved titles case-insensitively when they contain the requested title text. Results are ordered by title and then publication year.
- Search results are read-only. The current API has no update or delete operation.
- The catalog does not currently prevent duplicate entries or merge different editions.
- Optional metadata may be absent. Missing cover art does not prevent a game from being created or returned.

## API

All routes are under `/api/board-games` and require a valid Supabase Bearer token.

### `GET /api/board-games?title={query}`

Searches the local catalog by a required title query (1–200 characters) and returns matching records. A blank query after trimming returns HTTP 422. An empty result is an empty array.

### `POST /api/board-games`

Creates a local catalog record from `BoardGameCreate` and returns the saved record with HTTP 201. The authenticated profile is assigned to `created_by`; clients cannot set the record ID, creator, or timestamps. Invalid field values return HTTP 422.

## Example

```json
{
  "id": 1,
  "title": "Catan",
  "year_published": 1995,
  "description": "A strategy game of settlement and trade.",
  "min_players": 3,
  "max_players": 4,
  "cover_image_url": "https://example.com/catan-cover.jpg",
  "created_by": "profile-id",
  "created_at": "2026-10-13T12:00:00",
  "updated_at": "2026-10-13T12:00:00"
}
```

The sample ID, profile, timestamps, and cover URL are illustrative.

## Acceptance criteria represented by the current implementation

1. An authenticated user can add a board game with a title and optional metadata.
2. The API validates publication year, player counts, and cover URL format.
3. A provided maximum player count cannot be lower than the provided minimum player count.
4. An authenticated user can search the local catalog by a case-insensitive title substring.
5. Search results include catalog IDs and creation metadata and are ordered by title and publication year.
6. Missing optional data, including a cover image, does not prevent a game from being saved.
7. In a board game club event, a manager can select a saved game or create a new catalog record from its title.

## Open questions

1. Should the catalog remain user-entered, or should it integrate with an external catalog such as BoardGameGeek?
2. Should duplicate titles be allowed, and how should editions or expansions be distinguished?
3. Should users be able to edit or remove records they added, and who may manage shared records?
4. Should board game clubs be able to associate events with a saved game, as movie clubs can associate events with movies?
5. Should the API expose browsing/pagination or filtering by player count?
