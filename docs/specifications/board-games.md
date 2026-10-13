# Board games

**Status:** Draft, based on the current implementation  
**Scope:** A local board game catalog that members can search and add to, with game records available for future club-event associations.

## Purpose

Board game records provide shared metadata for games discussed by board game clubs. The catalog is local to the application: users add records directly, and authenticated users can search saved records. No external catalog provider is currently configured.

## Board game identity

- Each saved game has an application-owned integer `id`.
- The catalog currently has no provider identifier or uniqueness rule. Duplicate titles, including different editions, are allowed.
- `created_by` records the profile that added the game.
- The game record is separate from a club event. Event association with a board game is not implemented yet; see the [event specification](events.md#catalog-item-association).

## Board game metadata

| Field | Requirement |
| --- | --- |
| `title` | Required display title; request length is 1–500 characters |
| `game_types` | Zero or more references to shared board game types; a game may have multiple types |
| `year_published` | Optional publication year, from 1000 through 2200 |
| `description` | Optional description or summary |
| `min_players` | Optional minimum supported player count; when provided, must be at least 1 |
| `max_players` | Optional maximum supported player count; when both player limits are provided, must be at least `min_players` |
| `min_age` | Optional recommended minimum age in years; when provided, must be zero or greater |
| `cover_image_url` | Optional absolute HTTP or HTTPS URL for the game's cover image |
| `created_by` | Profile that added the game |
| `created_at`, `updated_at` | Creation and last-update timestamps |

Game types are tags and may overlap. For example, a game can be both `cooperative` and `legacy_campaign`. An empty list means that no type has been assigned.

| Type ID | Name | Description |
| --- | --- | --- |
| `eurogame` | Eurogame | Strategy and resource planning, usually with limited direct conflict |
| `ameritrash` | Ameritrash | Strong theme and narrative, often with direct conflict, dice, or miniatures |
| `cooperative` | Cooperative | Players work together against the game's rules, system, or story |
| `party` | Party game | Easy-to-learn games intended for casual play in a group |
| `social_deduction` | Social deduction | Hidden roles, bluffing, and identifying other players' goals or roles |
| `abstract` | Abstract game | Primarily logical or tactical play with little thematic framing |
| `deck_building` | Deck building | Players improve a personal deck during play by acquiring or adding cards |
| `area_control` | Area control | Players compete to control regions or locations on a shared map |
| `legacy_campaign` | Legacy / campaign | Campaign play where choices or changes carry between sessions |

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

### `GET /api/board-games/types`

Returns the available shared game types, ordered by display name. Clients use each type's `id` in `game_type_ids` when creating a game.

### `POST /api/board-games`

Creates a local catalog record from `BoardGameCreate` and returns the saved record with HTTP 201. `game_type_ids` is an optional list of IDs from the shared type table. The authenticated profile is assigned to `created_by`; clients cannot set the record ID, creator, or timestamps. Invalid field values return HTTP 422.

## Example

```json
{
  "id": 1,
  "title": "Catan",
  "game_types": [
    {
      "id": "eurogame",
      "name": "Eurogame",
      "description": "Strategy and resource planning, usually with limited direct conflict"
    }
  ],
  "year_published": 1995,
  "description": "A strategy game of settlement and trade.",
  "min_players": 3,
  "max_players": 4,
  "min_age": 10,
  "cover_image_url": "https://example.com/catan-cover.jpg",
  "created_by": "profile-id",
  "created_at": "2026-10-13T12:00:00",
  "updated_at": "2026-10-13T12:00:00"
}
```

The sample ID, profile, timestamps, and cover URL are illustrative.

## Acceptance criteria represented by the current implementation

1. An authenticated user can add a board game with a title and optional metadata.
2. Board game types are stored as shared type records and associated with games through a many-to-many relationship.
3. The API validates publication year, player counts, minimum age, and cover URL format.
4. A provided maximum player count cannot be lower than the provided minimum player count.
5. An authenticated user can search the local catalog by a case-insensitive title substring.
6. A game may be associated with multiple type records.
7. Search results include catalog IDs and creation metadata and are ordered by title and publication year.
8. Missing optional data, including a cover image, does not prevent a game from being saved.

## Open questions

1. Should the catalog remain user-entered, or should it integrate with an external catalog such as BoardGameGeek?
2. Should duplicate titles be allowed, and how should editions or expansions be distinguished?
3. Should users be able to edit or remove records they added, and who may manage shared records?
4. Should board game clubs be able to associate events with a saved game, as movie clubs can associate events with movies?
5. Should the API expose browsing/pagination or filtering by player count, age, or play duration?
