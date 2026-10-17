# Books

**Status:** Initial implementation  
**Scope:** A local book catalog populated from Google Books volume search and used by book clubs, events, the Library, and book reviews.

## Purpose

Book records provide shared metadata for works/editions selected by book clubs. Google Books supplies search results and source metadata; the application stores the selected volume locally and assigns it an application-owned ID. Google Books Volume IDs identify provider records, while ISBNs are edition identifiers and are not sufficient as the application's primary key.

The Google Books API exposes volume search and volume detail operations. Public-data requests must identify the application with an API key or OAuth token. Search accepts a `q` query and supports field filters such as `intitle:`, `inauthor:`, and `isbn:`. Search results are relevance ordered by default and can be paginated; the API allows at most 40 results per request. See the official [Google Books API overview](https://developers.google.com/books/docs/overview) and [Using the API guide](https://developers.google.com/books/docs/v1/using).

Use the existing [movie catalog](movies.md) as the pattern for external-provider identity, normalized search results, and saved-record reuse. Use the [board game catalog](board-games.md) as the pattern for localized catalog fields.

## Book identity

- Each saved book has an application-owned integer `id`.
- `provider` is `google_books`; `external_id` is the Google Books Volume ID.
- (`provider`, `external_id`) uniquely identifies an imported provider volume. Repeated selections of the same volume reuse the existing local record.
- Different editions or formats may have different Google Books Volume IDs and remain distinct catalog records, even when they share a title or ISBN family.
- ISBN-10 and ISBN-13 are optional metadata. They are not globally unique constraints because provider data may omit, repeat, or inconsistently associate identifiers.
- Events and reviews refer to the local book ID, never to a title, ISBN, or Google URL.

## Book metadata

| Field | Requirement |
| --- | --- |
| `id` | Application-owned integer primary key |
| `provider` | Required provider identifier; initially `google_books` |
| `external_id` | Required Google Books Volume ID; unique with `provider` |
| `title` | Required display title from the selected volume |
| `subtitle` | Optional subtitle |
| `authors` | Optional list of author names |
| `publisher` | Optional publisher name |
| `published_date` | Optional provider value; preserve its partial precision (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`) rather than inventing missing month/day values |
| `description` | Optional Google Books volume description |
| `isbn_10`, `isbn_13` | Optional identifiers from `industryIdentifiers` |
| `page_count` | Optional positive page count |
| `categories` | Optional list of provider subject/category strings |
| `language` | Optional provider language code, such as `en` or `uk` |
| `cover_image_url` | Optional URL from the provider's available image links; a missing cover does not prevent saving |
| `info_url` | Optional Google Books information link for the volume |
| `provider_average_rating`, `provider_ratings_count` | Optional Google Books aggregate data; distinct from Clubs user reviews and their `average_rating` |
| `created_by` | Profile that first saved the local record |
| `created_at`, `updated_at` | Creation and last-update timestamps |

Google Books fields may be absent or incomplete. Missing authors, publication date, identifiers, description, language, rating data, and cover art must remain nullable/empty rather than being fabricated. Preserve authors and categories as ordered string lists in API responses; the database representation can be selected during model implementation.

## Localized metadata

- `book_translations` stores optional localized `title` and `description` values keyed by (`book_id`, `locale`), matching the movie and board game catalog patterns.
- The selected Google Books volume's original title, description, and language remain the source metadata. The translation table stores an additional localized value, not a replacement for the source fields.
- Google Books search can restrict results with `langRestrict` using a two-letter ISO-639-1 language code. This filters volumes by their tagged language; it does not guarantee a translated version of the same edition. Do not treat a separate volume ID as a translation of the selected volume without an explicit matching rule.
- If no Ukrainian translation is available, the UI falls back to the base title and description.
- Admin book editing may update or remove Ukrainian title and description values. The API returns saved translations.

## Catalog behavior

- Search local saved books first. When external search is requested, append normalized Google Books results after local records, as the movie catalog does for TMDB.
- External search results are transient until a user selects one. Selecting a Google result fetches/uses that volume's metadata and saves a local record; an existing (`provider`, `external_id`) record is reused.
- Search supports title, author, and ISBN queries. The Google Books `q` parameter supports `intitle:`, `inauthor:`, and `isbn:` operators. The application may map a recognized ISBN query to the provider's ISBN search syntax.
- Use `printType=books` so magazine results are excluded. Use bounded pagination (`startIndex` and `maxResults`); do not exceed Google's 40-result maximum.
- Missing optional provider metadata never prevents a search hit from being displayed or selected. Provide a fallback cover in the UI.
- Provider `averageRating` and `ratingsCount` are imported source metadata only. The application's user-review average is computed from `book_reviews` and must be exposed separately as `average_rating`; never combine the two ratings.
- Google Books response data is licensed and governed by the API's terms. Keep credentials server-side and implement appropriate source attribution/linking and data handling before release; do not treat the API as an unrestricted bulk-copy source or a replacement for a commercial books service. See the [Google Books API terms](https://developers.google.com/books/terms.html).
- Public volume search requires an application identifier: a server-side API key or OAuth access token. `GOOGLE_BOOKS_API_SECRET` stores that API key or access token; it must not contain an OAuth client secret by itself. The credential is backend configuration and must not be exposed in frontend code. Google Books user bookshelf management and other private user data are outside this feature; they would require a separate OAuth authorization flow.

## Related features

- **Book club events:** A book event may link to a saved book using its local ID. If the event title is omitted, display the book's title in the active locale with a fallback to the base title. Use the book cover for the event image when available. Event scheduling continues to follow the [events specification](events.md).
- **Library:** Replace the Books placeholder with books linked to events in the current user's book clubs. Follow the club scoping and search behavior defined for the Library; see [library.md](library.md).
- **Reviews:** `BookReview` references `books.id` with a real foreign key and uses the shared review rules in [reviews.md](reviews.md). The book catalog and its migration must exist before the book review table is created.

## API

All routes are under `/api/books` and require a valid Supabase Bearer token. The backend calls Google Books with its server-side API key.

### `GET /api/books?query={query}&search_provider={boolean}&start_index={integer}`

Searches the local catalog by title, author, or ISBN. When `search_provider=true`, returns local records first, then Google Books volume search hits. External hits carry `provider="google_books"` and the provider Volume ID, and are not persisted until selected. Pagination must use a bounded page size and translate to Google's `startIndex` and `maxResults` parameters.

### `POST /api/books`

Creates or reuses a local book by Google Books provider and Volume ID. The server obtains provider data from Google Books; clients cannot set the local ID, `created_by`, or timestamps. The response includes the saved metadata and translations.

### `PATCH /api/books/{book_id}`

Allows an authorized catalog administrator to update editable source metadata and Ukrainian title/description. The authorization policy should match movie catalog editing and be enforced by the API.

## Example

```json
{
  "id": 1,
  "provider": "google_books",
  "external_id": "zyTCAlFPjgYC",
  "title": "The Google story",
  "subtitle": null,
  "authors": ["David A. Vise", "Mark Malseed"],
  "publisher": "Random House Digital, Inc.",
  "published_date": "2005-11-15",
  "description": "A book about the history of Google.",
  "isbn_10": "055380457X",
  "isbn_13": "9780553804577",
  "page_count": 207,
  "categories": ["Business & Economics / Entrepreneurship"],
  "language": "en",
  "cover_image_url": "https://books.google.com/books?id=zyTCAlFPjgYC&printsec=frontcover&img=1&zoom=1&source=gbs_api",
  "info_url": "https://books.google.com/books?id=zyTCAlFPjgYC",
  "provider_average_rating": 3.5,
  "provider_ratings_count": 136,
  "average_rating": null,
  "created_by": "profile-id",
  "created_at": "2026-10-16T12:00:00",
  "updated_at": "2026-10-16T12:00:00"
}
```

Values are illustrative and optional provider fields may be absent. `average_rating` is the Clubs user-review average and is null when no rated user reviews exist.

## Acceptance criteria

1. An authenticated user can search local books and, on explicit provider search, Google Books results.
2. Search results are normalized and distinguish local integer IDs from Google Books Volume IDs.
3. Selecting an external result saves or reuses the local record identified by (`provider`, `external_id`).
4. Google Books' partial publication dates and optional metadata are preserved without invented values.
5. Provider searches use `printType=books` and bounded pagination no larger than 40 results per request.
6. Google Books API keys remain server-side, and provider links/attribution and data handling comply with Google Books API terms.
7. A book can be linked to book club events, shown in the user's Library, and referenced by a `BookReview` through `books.id`.
8. Google Books provider ratings and Clubs user-review average ratings are represented as separate fields.

## Open questions

1. Catalog editing follows movie catalog permissions: platform admins can edit; other users can view only.
2. Saved catalog records require a Google Books Volume ID; manual records are not supported.
3. Search supports title, author, and ISBN through a general query; dedicated author/category filters are not implemented.
4. Provider metadata is fetched when a user saves a volume and is not automatically refreshed afterward.
5. The Library includes books linked to events in the user's book clubs; manually saved but unlinked books are not included.
