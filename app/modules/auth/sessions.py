import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.auth_config import get_auth_settings
from app.modules.auth.models import AuthSession
from app.modules.users.models import User


def invalid_refresh_token() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
    )


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def create_auth_session(
    session: Session,
    user_id: int,
) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    expires_at = now + timedelta(
        days=get_auth_settings().refresh_token_days,
    )
    raw_token = generate_refresh_token()

    session.add(
        AuthSession(
            id=uuid4(),
            user_id=user_id,
            family_id=uuid4(),
            token_hash=hash_refresh_token(raw_token),
            created_at=now,
            expires_at=expires_at,
        )
    )
    session.commit()

    return raw_token, expires_at


def lock_auth_session(
    session: Session,
    raw_token: str,
) -> tuple[AuthSession | None, User | None]:
    if not raw_token or len(raw_token) > 512:
        return None, None

    token_hash = hash_refresh_token(raw_token)

    existing = session.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == token_hash,
        )
    )

    if existing is None:
        return None, None

    # Serialize session mutations for the same user.
    # Always acquire the user lock before locking a token row.
    user = session.scalar(
        select(User)
        .where(User.id == existing.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    current = session.scalar(
        select(AuthSession)
        .where(AuthSession.token_hash == token_hash)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    return current, user


def revoke_family(
    session: Session,
    family_id: UUID,
    revoked_at: datetime,
) -> None:
    session.execute(
        update(AuthSession)
        .where(
            AuthSession.family_id == family_id,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=revoked_at)
    )


def rotate_auth_session(
    session: Session,
    raw_token: str,
) -> tuple[User, str, datetime]:
    current, user = lock_auth_session(session, raw_token)
    now = datetime.now(UTC)

    if current is None:
        raise invalid_refresh_token()

    if current.revoked_at is not None:
        revoke_family(session, current.family_id, now)
        session.commit()
        raise invalid_refresh_token()

    if user is None or not user.is_active:
        revoke_family(session, current.family_id, now)
        session.commit()
        raise invalid_refresh_token()

    if current.expires_at <= now:
        raise invalid_refresh_token()

    replacement = generate_refresh_token()
    current.revoked_at = now

    session.add(
        AuthSession(
            id=uuid4(),
            user_id=current.user_id,
            family_id=current.family_id,
            token_hash=hash_refresh_token(replacement),
            created_at=now,
            expires_at=current.expires_at,
        )
    )

    session.commit()

    return user, replacement, current.expires_at


def revoke_auth_session(
    session: Session,
    raw_token: str | None,
) -> None:
    if not raw_token:
        return

    current, _ = lock_auth_session(session, raw_token)

    if current is None:
        return

    revoke_family(
        session,
        current.family_id,
        datetime.now(UTC),
    )
    session.commit()