"""Operator commands.

uv run python -m app.cli generate-key
uv run python -m app.cli create-superadmin --email you@taproga.com
"""

import argparse
import asyncio
import getpass
import sys

from cryptography.fernet import Fernet

from app.clock import utcnow
from app.db import build_engine, build_sessionmaker
from app.models.audit import ActorKind
from app.models.user import AccountType, Locale, User
from app.repositories.users import UserRepository
from app.security.passwords import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, hash_password
from app.services.audit import Actor, AuditAction, AuditService, AuditTarget
from app.settings import get_settings


def _prompt_password() -> str:
    password = getpass.getpass("Password: ")
    if not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
        sys.exit(f"Password must be {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} characters.")
    if getpass.getpass("Repeat password: ") != password:
        sys.exit("Passwords do not match.")
    return password


async def create_superadmin(email: str) -> None:
    settings = get_settings()
    engine = build_engine(settings)
    try:
        async with build_sessionmaker(engine)() as session:
            users = UserRepository(session)
            if await users.get_by_email(email) is not None:
                sys.exit("An account with this email already exists.")
            password = _prompt_password()
            user = User(
                email=email,
                password_hash=hash_password(password),
                account_type=AccountType.SUPERADMIN,
                locale=Locale.LT,
                email_verified_at=utcnow(),
            )
            users.add(user)
            await session.flush()
            AuditService(session).record(
                actor=Actor(ActorKind.SYSTEM),
                action=AuditAction.SUPERADMIN_CREATED,
                meta=None,
                target_type=AuditTarget.USER,
                target_public_id=user.public_id,
            )
            await session.commit()
    finally:
        await engine.dispose()

    print("Superadmin created.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-superadmin")
    create.add_argument("--email", required=True)
    commands.add_parser("generate-key", help="print a new ENCRYPTION_KEY")
    args = parser.parse_args()

    if args.command == "generate-key":
        print(Fernet.generate_key().decode())
    elif args.command == "create-superadmin":
        asyncio.run(create_superadmin(args.email.strip().lower()))


if __name__ == "__main__":
    main()
