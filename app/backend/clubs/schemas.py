from datetime import datetime
from typing import Literal

from pydantic import (
    AliasPath,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
)

from app.backend.clubs.models import ClubMemberAccessType, ClubType


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


class ClubCreate(BaseModel):
    club_type: ClubType
    title: str = Field(min_length=1, max_length=50)
    avatar_url: HttpUrl | None = None
    is_public: bool = False

    @field_validator("title")
    @classmethod
    def strip_title(cls, title: str) -> str:
        title = title.strip()
        if not title:
            raise ValueError("Title must not be blank")
        return title


class ClubUpdate(BaseModel):
    club_type: ClubType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=50)
    avatar_url: HttpUrl | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, title: str | None) -> str | None:
        if title is None:
            raise ValueError("Title must not be null")
        title = title.strip()
        if not title:
            raise ValueError("Title must not be blank")
        return title

    @field_validator("club_type")
    @classmethod
    def require_club_type(cls, club_type: ClubType | None) -> ClubType:
        if club_type is None:
            raise ValueError("Club type must not be null")
        return club_type

    @model_validator(mode="after")
    def require_changes(self) -> "ClubUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class ClubResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    club_type: ClubType
    title: str
    avatar_url: str | None
    is_public: bool
    created_by: str
    created_at: datetime
    updated_at: datetime
    my_access_type: ClubMemberAccessType | None = None


class PrivateClubJoin(BaseModel):
    invite_code: str = Field(pattern=r"^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$")


class ClubJoinResponse(BaseModel):
    club_id: str
    already_member: bool


class ClubMemberResponse(BaseModel):
    user_id: str
    display_name: str
    avatar_url: str | None
    access_type: ClubMemberAccessType


class ClubMemberRoleUpdate(BaseModel):
    access_type: Literal["admin", "moderator", "member"]


class InviteCodeCreated(BaseModel):
    id: str
    code: str
    created_at: datetime


class InviteCodeResponse(BaseModel):
    id: str
    code: str | None
    created_at: datetime
    revoked_at: datetime | None


class ClubDeletionRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    club_id: str
    club_title: str = Field(validation_alias=AliasPath("club", "title"))
    requested_by: str
    requester_display_name: str = Field(
        validation_alias=AliasPath("requester", "display_name")
    )
    requested_at: datetime
    status: Literal["pending", "approved", "rejected"]
    reviewed_by: str | None
    reviewed_at: datetime | None


class ClubDeletionReview(BaseModel):
    approved: bool


class PaginatedClubs(BaseModel):
    items: list[ClubResponse]
    page: int
    size: int
    has_more: bool
