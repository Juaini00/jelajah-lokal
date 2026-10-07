import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.db import database_connection
from app.models import Base

config = context.config
target_metadata = Base.metadata


def get_url() -> tuple[str, dict]:
    settings = get_settings()
    return database_connection(settings.database_url.get_secret_value())


def run_migrations_offline() -> None:
    url, _ = get_url()
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={'paramstyle': 'named'})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    url, connect_args = get_url()
    connectable = create_async_engine(url, connect_args=connect_args)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
