import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Principal(Base):
    __tablename__ = 'principals'
    __table_args__ = (CheckConstraint("role IN ('admin','editor','service')"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    role: Mapped[str] = mapped_column(String(10))
    password_hash: Mapped[str | None] = mapped_column(String(512))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AdminSession(Base):
    __tablename__ = 'admin_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    principal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('principals.id', ondelete='CASCADE'), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CategoryRecord(Base):
    __tablename__ = 'categories'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    data: Mapped[dict] = mapped_column(JSONB)


class MediaRecord(Base):
    __tablename__ = 'media'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    public_id: Mapped[str] = mapped_column(String(255), unique=True)
    asset_id: Mapped[str] = mapped_column(String(255), unique=True)
    data: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuthorRecord(Base):
    __tablename__ = 'authors'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    avatar_media_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('media.id', ondelete='RESTRICT'))
    data: Mapped[dict] = mapped_column(JSONB)


class Article(Base):
    __tablename__ = 'articles'
    __table_args__ = (CheckConstraint('revision >= 1'),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('principals.id', ondelete='RESTRICT'), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    slug: Mapped[str | None] = mapped_column(String(120), unique=True)
    draft: Mapped[dict] = mapped_column(JSONB)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('categories.id', ondelete='RESTRICT'))
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('authors.id', ondelete='RESTRICT'))
    cover_media_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('media.id', ondelete='RESTRICT'))
    published_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('published_snapshots.id', use_alter=True, name='article_published_snapshot_fk', ondelete='RESTRICT'), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PublishedSnapshot(Base):
    __tablename__ = 'published_snapshots'
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    article_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('articles.id', ondelete='RESTRICT'), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    slug: Mapped[str] = mapped_column(String(120), index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('categories.id', ondelete='RESTRICT'))
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('authors.id', ondelete='RESTRICT'))
    cover_media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('media.id', ondelete='RESTRICT'))
    data: Mapped[dict] = mapped_column(JSONB)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class MediaReference(Base):
    __tablename__ = 'media_references'
    __table_args__ = (CheckConstraint('(article_id IS NULL) <> (snapshot_id IS NULL)'),)
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('media.id', ondelete='RESTRICT'), index=True)
    article_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('articles.id', ondelete='CASCADE'), index=True)
    snapshot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey('published_snapshots.id', ondelete='CASCADE'), index=True)


class EditorialRequest(Base):
    __tablename__ = 'editorial_requests'
    __table_args__ = (UniqueConstraint('principal_id', 'idempotency_key'), CheckConstraint("status IN ('reserved','running','succeeded','failed','expired','applied')"))
    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    principal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('principals.id', ondelete='RESTRICT'))
    article_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('articles.id', ondelete='CASCADE'))
    idempotency_key: Mapped[uuid.UUID] = mapped_column(UUID)
    input_hash: Mapped[str] = mapped_column(String(64))
    revision_fingerprint: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(120))
    prompt_version: Mapped[str] = mapped_column(String(80))
    schema_version: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(12))
    result: Mapped[dict | None] = mapped_column(JSONB)
    provider_usage: Mapped[dict | None] = mapped_column(JSONB)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    error_code: Mapped[str | None] = mapped_column(String(60))
    quota_date: Mapped[date | None] = mapped_column(Date)
    lease_fence: Mapped[int | None] = mapped_column(Integer)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_payload: Mapped[dict | None] = mapped_column(JSONB)
    applied_response: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DailyQuota(Base):
    __tablename__ = 'daily_quotas'
    __table_args__ = (CheckConstraint('used >= 0 AND used <= limit_calls'),)
    provider: Mapped[str] = mapped_column(String(20), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    used: Mapped[int] = mapped_column(Integer, default=0)
    limit_calls: Mapped[int] = mapped_column(Integer)


class GlobalLease(Base):
    __tablename__ = 'global_leases'
    resource: Mapped[str] = mapped_column(String(30), primary_key=True)
    owner_request_id: Mapped[uuid.UUID | None] = mapped_column(UUID)
    fence: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ValidatedCache(Base):
    __tablename__ = 'validated_cache'
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    result: Mapped[dict] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
