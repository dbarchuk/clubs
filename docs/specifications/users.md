# Users and profiles

**Status:** Implemented
**Scope:** Supabase authentication, application profiles, administrator user management, and superuser controls.

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
| `is_active` | boolean | Defaults to `true`; inactive profiles cannot access application features |
| `is_superuser` | boolean | Derived from the configured `SUPERUSER_EMAILS` list; not stored on the profile |
| `created_at` | datetime | Set when the profile is created |
| `updated_at` | datetime | Set on profile update |

Profiles are created lazily by the backend when an authenticated request needs the current profile and no row exists. If concurrent requests attempt to create the same profile, the backend reloads the row after a uniqueness conflict.

## API

All routes are under `/api/users` and require a valid Supabase Bearer token, except where the route behavior below specifies additional configuration.

### `GET /api/users/me`

Returns the authenticated user's profile. Creates the profile on first access when needed.

Response fields are the profile data above. It includes `is_active` and derived `is_superuser`, excludes Supabase credentials, and does not expose another user's profile. This route remains available to inactive accounts so the frontend can explain why access is blocked.

### `PUT /api/users/me`

Updates the authenticated user's `display_name`, `avatar_url`, `date_of_birth`, and `bio`. Fields omitted from the request are left unchanged. The frontend sends null for empty avatar and bio values, and the API stores those nulls. An empty or null date of birth clears that field. A non-empty `date_of_birth` must be an ISO date (`YYYY-MM-DD`); an invalid value returns HTTP 422.

The response is the updated profile. The API does not accept changes to `user_id`, `email`, or `is_admin` through this route.

### `GET /api/users/management`

Returns all application profiles for an active administrator or superuser. Each entry includes display name, email, active/admin flags, derived superuser status, and creation time. The response also indicates whether the current user is a superuser. In the UI, the current user is hidden and remaining users are sorted by profile ID descending; users can be filtered by active status and searched by email or display name.

### `PATCH /api/users/management/{profile_id}`

Accepts one or both of `is_active` and `is_admin`. Active administrators may activate/deactivate accounts and grant administrator access. Changing an existing administrator from `is_admin = true` to `false` requires a superuser. Superuser accounts and the current user's own account cannot be deactivated. The API enforces these rules regardless of frontend controls.

User removal is by deactivation only. The application has no hard-delete operation for application profiles or Supabase Auth users; profile and authentication records are retained when `is_active` is set to `false`.

### `GET /api/users`

Returns Supabase Auth user records, including user and app metadata, by paging through the Supabase admin users endpoint. It requires an active profile with `is_admin = true` and the server-side `SUPABASE_SECRET_KEY`. Other authenticated users receive HTTP 403. Missing configuration returns HTTP 503; an invalid upstream response or failed request returns HTTP 502.

## Roles and access

`SUPERUSER_EMAILS` is a JSON array of email addresses, compared case-insensitively after trimming. It defaults to `["dvbarchuk@gmail.com"]`. Superusers can access user management even if their `is_admin` flag is false, and are the only users who can remove administrator access from an existing administrator. An inactive profile is blocked from feature APIs; the frontend shows an inactive-account message.

## User interface

- The login page switches between sign-in and account creation and offers a Google sign-in action.
- The profile page displays the current profile's display name, avatar, bio, admin/member label, email, and date of birth.
- The profile page lets the user edit display name, avatar URL, date of birth, and bio. The UI limits display name to 100 characters and bio to 500 characters.
- Profile loading, save failures, authentication failures, and missing profile data have visible UI states.
- The app shell shows the current user's avatar or initials and display name. Administrators and superusers can access user management to list profiles and change active/admin status according to server-side role rules.

## Out of scope

Email changes and password recovery are not handled by application profile management. Hard deletion of users is not supported; inactive profile records remain stored. Profile field length validation remains enforced by the frontend only.

## Acceptance criteria represented by the current implementation

- A valid Supabase user can sign in with email/password or Google and access protected application routes.
- An authenticated request to `GET /api/users/me` returns that user's profile and creates it if missing.
- A user can update their own display name, avatar URL, date of birth, and bio; the response reflects the saved values.
- A user cannot update their email, Supabase user ID, or admin flag through `PUT /api/users/me`.
- User management can deactivate accounts but does not hard-delete application profiles or Supabase Auth users.
- Invalid non-empty date values are rejected with HTTP 422.
- `GET /api/users` requires authentication and server configuration for Supabase admin user listing.
- Only superusers can demote an administrator; this rule is enforced by the API.
