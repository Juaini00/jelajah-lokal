import os

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import Settings, get_settings

# Must run before any other test module imports app.db (which binds its
# module-level async engine to DATABASE_URL at import time): point the whole
# process at TEST_DATABASE_URL here, at conftest import time, which pytest
# always imports before collecting sibling test modules in this directory.
_bootstrap = Settings()
if not _bootstrap.test_database_url.get_secret_value():
    collect_ignore_glob = ['*']
else:
    os.environ['DATABASE_URL'] = _bootstrap.test_database_url.get_secret_value()
    get_settings.cache_clear()


@pytest.fixture(scope='session', autouse=True)
def settings():
    if not _bootstrap.test_database_url.get_secret_value():
        pytest.skip('TEST_DATABASE_URL is not configured; set it in the root .env to run backend tests.')
    return get_settings()


@pytest_asyncio.fixture
async def engine(settings):
    from app.db import database_connection
    from app.models import Base

    url, connect_args = database_connection(settings.database_url.get_secret_value())
    eng = create_async_engine(url, connect_args=connect_args, poolclass=NullPool)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db(engine):
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        yield session
        await session.rollback()


@pytest.fixture
def admin_principal_factory():
    from app.models import Principal
    from app.security import hash_password

    def make(username='admin-test', role='admin', password='correct horse battery staple'):
        return Principal(username=username, role=role, password_hash=hash_password(password), active=True)

    return make
