# Users and profiles

**Status:** Draft, based on the current implementation  
**Scope:** Supabase authentication, application profile creation and editing, and the user-list API.

This document records behavior already present in the repository. It does not define unimplemented product behavior. Questions that need a product decision are listed at the end.

## Purpose

Users authenticate through Supabase and use an application profile for their identity in Clubs. The profile is stored in the application's PostgreSQL database and is associated with a Supabase Auth user ID.

## Authentication

- The frontend supports email and password sign-up, email and password sign-in, and Google sign-in through Supabase Auth.
- Sign-up collects a display name and sends it to Supabase as user metadata.
- The frontend attempts to upsert a profile after sign-up and creates one after sign-in if one is not found.
- Google sign-in returns to the current application origin. The backend can also derive a display name and avatar from Supabase user metadata when it first creates a profile.
- The frontend sends the Supabase access token as a Bearer token to protected API routes.
- The backend verifies the token against the Supabase JWKS endpoint. It accepts ES256 or RS256 tokens with the `authenticated` audience and the configured Supabase Auth issuer.
- Missing or invalid credentials produce HTTP 401 responses. Missing Supabase verification configuration or an unavailable JWKS endpoint produces HTTP 503.

## Profile data

| Field | Type | Behavior |
| --- | --- | --- |
| `id` | string | Application profile ID; ULID, 26 characters |
| `user_id` | string | Supabase Auth user ID; required and unique |
| `email` | string | Required and unique; normalized to lowercase and trimmed by the model |
| `display_name` | string | Required; initialized from Supabase metadata, then email prefix, then `Member` |
| `avatar_url` | string or null | Initialized from Supabase metadata when available; editable |
| `date_of_birth` | date or null | Editable |
| `bio` | string or null | Editable |
| `is_admin` | boolean | Defaults to `false`; returned by the profile API |
| `created_at` | datetime | Set when the profile is created |
| `updated_at` | datetime | Set on profile update |

Profiles are created lazily by the backend when an authenticated request needs the current profile and no row exists. If concurrent requests attempt to create the same profile, the backend reloads the row after a uniqueness conflict.

## API

All routes are under `/api/users` and require a valid Supabase Bearer token, except where the route behavior below specifies additional configuration.

### `GET /api/users/me`

Returns the authenticated user's profile. Creates the profile on first access when needed.

Response fields are the profile data above. The response excludes Supabase credentials and does not expose another user's profile.

### `PUT /api/users/me`

Updates the authenticated user's `display_name`, `avatar_url`, `date_of_birth`, and `bio`. Fields omitted from the request are left unchanged. The frontend sends null for empty avatar and bio values, and the API stores those nulls. An empty or null date of birth clears that field. A non-empty `date_of_birth` must be an ISO date (`YYYY-MM-DD`); an invalid value returns HTTP 422.

The response is the updated profile. The API does not accept changes to `user_id`, `email`, or `is_admin` through this route.

### `GET /api/users`

Returns Supabase Auth user records, including user and app metadata, by paging through the Supabase admin users endpoint. It requires a valid signed-in user's token and the server-side `SUPABASE_SECRET_KEY`. The current implementation does not check `is_admin` before returning this list. Missing configuration returns HTTP 503; an invalid upstream response or failed request returns HTTP 502.

## User interface

- The login page switches between sign-in and account creation and offers a Google sign-in action.
- The profile page displays the current profile's display name, avatar, bio, admin/member label, email, and date of birth.
- The profile page lets the user edit display name, avatar URL, date of birth, and bio. The UI limits display name to 100 characters and bio to 500 characters.
- Profile loading, save failures, authentication failures, and missing profile data have visible UI states.
- The app shell shows the current user's avatar or initials and display name.

## Current behavior to confirm

These are implementation facts with product or security implications; the code does not establish the intended policy.

1. Should `GET /api/users` be restricted to users where `is_admin` is true? It currently allows any authenticated user and returns Auth metadata for all users.
2. Should profile field limits and validation be enforced by the API as well as the UI? The current update route accepts unvalidated JSON apart from parsing `date_of_birth`.
3. Should email changes, account deletion, password recovery, email verification, or account suspension be in scope for the users feature? No corresponding application flows are defined here.
4. Is `is_admin` solely an administrative flag, and who is allowed to grant or revoke it? The current profile update API does not change it.

## Acceptance criteria represented by the current implementation

- A valid Supabase user can sign in with email/password or Google and access protected application routes.
- An authenticated request to `GET /api/users/me` returns that user's profile and creates it if missing.
- A user can update their own display name, avatar URL, date of birth, and bio; the response reflects the saved values.
- A user cannot update their email, Supabase user ID, or admin flag through `PUT /api/users/me`.
- Invalid non-empty date values are rejected with HTTP 422.
- `GET /api/users` requires authentication and server configuration for Supabase admin user listing.
