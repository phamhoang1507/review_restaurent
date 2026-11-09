import argparse
import sys
from getpass import getpass

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.modules.users.models import User


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

    arguments = parser.parse_args()

    if arguments.command == "create-admin":
        return create_admin(
            email=arguments.email,
            display_name=arguments.display_name,
        )

    return 1


if __name__ == "__main__":
    raise SystemExit(main())