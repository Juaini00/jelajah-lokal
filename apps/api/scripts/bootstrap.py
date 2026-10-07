"""Private bootstrap CLI for creating the initial administrator/editor principal.

Usage:
    uv run --directory apps/api python -m scripts.bootstrap --username <u> --role admin|editor [--password <p>]

If --password is omitted you are prompted securely (not echoed). The
generated/typed password is never printed or logged. Intended for local /
operator use only; never embed credentials in seed data or committed files.
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select

from app.db import Session
from app.models import Principal
from app.security import hash_password


async def bootstrap(username: str, role: str, password: str) -> None:
    async with Session() as db:
        async with db.begin():
            existing = (await db.execute(select(Principal).where(Principal.username == username))).scalar_one_or_none()
            if existing is not None:
                print(f'Principal "{username}" already exists; aborting.', file=sys.stderr)
                raise SystemExit(1)
            principal = Principal(username=username, role=role, password_hash=hash_password(password), active=True)
            db.add(principal)
    print(f'Created {role} principal "{username}".')


def main() -> None:
    parser = argparse.ArgumentParser(description='Create an initial admin/editor principal.')
    parser.add_argument('--username', required=True)
    parser.add_argument('--role', required=True, choices=['admin', 'editor'])
    parser.add_argument('--password', default=None, help='Omit to be prompted securely.')
    args = parser.parse_args()
    password = args.password or getpass.getpass('Password: ')
    if len(password) < 12:
        print('Password must be at least 12 characters.', file=sys.stderr)
        raise SystemExit(1)
    asyncio.run(bootstrap(args.username, args.role, password))


if __name__ == '__main__':
    main()
