from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

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
    created_at: datetime
    updated_at: datetime
