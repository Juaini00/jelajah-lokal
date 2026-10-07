"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-10-07

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'principals',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('username', sa.String(80), nullable=False, unique=True),
        sa.Column('role', sa.String(10), nullable=False),
        sa.Column('password_hash', sa.String(512)),
        sa.Column('active', sa.Boolean, nullable=False, server_default=sa.true()),
        sa.CheckConstraint("role IN ('admin','editor','service')", name='ck_principals_role'),
    )

    op.create_table(
        'categories',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('slug', sa.String(120), nullable=False, unique=True),
        sa.Column('data', postgresql.JSONB, nullable=False),
    )

    op.create_table(
        'media',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('public_id', sa.String(255), nullable=False, unique=True),
        sa.Column('asset_id', sa.String(255), nullable=False, unique=True),
        sa.Column('data', postgresql.JSONB, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'authors',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('slug', sa.String(120), nullable=False, unique=True),
        sa.Column('avatar_media_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('media.id', ondelete='RESTRICT')),
        sa.Column('data', postgresql.JSONB, nullable=False),
    )

    op.create_table(
        'admin_sessions',
        sa.Column('token_hash', sa.String(64), primary_key=True),
        sa.Column('principal_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('principals.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('csrf_token', sa.String(64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'articles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('owner_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('principals.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('revision', sa.Integer, nullable=False),
        sa.Column('slug', sa.String(120), unique=True),
        sa.Column('draft', postgresql.JSONB, nullable=False),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('categories.id', ondelete='RESTRICT')),
        sa.Column('author_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('authors.id', ondelete='RESTRICT')),
        sa.Column('cover_media_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('media.id', ondelete='RESTRICT')),
        sa.Column('published_snapshot_id', postgresql.UUID(as_uuid=True), unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('revision >= 1', name='ck_articles_revision'),
    )

    op.create_table(
        'published_snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('article_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('articles.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('revision', sa.Integer, nullable=False),
        sa.Column('slug', sa.String(120), nullable=False, index=True),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('categories.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('author_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('authors.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('cover_media_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('media.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('data', postgresql.JSONB, nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=False, index=True),
    )

    op.create_foreign_key(
        'article_published_snapshot_fk',
        'articles',
        'published_snapshots',
        ['published_snapshot_id'],
        ['id'],
        ondelete='RESTRICT',
    )

    op.create_table(
        'media_references',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('media_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('media.id', ondelete='RESTRICT'), nullable=False, index=True),
        sa.Column('article_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('articles.id', ondelete='CASCADE'), index=True),
        sa.Column('snapshot_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('published_snapshots.id', ondelete='CASCADE'), index=True),
        sa.CheckConstraint('(article_id IS NULL) <> (snapshot_id IS NULL)', name='ck_media_references_owner'),
    )

    op.create_table(
        'editorial_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('principal_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('principals.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('article_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('articles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('idempotency_key', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('input_hash', sa.String(64), nullable=False),
        sa.Column('revision_fingerprint', sa.String(64), nullable=False),
        sa.Column('model', sa.String(120), nullable=False),
        sa.Column('prompt_version', sa.String(80), nullable=False),
        sa.Column('schema_version', sa.String(20), nullable=False),
        sa.Column('status', sa.String(12), nullable=False),
        sa.Column('result', postgresql.JSONB),
        sa.Column('provider_usage', postgresql.JSONB),
        sa.Column('cache_hit', sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column('error_code', sa.String(60)),
        sa.Column('quota_date', sa.Date),
        sa.Column('lease_fence', sa.Integer),
        sa.Column('expires_at', sa.DateTime(timezone=True)),
        sa.Column('applied_payload', postgresql.JSONB),
        sa.Column('applied_response', postgresql.JSONB),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True)),
        sa.Column('applied_at', sa.DateTime(timezone=True)),
        sa.UniqueConstraint('principal_id', 'idempotency_key', name='uq_editorial_requests_principal_key'),
        sa.CheckConstraint("status IN ('reserved','running','succeeded','failed','expired','applied')", name='ck_editorial_requests_status'),
    )

    op.create_table(
        'daily_quotas',
        sa.Column('provider', sa.String(20), primary_key=True),
        sa.Column('day', sa.Date, primary_key=True),
        sa.Column('used', sa.Integer, nullable=False, server_default='0'),
        sa.Column('limit_calls', sa.Integer, nullable=False),
        sa.CheckConstraint('used >= 0 AND used <= limit_calls', name='ck_daily_quotas_used'),
    )

    op.create_table(
        'global_leases',
        sa.Column('resource', sa.String(30), primary_key=True),
        sa.Column('owner_request_id', postgresql.UUID(as_uuid=True)),
        sa.Column('fence', sa.Integer, nullable=False, server_default='0'),
        sa.Column('expires_at', sa.DateTime(timezone=True)),
    )

    op.create_table(
        'validated_cache',
        sa.Column('key', sa.String(64), primary_key=True),
        sa.Column('result', postgresql.JSONB, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table('validated_cache')
    op.drop_table('global_leases')
    op.drop_table('daily_quotas')
    op.drop_table('editorial_requests')
    op.drop_table('media_references')
    op.drop_constraint('article_published_snapshot_fk', 'articles', type_='foreignkey')
    op.drop_table('published_snapshots')
    op.drop_table('articles')
    op.drop_table('admin_sessions')
    op.drop_table('authors')
    op.drop_table('media')
    op.drop_table('categories')
    op.drop_table('principals')
