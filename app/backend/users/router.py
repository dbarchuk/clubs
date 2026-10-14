from dataclasses import dataclass
from datetime import UTC, date, datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt as jose_jwt
from jose.exceptions import JWTError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backend.users.models import Profile
from app.backend.users.schemas import (
    ManagedUserResponse,
    ManagedUserUpdate,
    ProfileResponse,
    UserManagementResponse,
)
from app.core.config import settings
from app.core.database import get_db

router = APIRouter(prefix="/users", tags=["users"])

security = HTTPBearer()


def is_superuser_email(email: str) -> bool:
    normalized = email.strip().lower()
    return any(
        configured.strip().lower() == normalized
        for configured in settings.superuser_emails
    )


def profile_response(profile: Profile) -> ProfileResponse:
    return ProfileResponse.model_validate(profile).model_copy(
        update={
            "is_active": profile.is_active,
            "is_superuser": is_superuser_email(profile.email),
        }
    )


@dataclass(frozen=True)
class SupabaseUser:
    user_id: str
    email: str
    display_name: str
    avatar_url: str | None


def get_metadata_string(metadata: object, *keys: str) -> str | None:
    if not isinstance(metadata, dict):
        return None
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> SupabaseUser:
    token = credentials.credentials
    if not settings.supabase_url or not settings.supabase_jwks_url:
        raise HTTPException(status_code=503, detail="Supabase authentication is not configured")

    try:
        header = jose_jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    key_id = header.get("kid")
    algorithm = header.get("alg")
    if not key_id or algorithm not in {"ES256", "RS256"}:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(settings.supabase_jwks_url)
            response.raise_for_status()
        jwks = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="Unable to verify token") from exc

    signing_key = next(
        (key for key in jwks.get("keys", []) if key.get("kid") == key_id),
        None,
    )
    if signing_key is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        payload = jose_jwt.decode(
            token,
            key=signing_key,
            algorithms=[algorithm],
            audience="authenticated",
            issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1",
        )
        user_id = payload.get("sub")
        email = payload.get("email")
        user_metadata = payload.get("user_metadata")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    if not isinstance(email, str) or not email.strip():
        raise HTTPException(status_code=401, detail="An email address is required")
    email = email.strip().lower()

    email_name = email.split("@", maxsplit=1)[0] if email else None
    if not email_name:
        email_name = None
    display_name = (
        get_metadata_string(user_metadata, "display_name", "full_name", "name")
        or email_name
        or "Member"
    )
    avatar_url = get_metadata_string(user_metadata, "avatar_url", "picture")

    return SupabaseUser(
        user_id=user_id,
        email=email,
        display_name=display_name,
        avatar_url=avatar_url,
    )


async def get_current_profile(
    user: SupabaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Profile:
    result = db.execute(select(Profile).where(Profile.user_id == user.user_id))
    profile = result.scalar_one_or_none()

    if not profile:
        profile = Profile(
            user_id=user.user_id,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
        )
        db.add(profile)
        try:
            db.commit()
            db.refresh(profile)
        except IntegrityError:
            db.rollback()
            # Another request may have created this user's profile concurrently.
            profile = db.execute(
                select(Profile).where(Profile.user_id == user.user_id)
            ).scalar_one_or_none()
            if profile is None:
                raise

    return profile


async def get_active_profile(
    profile: Profile = Depends(get_current_profile),
) -> Profile:
    if not profile.is_active:
        raise HTTPException(status_code=403, detail="This account is inactive")
    return profile


@router.get("/me", response_model=ProfileResponse)
async def get_me(profile: Profile = Depends(get_current_profile)) -> ProfileResponse:
    return profile_response(profile)


@router.get("/management", response_model=UserManagementResponse)
async def get_user_management(
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> UserManagementResponse:
    superuser = is_superuser_email(profile.email)
    if not profile.is_admin and not superuser:
        raise HTTPException(status_code=403, detail="Administrator access is required")
    users = db.scalars(select(Profile).order_by(Profile.display_name, Profile.email)).all()
    return UserManagementResponse(
        users=[
            ManagedUserResponse(
                id=user.id,
                email=user.email,
                display_name=user.display_name,
                is_active=user.is_active,
                is_admin=user.is_admin,
                is_superuser=is_superuser_email(user.email),
                created_at=user.created_at,
            )
            for user in users
        ],
        current_user_is_superuser=superuser,
    )


@router.patch("/management/{profile_id}", response_model=ManagedUserResponse)
async def update_managed_user(
    profile_id: str,
    payload: ManagedUserUpdate,
    actor: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ManagedUserResponse:
    actor_is_superuser = is_superuser_email(actor.email)
    if not actor.is_admin and not actor_is_superuser:
        raise HTTPException(status_code=403, detail="Administrator access is required")
    target = db.get(Profile, profile_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.is_active is False and actor.id == target.id:
        raise HTTPException(status_code=403, detail="You cannot deactivate your own account")
    if payload.is_active is False and is_superuser_email(target.email):
        raise HTTPException(status_code=403, detail="Superuser accounts cannot be deactivated")
    if payload.is_admin is False and target.is_admin and not actor_is_superuser:
        raise HTTPException(status_code=403, detail="Only a superuser can remove administrator access")
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.is_admin is not None:
        target.is_admin = payload.is_admin
    db.commit()
    db.refresh(target)
    return ManagedUserResponse(
        id=target.id,
        email=target.email,
        display_name=target.display_name,
        is_active=target.is_active,
        is_admin=target.is_admin,
        is_superuser=is_superuser_email(target.email),
        created_at=target.created_at,
    )


@router.get("", response_model=list[dict[str, object]])
async def list_users(
    profile: Profile = Depends(get_active_profile),
) -> list[dict[str, object]]:
    if not profile.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access is required")
    if not settings.database_url or not settings.supabase_secret_key:
        raise HTTPException(status_code=503, detail="Supabase user listing is not configured")

    users: list[dict[str, object]] = []
    page = 1
    per_page = 100
    headers = {"apikey": settings.supabase_secret_key.get_secret_value()}
    endpoint = f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            while True:
                response = await client.get(
                    endpoint,
                    headers=headers,
                    params={"page": page, "per_page": per_page},
                )
                response.raise_for_status()
                payload = response.json()

                if not isinstance(payload, dict) or not isinstance(payload.get("users"), list):
                    raise HTTPException(
                        status_code=502,
                        detail="Invalid response from Supabase user listing",
                    )

                page_users = payload["users"]
                if not all(isinstance(user, dict) for user in page_users):
                    raise HTTPException(
                        status_code=502,
                        detail="Invalid response from Supabase user listing",
                    )

                users.extend(page_users)
                if len(page_users) < per_page:
                    return users
                page += 1
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Unable to retrieve Supabase users") from exc


@router.put("/me", response_model=ProfileResponse)
async def update_me(
    request: Request,
    profile: Profile = Depends(get_active_profile),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    data = await request.json()

    if "display_name" in data:
        profile.display_name = data["display_name"]
    if "avatar_url" in data:
        profile.avatar_url = data["avatar_url"]
    if "date_of_birth" in data:
        try:
            profile.date_of_birth = (
                date.fromisoformat(data["date_of_birth"])
                if data["date_of_birth"]
                else None
            )
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail="date_of_birth must be a valid ISO date",
            ) from exc
    if "bio" in data:
        profile.bio = data["bio"]

    profile.updated_at = datetime.now(UTC).replace(tzinfo=None)

    db.add(profile)
    db.commit()
    db.refresh(profile)

    return profile_response(profile)
