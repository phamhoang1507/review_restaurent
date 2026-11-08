from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    role: Literal["user", "admin"]
    is_active: bool
    created_at: datetime