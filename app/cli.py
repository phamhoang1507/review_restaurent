from contextlib import closing
import argparse
import sys
from getpass import getpass

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.modules.users.models import User
from app.services.storage import create_s3_client
from app.services.storage_cleanup import (
    enqueue_stale_pending_uploads,
    process_storage_deletion_jobs,
)


def create_admin(email: str, display_name: str) -> int:
    try:
        normalized_email = validate_email(
            email.strip(),
            check_deliverability=False,
        ).normalized.lower()
    except EmailNotValidError as exc:
        print(f"Invalid email: {exc}", file=sys.stderr)
        return 1

    if len(normalized_email) > 254:
        print("Email must not exceed 254 characters.", file=sys.stderr)
        return 1

    normalized_name = display_name.strip()

    if not 1 <= len(normalized_name) <= 100:
        print(
            "Display name must contain 1 to 100 characters.",
            file=sys.stderr,
        )
        return 1

    with SessionLocal() as session:
        existing_id = session.scalar(
            select(User.id).where(
                func.lower(User.email) == normalized_email,
            )
        )

        if existing_id is not None:
            print(
                "Email already exists. No account was changed.",
                file=sys.stderr,
            )
            return 1

    password = getpass("Admin password: ")
    confirmation = getpass("Confirm password: ")

    if not 12 <= len(password) <= 128:
        print(
            "Password must contain 12 to 128 characters.",
            file=sys.stderr,
        )
        return 1

    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    password_hash = hash_password(password)

    try:
        with SessionLocal() as session:
            with session.begin():
                admin = User(
                    email=normalized_email,
                    password_hash=password_hash,
                    display_name=normalized_name,
                    role="admin",
                    is_active=True,
                )
                session.add(admin)
                session.flush()
                admin_id = admin.id
    except IntegrityError as exc:
        diagnostic = getattr(exc.orig, "diag", None)

        if getattr(diagnostic, "constraint_name", None) == "uq_users_email_lower":
            print(
                "Email already exists. No account was changed.",
                file=sys.stderr,
            )
            return 1

        raise

    print(f"Admin created: id={admin_id}, email={normalized_email}")
    return 0

def cleanup_storage(limit: int) -> int:
    with closing(
        create_s3_client()
    ) as client, SessionLocal() as session:
        stale_pending = enqueue_stale_pending_uploads(
            session,
            limit=limit,
        )

        deleted, failed = process_storage_deletion_jobs(
            session,
            client,
            limit=limit,
        )

    print(
        "Storage cleanup completed: "
        f"stale_pending={stale_pending}, "
        f"deleted={deleted}, failed={failed}"
    )

    return 1 if failed else 0


def cleanup_limit(value: str) -> int:
    try:
        limit = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "limit must be an integer"
        ) from exc

    if not 1 <= limit <= 1000:
        raise argparse.ArgumentTypeError(
            "limit must be between 1 and 1000"
        )

    return limit


def main() -> int:
    parser = argparse.ArgumentParser(
        description="LocalSpot administration commands",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    admin_parser = commands.add_parser(
        "create-admin",
        help="Create a new active Admin account",
    )
    admin_parser.add_argument("--email", required=True)
    admin_parser.add_argument("--display-name", required=True)

    cleanup_parser = commands.add_parser(
        "cleanup-storage",
        help="Retry pending object-storage deletions",
    )

    cleanup_parser.add_argument(
        "--limit",
        type=cleanup_limit,
        default=100,
        help="Maximum jobs to process (default: 100)",
    )

    arguments = parser.parse_args()

    if arguments.command == "create-admin":
        return create_admin(
            email=arguments.email,
            display_name=arguments.display_name,
        )

    if arguments.command == "cleanup-storage":
        return cleanup_storage(arguments.limit)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())