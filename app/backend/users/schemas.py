from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, model_validator

class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    email: str
    display_name: str
    avatar_url: str | None
    date_of_birth: date | None
    bio: str | None
    is_admin: bool
    is_active: bool
    is_superuser: bool = False
    created_at: datetime
    updated_at: datetime


class ManagedUserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_active: bool
    is_admin: bool
    is_superuser: bool
    created_at: datetime


class UserManagementResponse(BaseModel):
    users: list[ManagedUserResponse]
    current_user_is_superuser: bool


class ManagedUserUpdate(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None

    @model_validator(mode="after")
    def require_update(self) -> "ManagedUserUpdate":
        if not self.model_fields_set or any(
            getattr(self, field) is None for field in self.model_fields_set
        ):
            raise ValueError("Provide a non-null is_active or is_admin value")
        return self
