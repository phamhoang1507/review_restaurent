from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import (
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.modules.auth.schemas import LoginRequest, RegisterRequest
from app.modules.users.models import User

DUMMY_PASSWORD_HASH = hash_password("dummy-password-not-used-for-login")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def register_user(session: Session, data: RegisterRequest) -> User:
    user = User(
        email=normalize_email(str(data.email)),
        password_hash=hash_password(data.password),
        display_name=data.display_name,
        role="user",
        is_active=True,
    )

    session.add(user)

    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()

        diagnostic = getattr(exc.orig, "diag", None)
        constraint_name = getattr(diagnostic, "constraint_name", None)

        if constraint_name == "uq_users_email_lower":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email is already registered",
            ) from exc

        raise

    return user


def authenticate_user(session: Session, data: LoginRequest) -> User:
    user = session.scalar(
        select(User).where(
            User.email == normalize_email(str(data.email)),
        )
    )

    stored_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_valid = verify_password(data.password, stored_hash)

    if user is None or not password_valid or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(data.password)
        session.commit()

    return user