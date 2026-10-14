from datetime import UTC, datetime
import hashlib
import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backend.clubs.models import (
    Club,
    ClubDeletionRequest,
    ClubInviteCode,
    ClubMember,
    ClubMemberAccessType,
    ClubType,
)
from app.backend.clubs.schemas import (
    ClubCreate,
    ClubDeletionRequestResponse,
    ClubDeletionReview,
    ClubJoinResponse,
    ClubMemberResponse,
    ClubMemberRoleUpdate,
    ClubResponse,
    ClubUpdate,
    InviteCodeCreated,
    InviteCodeResponse,
    PaginatedClubs,
    PaginationParams,
    PrivateClubJoin,
)
from app.backend.users.models import Profile
from app.backend.users.router import get_active_profile
from app.core.database import get_db

router = APIRouter(prefix="/clubs", tags=["clubs"])


def get_active_club(db: Session, club_id: str) -> Club:
    club = db.scalar(
        select(Club).where(Club.id == club_id, Club.deleted_at.is_(None))
    )
    if club is None:
        raise HTTPException(status_code=404, detail="Club not found")
    return club


def get_member_access(
    db: Session, club_id: str, profile_id: str
) -> ClubMemberAccessType | None:
    return db.scalar(
        select(ClubMember.access_type).where(
            ClubMember.club_id == club_id,
            ClubMember.user_id == profile_id,
        )
    )


def require_club_manager(
    db: Session, club_id: str, profile_id: str
) -> Club:
    club = get_active_club(db, club_id)
    access_type = get_member_access(db, club_id, profile_id)
    if access_type not in {
        ClubMemberAccessType.OWNER,
        ClubMemberAccessType.ADMIN,
    }:
        raise HTTPException(status_code=403, detail="Club manager access is required")
    return club


def require_platform_admin(profile: Profile) -> None:
    if not profile.is_admin:
        raise HTTPException(status_code=403, detail="Platform admin access is required")


def soft_delete_club(db: Session, club: Club, profile: Profile) -> None:
    deleted_at = datetime.now(UTC).replace(tzinfo=None)
    club.deleted_at = deleted_at
    club.deleted_by = profile.id
    db.execute(
        update(ClubInviteCode)
        .where(
            ClubInviteCode.club_id == club.id,
            ClubInviteCode.revoked_at.is_(None),
        )
        .values(revoked_at=deleted_at, revoked_by=profile.id)
    )


