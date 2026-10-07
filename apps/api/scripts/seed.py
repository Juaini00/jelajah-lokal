"""Seed script: loads seed/content/dataset.json + seed/assets-manifest.json.

Usage:
    uv run --directory apps/api python -m scripts.seed [--owner-username <existing admin username>]

Invokes real content services (draft create + publish validation). Never
resets the database, never overwrites existing rows with matching
documentId (preserves user edits), and never creates a default admin —
an existing admin/editor principal (created via scripts.bootstrap) must
already exist, or be named explicitly with --owner-username.
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.db import Session
from app.models import Article, AuthorRecord, CategoryRecord, MediaRecord, Principal
from app.schemas import ArticleCreate
from app.services.content import collect_media_ids, publish, sync_media_references

ROOT = Path(__file__).resolve().parents[3]
DATASET_PATH = ROOT / 'seed' / 'content' / 'dataset.json'
MANIFEST_PATH = ROOT / 'seed' / 'assets-manifest.json'


async def seed(owner_username: str | None) -> None:
    dataset = json.loads(DATASET_PATH.read_text('utf-8'))
    manifest = json.loads(MANIFEST_PATH.read_text('utf-8'))

    async with Session() as db:
        async with db.begin():
            owner: Principal | None
            if owner_username:
                owner = (await db.execute(select(Principal).where(Principal.username == owner_username))).scalar_one_or_none()
                if owner is None:
                    print(f'No principal named "{owner_username}" exists. Run scripts.bootstrap first.', file=sys.stderr)
                    raise SystemExit(1)
            else:
                owner = (await db.execute(select(Principal).where(Principal.role == 'admin').order_by(Principal.username))).scalars().first()
                if owner is None:
                    print('No admin principal exists. Run scripts.bootstrap first, then re-run the seeder.', file=sys.stderr)
                    raise SystemExit(1)

            for asset in manifest['assets']:
                media_id = UUID(asset['documentId'])
                existing = await db.get(MediaRecord, media_id)
                if existing is not None:
                    continue
                db.add(
                    MediaRecord(
                        id=media_id,
                        public_id=asset['publicId'],
                        asset_id=asset['assetId'],
                        data={
                            'url': asset['secureUrl'],
                            'width': asset['width'],
                            'height': asset['height'],
                            'format': asset['format'],
                            'credit': asset['credit'],
                            'sourceUrl': asset['sourceUrl'],
                            'license': asset['license'],
                        },
                        created_at=datetime.fromisoformat(asset['createdAt'].replace('Z', '+00:00')),
                    )
                )

            for category in dataset['categories']:
                cat_id = UUID(category['documentId'])
                if await db.get(CategoryRecord, cat_id) is not None:
                    continue
                db.add(CategoryRecord(id=cat_id, slug=category['slug'], data={'name': category['name'], 'description': category['description'], 'order': category['order']}))

            for author in dataset['authors']:
                author_id = UUID(author['documentId'])
                if await db.get(AuthorRecord, author_id) is not None:
                    continue
                avatar = UUID(author['avatarMediaDocumentId']) if author.get('avatarMediaDocumentId') else None
                db.add(AuthorRecord(id=author_id, slug=author['slug'], avatar_media_id=avatar, data={'name': author['name'], 'bio': author['bio']}))

            await db.flush()

            to_publish: list[UUID] = []
            for item in dataset['articles']:
                article_id = UUID(item['documentId'])
                if await db.get(Article, article_id) is not None:
                    continue
                fields = {k: v for k, v in item.items() if k not in ('documentId', 'publication')}
                payload = ArticleCreate.model_validate(fields)
                draft_data = payload.model_dump(mode='json')
                article = Article(
                    id=article_id,
                    owner_id=owner.id,
                    revision=1,
                    slug=draft_data['slug'] or None,
                    draft=draft_data,
                    category_id=payload.categoryDocumentId,
                    author_id=payload.authorDocumentId,
                    cover_media_id=payload.coverMediaDocumentId,
                )
                db.add(article)
                await db.flush()
                media_ids = collect_media_ids(payload.coverMediaDocumentId, draft_data['body'])
                if media_ids:
                    await sync_media_references(db, article_id=article.id, snapshot_id=None, media_ids=media_ids)
                if item['publication'] == 'published':
                    to_publish.append(article_id)

            await db.flush()
            for article_id in to_publish:
                article = await db.get(Article, article_id)
                await publish(db, owner, article_id, article.revision)

    print('Seed complete.')


def main() -> None:
    parser = argparse.ArgumentParser(description='Seed Jelajah Lokal content from seed/content/dataset.json')
    parser.add_argument('--owner-username', default=None, help='Existing admin/editor username to own seeded drafts (defaults to first admin).')
    args = parser.parse_args()
    asyncio.run(seed(args.owner_username))


if __name__ == '__main__':
    main()
