from contextlib import asynccontextmanager
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import get_settings


def database_connection(url: str):
    url = url.replace('postgres://', 'postgresql+asyncpg://', 1).replace('postgresql://', 'postgresql+asyncpg://', 1)
    parsed = urlsplit(url)
    query = dict(parse_qsl(parsed.query))
    connect_args = {}
    sslmode = query.pop('sslmode', None)
    query.pop('channel_binding', None)
    if sslmode:
        if sslmode not in ('require', 'verify-ca', 'verify-full', 'disable'):
            raise ValueError('Unsupported PostgreSQL TLS mode')
        # asyncpg require encrypts; verify modes verify server certificates.
        connect_args['ssl'] = sslmode
    return urlunsplit(parsed._replace(query=urlencode(query))), connect_args


settings = get_settings()
url, connect_args = database_connection(settings.database_url.get_secret_value())
engine = create_async_engine(url, connect_args=connect_args, pool_pre_ping=True, pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow, echo=False, hide_parameters=True)
Session = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with Session() as session:
        try:
            yield session
            await session.commit()
        except BaseException:
            await session.rollback()
            raise


@asynccontextmanager
async def transaction():
    async with Session() as session:
        async with session.begin():
            yield session