def get_code_hash(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


@router.get("", response_model=PaginatedClubs)
async def list_clubs(
    pagination: Annotated[PaginationParams, Depends()],
    club_type: Annotated[ClubType | None, Query()] = None,
    scope: Annotated[Literal["my", "public"], Query()] = "my",
    search: Annotated[str | None, Query(max_length=100)] = None,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> PaginatedClubs:
    statement = select(Club).where(Club.deleted_at.is_(None))
    if club_type is not None:
        statement = statement.where(Club.club_type == club_type)
    if scope == "my":
        statement = statement.where(
            Club.memberships.any(ClubMember.user_id == profile.id)
        )
    else:
        statement = statement.where(
            Club.is_public.is_(True),
            ~Club.memberships.any(ClubMember.user_id == profile.id),
        )
    if search and search.strip():
        statement = statement.where(Club.title.ilike(f"%{search.strip()}%"))

    clubs = list(
        db.scalars(
            statement.order_by(Club.created_at.desc(), Club.id)
            .offset((pagination.page - 1) * pagination.size)
            .limit(pagination.size + 1)
        ).all()
    )
    has_more = len(clubs) > pagination.size
    items = clubs[: pagination.size]
    access_types = {
        club_id: access_type
        for club_id, access_type in db.execute(
            select(ClubMember.club_id, ClubMember.access_type).where(
                ClubMember.user_id == profile.id,
                ClubMember.club_id.in_([club.id for club in items]),
            )
        ).all()
    } if items else {}

    return PaginatedClubs(
        items=[
            ClubResponse.model_validate(club).model_copy(
                update={"my_access_type": access_types.get(club.id)}
            )
            for club in items
        ],
        page=pagination.page,
        size=pagination.size,
        has_more=has_more,
    )


@router.post("", response_model=ClubResponse, status_code=status.HTTP_201_CREATED)
async def create_club(
    club_data: ClubCreate,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ClubResponse:
    club = Club(
        club_type=club_data.club_type,
        title=club_data.title,
        avatar_url=str(club_data.avatar_url) if club_data.avatar_url else None,
        is_public=club_data.is_public,
        created_by=profile.id,
    )
    club.memberships.append(
        ClubMember(user_id=profile.id, access_type=ClubMemberAccessType.OWNER)
    )
    db.add(club)
    db.commit()
    db.refresh(club)
    return ClubResponse.model_validate(club).model_copy(
        update={"my_access_type": ClubMemberAccessType.OWNER}
    )


@router.patch("/{club_id}", response_model=ClubResponse)
async def update_club(
    club_id: str,
    club_data: ClubUpdate,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ClubResponse:
    club = require_club_manager(db, club_id, profile.id)
    changes = club_data.model_dump(exclude_unset=True)
    if "avatar_url" in changes:
        club.avatar_url = str(changes["avatar_url"]) if changes["avatar_url"] else None
    if "club_type" in changes:
        club.club_type = changes["club_type"]
    if "title" in changes:
        club.title = changes["title"]
    db.commit()
    db.refresh(club)
    return ClubResponse.model_validate(club).model_copy(
        update={"my_access_type": get_member_access(db, club_id, profile.id)}
    )


@router.post("/join-private", response_model=ClubJoinResponse)
async def join_private_club(
    payload: PrivateClubJoin,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ClubJoinResponse:
    code_hash = get_code_hash(payload.invite_code)
    club = db.scalar(
        select(Club)
        .join(ClubInviteCode, ClubInviteCode.club_id == Club.id)
        .where(
            ClubInviteCode.code_hash == code_hash,
            ClubInviteCode.revoked_at.is_(None),
            Club.deleted_at.is_(None),
            Club.is_public.is_(False),
        )
    )
    if club is None:
        raise HTTPException(status_code=404, detail="Invalid or inactive invite code")

    existing = db.get(ClubMember, (club.id, profile.id))
    if existing is not None:
        return ClubJoinResponse(club_id=club.id, already_member=True)

    db.add(
        ClubMember(
            club_id=club.id,
            user_id=profile.id,
            access_type=ClubMemberAccessType.MEMBER,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.get(ClubMember, (club.id, profile.id)) is None:
            raise
        return ClubJoinResponse(club_id=club.id, already_member=True)
    return ClubJoinResponse(club_id=club.id, already_member=False)


@router.post("/{club_id}/join", response_model=ClubJoinResponse)
async def join_public_club(
    club_id: str,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ClubJoinResponse:
    club = get_active_club(db, club_id)
    if not club.is_public:
        raise HTTPException(status_code=403, detail="Private clubs require an invite code")

    existing = db.get(ClubMember, (club.id, profile.id))
    if existing is not None:
        return ClubJoinResponse(club_id=club.id, already_member=True)

    db.add(
        ClubMember(
            club_id=club.id,
            user_id=profile.id,
            access_type=ClubMemberAccessType.MEMBER,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.get(ClubMember, (club.id, profile.id)) is None:
            raise
        return ClubJoinResponse(club_id=club.id, already_member=True)
    return ClubJoinResponse(club_id=club.id, already_member=False)


@router.get("/{club_id}/members", response_model=list[ClubMemberResponse])
async def list_club_members(
    club_id: str,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> list[ClubMemberResponse]:
    require_club_manager(db, club_id, profile.id)
    rows = db.execute(
        select(ClubMember, Profile)
        .join(Profile, Profile.id == ClubMember.user_id)
        .where(ClubMember.club_id == club_id)
        .order_by(ClubMember.access_type, Profile.display_name, Profile.id)
    ).all()
    return [
        ClubMemberResponse(
            user_id=member.user_id,
            display_name=member_profile.display_name,
            avatar_url=member_profile.avatar_url,
            access_type=member.access_type,
        )
        for member, member_profile in rows
    ]


@router.patch(
    "/{club_id}/members/{member_id}", response_model=ClubMemberResponse
)
async def update_club_member_role(
    club_id: str,
    member_id: str,
    payload: ClubMemberRoleUpdate,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ClubMemberResponse:
    require_club_manager(db, club_id, profile.id)
    manager_access = get_member_access(db, club_id, profile.id)
    member = db.get(ClubMember, (club_id, member_id))
    if member is None:
        raise HTTPException(status_code=404, detail="Club member not found")
    if member.access_type == ClubMemberAccessType.OWNER:
        raise HTTPException(status_code=409, detail="The club owner role cannot be changed")
    if (
        manager_access == ClubMemberAccessType.ADMIN
        and member.access_type == ClubMemberAccessType.ADMIN
        and payload.access_type != "admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only the club owner can remove or demote club admins",
        )
    if member_id == profile.id:
        raise HTTPException(status_code=409, detail="You cannot change your own club role")

    member.access_type = ClubMemberAccessType(payload.access_type)
    db.commit()
    db.refresh(member)
    member_profile = db.get(Profile, member_id)
    if member_profile is None:
        raise HTTPException(status_code=404, detail="Club member not found")
    return ClubMemberResponse(
        user_id=member.user_id,
        display_name=member_profile.display_name,
        avatar_url=member_profile.avatar_url,
        access_type=member.access_type,
    )


@router.get(
    "/{club_id}/invite-codes", response_model=list[InviteCodeResponse]
)
async def list_invite_codes(
    club_id: str,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> list[ClubInviteCode]:
    club = require_club_manager(db, club_id, profile.id)
    if club.is_public:
        raise HTTPException(status_code=409, detail="Only private clubs use invite codes")
    return list(
        db.scalars(
            select(ClubInviteCode)
            .where(
                ClubInviteCode.club_id == club_id,
                ClubInviteCode.revoked_at.is_(None),
            )
            .order_by(ClubInviteCode.created_at.desc())
        ).all()
    )


@router.post(
    "/{club_id}/invite-codes",
    response_model=InviteCodeCreated,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite_code(
    club_id: str,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> InviteCodeCreated:
    club = require_club_manager(db, club_id, profile.id)
    if club.is_public:
        raise HTTPException(status_code=409, detail="Only private clubs use invite codes")
    active_code = db.scalar(
        select(ClubInviteCode.id).where(
            ClubInviteCode.club_id == club_id,
            ClubInviteCode.revoked_at.is_(None),
        )
    )
    if active_code is not None:
        raise HTTPException(status_code=409, detail="This club already has an active invite code")

    code = "".join(secrets.choice(INVITE_CODE_ALPHABET) for _ in range(8))
    invite_code = ClubInviteCode(
        club_id=club_id,
        code_hash=get_code_hash(code),
        code=code,
        created_by=profile.id,
    )
    db.add(invite_code)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="This club already has an active invite code"
        ) from exc
    db.refresh(invite_code)
    return InviteCodeCreated(
        id=invite_code.id,
        code=code,
        created_at=invite_code.created_at,
    )


@router.delete(
    "/{club_id}/invite-codes/{invite_code_id}",
    response_model=InviteCodeResponse,
)
async def revoke_invite_code(
    club_id: str,
    invite_code_id: str,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ClubInviteCode:
    club = require_club_manager(db, club_id, profile.id)
    if club.is_public:
        raise HTTPException(status_code=409, detail="Only private clubs use invite codes")
    invite_code = db.scalar(
        select(ClubInviteCode).where(
            ClubInviteCode.id == invite_code_id,
            ClubInviteCode.club_id == club_id,
            ClubInviteCode.revoked_at.is_(None),
        )
    )
    if invite_code is None:
        raise HTTPException(status_code=404, detail="Active invite code not found")
    invite_code.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    invite_code.revoked_by = profile.id
    db.commit()
    db.refresh(invite_code)
    return invite_code


@router.get(
    "/deletion-requests", response_model=list[ClubDeletionRequestResponse]
)
async def list_deletion_requests(
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> list[ClubDeletionRequest]:
    require_platform_admin(profile)
    return list(
        db.scalars(
            select(ClubDeletionRequest)
            .where(ClubDeletionRequest.status == "pending")
            .order_by(ClubDeletionRequest.requested_at, ClubDeletionRequest.id)
        ).all()
    )


@router.patch(
    "/deletion-requests/{request_id}", response_model=ClubDeletionRequestResponse
)
async def review_deletion_request(
    request_id: str,
    decision: ClubDeletionReview,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ClubDeletionRequest:
    require_platform_admin(profile)
    deletion_request = db.get(ClubDeletionRequest, request_id)
    if deletion_request is None:
        raise HTTPException(status_code=404, detail="Deletion request not found")
    if deletion_request.status != "pending":
        raise HTTPException(status_code=409, detail="Deletion request has already been reviewed")
    club = get_active_club(db, deletion_request.club_id)
    reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    deletion_request.status = "approved" if decision.approved else "rejected"
    deletion_request.reviewed_by = profile.id
    deletion_request.reviewed_at = reviewed_at
    if decision.approved:
        soft_delete_club(db, club, profile)
    db.commit()
    db.refresh(deletion_request)
    return deletion_request


@router.get("/{club_id}", response_model=ClubResponse)
async def get_club(
    club_id: str,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ClubResponse:
    club = get_active_club(db, club_id)
    access_type = get_member_access(db, club_id, profile.id)
    if access_type is None:
        raise HTTPException(status_code=404, detail="Club not found")
    return ClubResponse.model_validate(club).model_copy(
        update={"my_access_type": access_type}
    )


@router.delete("/{club_id}", response_model=None)
async def delete_club(
    club_id: str,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> Response | JSONResponse:
    club = get_active_club(db, club_id)
    if club.created_by != profile.id:
        raise HTTPException(status_code=403, detail="Only the club owner can delete it")

    if club.is_public:
        has_other_members = db.scalar(
            select(ClubMember.user_id)
            .where(
                ClubMember.club_id == club.id,
                ClubMember.user_id != profile.id,
            )
            .limit(1)
        ) is not None
        if has_other_members:
            pending_request = db.scalar(
                select(ClubDeletionRequest).where(
                    ClubDeletionRequest.club_id == club.id,
                    ClubDeletionRequest.status == "pending",
                )
            )
            if pending_request is None:
                pending_request = ClubDeletionRequest(
                    club_id=club.id,
                    requested_by=profile.id,
                )
                db.add(pending_request)
                try:
                    db.commit()
                    db.refresh(pending_request)
                except IntegrityError:
                    db.rollback()
                    pending_request = db.scalar(
                        select(ClubDeletionRequest).where(
                            ClubDeletionRequest.club_id == club.id,
                            ClubDeletionRequest.status == "pending",
                        )
                    )
                    if pending_request is None:
                        raise
            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content=ClubDeletionRequestResponse.model_validate(
                    pending_request
                ).model_dump(mode="json"),
            )

    soft_delete_club(db, club, profile)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
