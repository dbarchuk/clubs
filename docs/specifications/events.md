# Events

**Status:** Draft requirements  
**Scope:** Creating and viewing scheduled club events, changing their status, optionally associating them with a catalog item, and soft-deleting events.

## Purpose

Events let a club plan a shared activity, such as meeting to discuss a book or watch a movie. Events belong to one club and are visible to that club's members.

## Actors and permissions

- **Club member:** Can view events belonging to clubs they are a member of.
- **Event manager:** Can create, edit, cancel, delay, or mark an event as held.

The exact event-manager roles and whether every member can manage events need confirmation (see Open questions).

## Event lifecycle

An event has one of these statuses:

- `scheduled`: Planned and upcoming. This is the status on creation.
- `delayed`: The event will not happen at its currently planned time and is postponed. The event remains visible with its delayed status.
- `cancelled`: The event will not take place. It remains visible in event history.
- `held`: The event took place. This is a completed state.
- `deleted`: The event was soft-deleted and is hidden from normal event views. It remains stored for audit or recovery purposes.

Cancelled and held events remain available to club members as history. A delayed event may later return to `scheduled` when its new plan is confirmed. Deletion is a soft delete: set `deleted_at` and `deleted_by`, and set the status to `deleted`. Deleted events are excluded from normal event listings. Status changes should record when they occurred and who made them if the audit history is in scope.

## Scheduling

- Each event belongs to exactly one club.
- An event has a start date and an end date. The end date cannot be earlier than the start date.
- Start and end times are optional. When omitted, the event is all-day. When provided, the event is timed.
- For a timed event, both start and end times are provided; the end must not precede the start when the dates are the same.
- Events spanning multiple days are supported. The club's time zone should be used to interpret/display event times; the time-zone source needs confirmation.
- Movie club entries represent the watch queue or a planned watch and must link to a saved movie. Their start date is optional, and they do not have an end date or time. An entry without a start date appears in the queue. If a movie club entry is created with a start date before the current date, it is created with `held` status.
- Board game club events link to a saved board game, use its title and cover image, and have an optional start date without an end date or times. A manager can select an existing game or create one while creating the event.
- Book club events link to a saved book and use its title and cover image. They support an optional start date only, without an end date or times; entries without a start date appear in the queue, and entries with a past start date are created as held. Sport club events require start and end dates and may include a start and end time.
- Delaying an event should not silently overwrite its original schedule. Whether the system keeps both original and revised scheduling details is an open question.

## Catalog item association

- An event may optionally link to a catalog item when the application has a matching item record. The catalog should support additional kinds over time, such as books, movies, or other club-related content.
- The event also stores an optional title. Users do not have to enter a title.
- If an event is linked to a catalog item and its title is omitted, the event title is derived from the linked item's title. The UI should show that item title as the event title.
- A user may provide a custom title, including when an item is linked. The linked item remains available as the associated item.
- The event may have an optional `avatar_url`. When the associated item has an image, it can be used as the event avatar; for a book or movie this is its cover image. The UI uses a fallback when no avatar URL is available.
- If no title is entered and no item is linked, the event is still valid and the UI can use a neutral label such as “Club event.”
- Use a generic reference name such as `linked_item_id`, rather than embedding supported item kinds in the field name. The catalog item should carry its own kind/type so new kinds can be added without changing the event reference field. If items remain in separate tables, the association design must specify how the generic ID identifies its target.
- Movie clubs require events to link to a saved movie. Movie search checks the local catalog for exact-title matches before querying TMDB; selecting a TMDB result saves it first, then links the new integer movie ID. Other catalog item types may use the generic reference in future.
- Board game clubs require `linked_item_id` to identify a saved board game. The event title and image are derived from that game, so they are not separately editable on the event.

## Visibility

- A club member can list and view that club's events.
- A user who is not a member cannot view events for a private club. Event APIs must apply the same membership and club-visibility rules as club details.
- Events for deleted clubs are excluded from normal event listings.
- Event visibility is inherited from the club; there is no separate public/private event setting in this scope.

## Required data

### Event

| Field | Requirement |
| --- | --- |
| `id` | Unique event identifier |
| `club_id` | Required reference to the owning club |
| `title` | Optional user-provided title; for board game events it is derived from the linked game |
| `linked_item_id` | Optional reference to an associated catalog item; required for board game club events |
| `avatar_url` | Optional image URL; for movie and board game entries it is derived from the linked catalog item's cover |
| `start_date` | Required for sport events; optional for movie, book, and board game entries |
| `end_date` | Required for sport events, on or after `start_date`; null for movie, book, and board game entries |
| `start_time` | Optional for sport events; null for book, movie, and board game entries |
| `end_time` | Optional for sport events; must be supplied with `start_time`; null for book, movie, and board game entries |
| `status` | `scheduled`, `delayed`, `cancelled`, `held`, or `deleted` |
| `created_by` | Profile that created the event |
| `created_at`, `updated_at` | Creation and last-update timestamps |
| `deleted_at` | Null until soft-deleted; then the deletion timestamp |
| `deleted_by` | Null until soft-deleted; then the profile that deleted it |

If delayed-event schedule history is required, store the prior and revised schedule in a separate history record rather than losing the original values.

## Required application capabilities

- Create an event for a club.
- Open the creation form from a Create event button. Show upcoming events, the movie queue where applicable, and held events in separate sections.
- For movie clubs, allow creation with no start date to add an item to the queue; create entries with a past start date as held.
- For book clubs, let managers select a saved book and create a queue entry without a date or a dated entry with a single start date.
- For board game clubs, let managers select an existing game or create a catalog game by title, then create an event with the game's title and cover and an optional single start date.
- List and view events for a club, subject to club membership and visibility.
- Represent all-day and timed events, including events spanning more than one date.
- Optionally associate an event with a generic catalog item and derive its displayed title when no custom title was entered.
- Optionally display the associated item's image as the event avatar, including book and movie covers.
- Update an event's status among the defined lifecycle states.
- Keep cancelled and held events visible as history.
- Soft-delete events by setting `status` to `deleted` and recording `deleted_at` and `deleted_by`; exclude them from normal event views.

## Acceptance criteria

1. Every event belongs to exactly one club. Sport events require start and end dates with the end on or after the start; movie, book, and board game entries have an optional start date and no end date.
2. Book club events are date-only. Sport events may have times; when provided, both start and end times are required.
3. A catalog item association is optional. When it exists and no custom title is set, the linked item's title is shown as the event title.
4. An event with neither custom title nor linked item can still be created and shown with a neutral fallback label.
5. Club members can see events for their club; non-members cannot see private-club events through lists or direct event access.
6. A delayed or cancelled event is visibly distinguished from a scheduled event, and a held event is represented as completed.
7. Cancelled and held events remain accessible in the club's event history.
8. A deleted event has `status = deleted`, a deletion timestamp, and the profile that deleted it; normal event listings do not return it.
9. The generic item reference can support additional catalog item kinds without renaming the event field. An associated item's image may be shown as the event avatar.
10. Event creation begins from a button, and event lists are separated into upcoming, queue (movie and book clubs), and held sections. Movie, book, and board game entries created with a past start date have `held` status.

## Open questions

1. Which roles may create and manage events: all members, or only owners/admins/moderators?
2. Does “delayed” require a revised date/time immediately, and should the event retain its original date/time in history?
3. Should a held event be set manually by a manager, automatically after its end time, or either?
4. What time zone applies to a club, and should an event store a time-zone identifier?
5. What catalog or external source will provide item records and identifiers, and will items live in one catalog table or separate tables?
6. Can members RSVP or see an attendee list? That behavior is not included in this draft.
