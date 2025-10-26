from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserProfile(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    created_at: datetime
    updated_at: datetime
