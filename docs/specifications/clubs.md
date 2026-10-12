# Clubs

**Status:** Draft requirements  
**Scope:** Creating public and private clubs, joining, private-club invitations, deletion requests, and soft deletion.

## Purpose

Clubs let registered users organize around a shared interest. A club is either public, so registered users can join directly, or private, so users need an active invite code to join.

## Actors and permissions

- **Registered user:** Can create clubs, join public clubs, and join private clubs with a valid invite code.
- **Club owner:** The registered user who created the club. The owner is a member of the club and can manage it.
- **Club admin:** A club member with the club-level `admin` access type. Owners assign and remove admins. Admins may assign other admins but cannot remove or demote them. Owners and admins can assign and remove moderators.
- **Platform admin:** A user whose profile has `is_admin = true`. Platform admins can process public-club deletion requests.

Every club has one owner. Creating a club also makes its owner a member with the owner access type.

## Club visibility and membership

### Public clubs

- Any registered user can create a public club.
- Any registered user can join a public club without an invite code.
- Joining adds the user as a club member. Repeated join requests must not create duplicate memberships.

### Private clubs

- Any registered user can create a private club.
- A non-member must provide an active invite code to join.
- The backend validates the code and confirms it belongs to an active private club before adding the requesting user as a member.
- Invalid, deleted, or otherwise inactive codes do not grant membership.
- Private clubs and their details are visible only to members. A user who is not a member must not be able to discover private club details through browse, search, or API responses.

## Private-club invite codes

- Club management provides an invite-code menu to the owner and club-level admins.
- A manager can create a secret code for the private club and share it with prospective members.
- Invite codes are exactly 8 characters, using uppercase letters and digits while omitting ambiguous characters (`I`, `L`, `O`, `0`, and `1`).
- Only one invite code can be active for a private club at a time. The code is reusable until a manager deactivates it; a replacement can be created after deactivation.
- A registered user can submit a code through the **Join private club** UI.
- The backend validates the submitted code and adds the user to that club when it is valid.
- A manager can delete/deactivate an invite code. Once deactivated, it cannot admit additional members. Existing memberships are unchanged.
- Invite codes are secret bearer credentials. They must not be included in public club listings or exposed to users who are not authorized to manage the club.

## Club deletion

Club deletion is always a soft delete. A deleted club is marked with `deleted_at` and `deleted_by`; its row and related history remain stored. Deleted clubs are excluded from normal lists, searches, join flows, and management views unless a future restore or audit feature explicitly exposes them.

### Public club

- The owner can delete a public club directly when it has no members other than the owner.
- If at least one other member has joined, the owner cannot delete the club directly. The owner submits a deletion request for a platform admin (`Profile.is_admin = true`) to review.
- A platform admin can delete the club while processing the request. The soft-delete audit fields identify the admin who performed the deletion.

### Private club

- The owner can delete a private club at any time, regardless of its member count.
- Soft deletion prevents new joins and invalidates all invite codes for that club.

## Required data

### Club

The existing club fields remain in scope: `id`, `club_type`, `title`, `avatar_url`, `is_public`, `created_by`, `created_at`, and `updated_at`. Add:

| Field | Type | Requirement |
| --- | --- | --- |
| `deleted_at` | datetime or null | Null while active; set when soft-deleted |
| `deleted_by` | profile ID or null | Null while active; set to the profile that performed the deletion |

### Membership

Membership uniquely identifies a `(club_id, user_id)` pair and records the user's club-level access type. The creator is recorded as the owner. Public and private join flows create a member-level membership unless a separate approved management action assigns another access type.

### Private invite code

The system needs a persisted association between a private club and each invite code, including whether the code is active. The code must be unguessable. Whether raw codes are stored or represented by a verifier is an implementation decision.

### Public-club deletion request

The system needs a persisted request associated with the club and requesting owner, with enough state to prevent duplicate pending requests and to record the platform admin's decision. Requests have `pending`, `approved`, or `rejected` status.

## Required application capabilities

- Create public and private clubs for an authenticated registered user.
- Join an active public club as an authenticated registered user.
- Submit an invite code to join a private club and receive a clear success or failure result.
- Create and deactivate private-club invite codes from club management.
- Request deletion of a public club that has members beyond its owner.
- Let a platform admin review a public-club deletion request and soft-delete the club.
- Let an owner soft-delete a public club with no additional members or any private club.
- Filter soft-deleted clubs and their invite codes out of normal browse, search, and join operations.

## Acceptance criteria

1. A registered user can create either a public or private club and is recorded as its owner and first member.
2. Any registered user can join an active public club; duplicate membership records are not created.
3. A user can join an active private club only by submitting a valid, active invite code for that club.
4. Deactivating an invite code prevents future joins through that code and does not remove existing members.
5. A private club is not discoverable by a non-member through normal listings, search, or club detail APIs.
6. An owner can directly soft-delete a public club with no members beyond the owner.
7. An owner cannot directly soft-delete a public club after another user has joined; submitting a deletion request makes it available for platform-admin review.
8. A platform admin can soft-delete a public club while processing its deletion request.
9. An owner can soft-delete a private club regardless of its membership count.
10. Soft-deleted clubs have `deleted_at` and `deleted_by` set, cannot be joined, and do not appear in normal club listings.

## Open questions

1. Can a club member leave a club? If so, how does leaving affect public-club deletion eligibility?
2. Should the owner be notified when a platform admin approves or rejects a public-club deletion request?
3. Can a soft-deleted club be restored? If so, by whom and what happens to its invite codes and memberships?
4. Can a platform admin delete a public club directly without an owner request?

## Current implementation

The backend supports authenticated club creation and paginated listing. It now also supports direct public-club joining, private-club joining with an invite code, owner/admin invite management, owner deletion, and platform-admin review of public-club deletion requests. Clubs are soft-deleted and hidden from normal lists and join flows. The model uses club access types `owner`, `admin`, `moderator`, and `member`.
# Club details and management

Selecting a club title from the member club list opens that club's details page. Members see club events there. Owners and admins have a **Club management** button that opens a separate management page. Owners and club admins can edit club type, title, and avatar URL. Only the owner can delete a club.

The management page lists club members and their access types. The owner can assign or remove admins and moderators. Admins can assign admins and assign or remove moderators, but cannot remove or demote an admin. No user can change their own role, and the owner role cannot be reassigned.
