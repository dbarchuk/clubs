# Movies

**Status:** Draft requirements  
**Scope:** A basic movie catalog record populated from TMDB search results and usable as a catalog item for club events.

## Purpose

Movie records provide consistent movie metadata for display and for linking a movie to an event. The initial integration uses TMDB as the metadata source. The record shape should keep the provider identifier separate from the application's own identifier so another provider can be supported later.

## Movie identity

- Each search result records its `provider` and provider-specific `external_id`.
- For TMDB, `provider` is `tmdb` and `external_id` is the TMDB movie ID.
- Saved movies have an application-owned integer ID, and (`provider`, `external_id`) uniquely identifies the source record.
- Event references use the application's movie ID rather than a TMDB URL or title. See the [event specification](events.md#catalog-item-association).

## Movie metadata

| Field | Requirement |
| --- | --- |
| `title` | Required source/display title returned for the canonical `en-US` import request |
| `original_title` | Original title supplied by the metadata provider |
| `overview` | Movie synopsis; may be empty or unavailable |
| `release_date` | Optional calendar date, represented in ISO 8601 format (`YYYY-MM-DD`) |
| `cover_image_url` | Optional full URL to the poster/cover image; used as the movie's primary image and may be used as an event avatar |
| `original_language` | Optional source language code supplied by the provider, such as `en` |
| `popularity` | Optional non-negative provider popularity score |
| `vote_average` | Optional provider rating from 0 through 10 |
| `created_by` | Profile that first saved the movie |
| `created_at`, `updated_at` | Creation and last-update timestamps |

Additional image fields, such as `backdrop_image_url`, may be included when the provider supplies them, but are not required for the basic movie display.

## Localized metadata

- `movie_translations` stores optional per-locale `title` and `overview` values keyed by (`movie_id`, `locale`). The main movie row remains the canonical fallback and keeps `original_title` and `original_language` from TMDB.
- When a movie is selected or saved, the TMDB client requests both canonical `en-US` details and Ukrainian `uk-UA` details. A non-empty Ukrainian translation that differs from the canonical text is stored. If TMDB has no Ukrainian text or the localized request fails, the movie remains usable with its canonical values.
- Admin movie editing can update or remove the Ukrainian title and overview. API responses include stored translations so the frontend can display Ukrainian with a canonical fallback.
- Search requests use the active UI language for TMDB search and match saved records by both canonical and requested-locale title.

## Source behavior

- Search by title returns zero or more normalized movie records; it does not imply that every result has a poster, release date, or overview.
- Search results are transient until a user selects a TMDB result. Selecting a provider result fetches canonical and Ukrainian details and saves them; selecting an existing local result checks for and fills a missing Ukrainian translation before returning it.
- A saved TMDB movie is unique by (`provider`, `external_id`), so concurrent or repeated selections reuse the existing record.
- TMDB image paths are converted to full image URLs by the TMDB client. A missing poster remains `null`; the UI provides its own fallback.
- The metadata provider is the source of imported title, synopsis, release date, image, popularity, language, and rating values.
- `popularity` and `vote_average` are provider data and can change over time. The application may refresh them when it refreshes a movie record.
- A movie record is distinct from a user's event title. An event may display the movie title by default while still allowing a custom event title, as described in the event specification.

## Example

```json
{
  "id": 1,
  "provider": "tmdb",
  "external_id": "movie-id-from-tmdb",
  "title": "The Imitation Game",
  "original_title": "The Imitation Game",
  "overview": "Based on the real life story of legendary cryptanalyst Alan Turing, the film portrays the nail-biting race against time by Turing and his brilliant team of code-breakers at Britain's top-secret Government Code and Cypher School at Bletchley Park, during the darkest days of World War II.",
  "release_date": "2014-11-14",
  "cover_image_url": "https://image.tmdb.org/t/p/w500/zSqJ1qFq8NXFfi7JeIYMlzyR0dx.jpg",
  "original_language": "en",
  "popularity": 56.4171,
  "vote_average": 7.978,
  "created_by": "profile-id",
  "created_at": "2026-10-12T12:00:00",
  "updated_at": "2026-10-12T12:00:00"
}
```

`id`, `external_id`, `created_by`, and timestamps are illustrative placeholders because the sample data does not include these values.

## Acceptance criteria

1. A normalized movie search result contains the provider and provider-specific external ID along with the metadata fields shown in the example.
2. Optional provider values remain nullable when unavailable; a missing poster does not prevent a movie from being returned.
3. A TMDB poster path is represented as a full `cover_image_url`.
4. Search does not persist TMDB results until the user selects one.
5. Saved movie IDs are integers and movie rows include `created_by`, `created_at`, and `updated_at`.
6. Selecting an existing or new TMDB movie stores available Ukrainian title/overview under the `uk-UA` locale.
7. Movie responses include stored translations; the frontend prefers the active language and falls back to canonical metadata.

## Open questions

1. Should users be able to edit imported metadata, or should provider data remain authoritative?
2. How often should popularity, vote average, and other provider fields be refreshed?
