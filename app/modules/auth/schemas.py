from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=12, max_length=128)
    display_name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=1,
            max_length=100,
        ),
    ]


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int