import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import Integer, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import AppError
from app.models import Article, AuthorRecord, CategoryRecord, MediaRecord, MediaReference, Principal, PublishedSnapshot
from app.schemas import (
    ArticleCreate,
    ArticleDraft,
    ArticlePatch,
    Author,
    AuthorInput,
    Category,
    CategoryInput,
    Cover,
    ImageBlock,
    Media,
    PageMeta,
    PublicArticleCard,
    PublicArticleDetail,
    PublicArticleList,
    PublicCategory,
    PublicCategoryList,
    PublicName,
    PublicSitemapList,
    SitemapEntry,
    body_text,
    meaningful_words,
)

TITLE_MIN, TITLE_MAX = 10, 120
EXCERPT_MIN = 50
META_MIN = 70
BODY_MIN_WORDS = 150


def now() -> datetime:
    return datetime.now(timezone.utc)


def media_dto(row: MediaRecord) -> Media:
    data = row.data
    return Media(documentId=row.id, publicId=row.public_id, assetId=row.asset_id, createdAt=row.created_at, **data)


def category_dto(row: CategoryRecord) -> Category:
    return Category(documentId=row.id, slug=row.slug, **row.data)


def author_dto(row: AuthorRecord) -> Author:
    return Author(documentId=row.id, slug=row.slug, avatarMediaDocumentId=row.avatar_media_id, **row.data)


def draft_dto(article: Article, snapshot: PublishedSnapshot | None) -> ArticleDraft:
    data = dict(article.draft)
    data.update(
        documentId=article.id,
        revision=article.revision,
        createdAt=article.created_at,
        updatedAt=article.updated_at,
        publishedAt=snapshot.published_at if snapshot else None,
        publishedRevision=snapshot.revision if snapshot else None,
    )
    return ArticleDraft.model_validate(data)


def collect_media_ids(cover_media_id: UUID | None, body: list[dict]) -> set[UUID]:
    ids: set[UUID] = set()
    if cover_media_id:
        ids.add(cover_media_id)
    for block in body:
        if block.get('type') == 'image':
            ids.add(UUID(str(block['mediaDocumentId'])))
    return ids

async def sync_media_references(db: AsyncSession, *, article_id: UUID | None, snapshot_id: UUID | None, media_ids: set[UUID]) -> None:
    column = MediaReference.article_id if article_id else MediaReference.snapshot_id
    owner = article_id or snapshot_id
    rows = (await db.execute(select(MediaReference).where(column == owner))).scalars().all()
    existing = {r.media_id for r in rows}
    to_remove = existing - media_ids
    for row in rows:
        if row.media_id in to_remove:
            await db.delete(row)
    for media_id in media_ids - existing:
        db.add(MediaReference(media_id=media_id, article_id=article_id, snapshot_id=snapshot_id))


async def load_owned_article(db: AsyncSession, principal: Principal, article_id: UUID) -> Article:
    article = (await db.execute(select(Article).where(Article.id == article_id))).scalar_one_or_none()
    if article is None:
        raise AppError('ARTICLE_NOT_FOUND')
    if principal.role == 'editor' and article.owner_id != principal.id:
        raise AppError('FORBIDDEN')
    return article


async def get_snapshot(db: AsyncSession, article: Article) -> PublishedSnapshot | None:
    if not article.published_snapshot_id:
        return None
    return (await db.execute(select(PublishedSnapshot).where(PublishedSnapshot.id == article.published_snapshot_id))).scalar_one_or_none()


async def list_drafts(db: AsyncSession, principal: Principal, *, limit: int | None = None) -> list[ArticleDraft]:
    stmt = select(Article).order_by(Article.updated_at.desc())
    if principal.role == 'editor':
        stmt = stmt.where(Article.owner_id == principal.id)
    if limit:
        stmt = stmt.limit(limit)
    articles = (await db.execute(stmt)).scalars().all()
    out = []
    for a in articles:
        snapshot = await get_snapshot(db, a)
        out.append(draft_dto(a, snapshot))
    return out


async def create_draft(db: AsyncSession, principal: Principal, payload: ArticleCreate) -> ArticleDraft:
    draft_data = payload.model_dump(mode='json')
    article = Article(
        owner_id=principal.id,
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
    return draft_dto(article, None)


async def update_draft(db: AsyncSession, principal: Principal, article_id: UUID, payload: ArticlePatch) -> ArticleDraft:
    article = await load_owned_article(db, principal, article_id)
    if article.revision != payload.revision:
        raise AppError('ARTICLE_CHANGED')
    snapshot = await get_snapshot(db, article)
    if snapshot is not None and payload.slug and payload.slug != snapshot.slug:
        raise AppError('PUBLISHED_SLUG_IMMUTABLE')
    draft_data = payload.model_dump(mode='json', exclude={'revision'})
    article.slug = draft_data['slug'] or None
    article.draft = draft_data
    article.category_id = payload.categoryDocumentId
    article.author_id = payload.authorDocumentId
    article.cover_media_id = payload.coverMediaDocumentId
    article.revision += 1
    article.updated_at = now()
    media_ids = collect_media_ids(payload.coverMediaDocumentId, draft_data['body'])
    await sync_media_references(db, article_id=article.id, snapshot_id=None, media_ids=media_ids)
    await db.flush()
    return draft_dto(article, snapshot)


async def delete_draft(db: AsyncSession, principal: Principal, article_id: UUID) -> None:
    article = await load_owned_article(db, principal, article_id)
    if article.published_snapshot_id is not None:
        raise AppError('ARTICLE_PUBLISHED')
    await db.delete(article)


def _publish_errors(draft: dict, category_id, author_id, cover_media_id) -> bool:
    title = draft.get('title') or ''
    slug = draft.get('slug') or ''
    excerpt = draft.get('excerpt') or ''
    meta = draft.get('metaDescription') or ''
    cover_alt = draft.get('coverAlt') or ''
    body = draft.get('body') or []
    words = meaningful_words(body_text(body))
    checks = [
        not (TITLE_MIN <= len(title) <= TITLE_MAX),
        not slug,
        words < BODY_MIN_WORDS,
        not (EXCERPT_MIN <= len(excerpt) <= 240),
        not (META_MIN <= len(meta) <= 160),
        category_id is None,
        author_id is None,
        cover_media_id is None,
        not cover_alt,
        bool(draft.get('operationalClaims')) and not draft.get('informationCheckedAt'),
    ]
    return any(checks)


async def publish(db: AsyncSession, principal: Principal, article_id: UUID, revision: int) -> ArticleDraft:
    article = await load_owned_article(db, principal, article_id)
    if article.revision != revision:
        raise AppError('ARTICLE_CHANGED')
    if _publish_errors(article.draft, article.category_id, article.author_id, article.cover_media_id):
        raise AppError('PUBLISH_VALIDATION_FAILED')
    data = dict(article.draft)
    moment = now()
    data['updatedAt'] = moment.isoformat()
    old_snapshot_id = article.published_snapshot_id
    snapshot = PublishedSnapshot(
        article_id=article.id,
        revision=article.revision,
        slug=article.slug,
        category_id=article.category_id,
        author_id=article.author_id,
        cover_media_id=article.cover_media_id,
        data=data,
        published_at=moment,
    )
    db.add(snapshot)
    await db.flush()
    article.published_snapshot_id = snapshot.id
    article.updated_at = moment
    media_ids = collect_media_ids(article.cover_media_id, data['body'])
    await sync_media_references(db, article_id=None, snapshot_id=snapshot.id, media_ids=media_ids)
    await db.flush()
    if old_snapshot_id:
        old = (await db.execute(select(PublishedSnapshot).where(PublishedSnapshot.id == old_snapshot_id))).scalar_one_or_none()
        if old is not None:
            await db.delete(old)
    return draft_dto(article, snapshot)


async def unpublish(db: AsyncSession, principal: Principal, article_id: UUID, revision: int) -> ArticleDraft:
    article = await load_owned_article(db, principal, article_id)
    if article.revision != revision:
        raise AppError('ARTICLE_CHANGED')
    article.published_snapshot_id = None
    article.updated_at = now()
    return draft_dto(article, None)


# Categories


async def list_categories(db: AsyncSession) -> list[Category]:
    rows = (await db.execute(select(CategoryRecord).order_by(CategoryRecord.data['order'].astext.cast(Integer)))).scalars().all()
    return [category_dto(r) for r in rows]


async def create_category(db: AsyncSession, payload: CategoryInput) -> Category:
    row = CategoryRecord(slug=payload.slug, data={'name': payload.name, 'description': payload.description, 'order': payload.order})
    db.add(row)
    await db.flush()
    return category_dto(row)


async def get_category(db: AsyncSession, category_id: UUID) -> CategoryRecord:
    row = (await db.execute(select(CategoryRecord).where(CategoryRecord.id == category_id))).scalar_one_or_none()
    if row is None:
        raise AppError('CATEGORY_NOT_FOUND')
    return row


async def update_category(db: AsyncSession, category_id: UUID, payload: CategoryInput) -> Category:
    row = await get_category(db, category_id)
    row.slug = payload.slug
    row.data = {'name': payload.name, 'description': payload.description, 'order': payload.order}
    return category_dto(row)


async def delete_category(db: AsyncSession, category_id: UUID) -> None:
    row = await get_category(db, category_id)
    await db.delete(row)
    await db.flush()


# Authors


async def list_authors(db: AsyncSession) -> list[Author]:
    rows = (await db.execute(select(AuthorRecord))).scalars().all()
    return [author_dto(r) for r in rows]


async def create_author(db: AsyncSession, payload: AuthorInput) -> Author:
    row = AuthorRecord(slug=payload.slug, avatar_media_id=payload.avatarMediaDocumentId, data={'name': payload.name, 'bio': payload.bio})
    db.add(row)
    await db.flush()
    return author_dto(row)


async def get_author(db: AsyncSession, author_id: UUID) -> AuthorRecord:
    row = (await db.execute(select(AuthorRecord).where(AuthorRecord.id == author_id))).scalar_one_or_none()
    if row is None:
        raise AppError('NOT_FOUND')
    return row


async def update_author(db: AsyncSession, author_id: UUID, payload: AuthorInput) -> Author:
    row = await get_author(db, author_id)
    row.slug = payload.slug
    row.avatar_media_id = payload.avatarMediaDocumentId
    row.data = {'name': payload.name, 'bio': payload.bio}
    return author_dto(row)


async def delete_author(db: AsyncSession, author_id: UUID) -> None:
    row = await get_author(db, author_id)
    await db.delete(row)
    await db.flush()


# Public reads


def _reading_time(body: list[dict]) -> int:
    words = meaningful_words(body_text(body))
    return max(1, math.ceil(words / 200))


async def public_list_articles(db: AsyncSession, *, page: int, page_size: int, category_slug: str | None, featured: bool | None) -> PublicArticleList:
    base = select(Article, PublishedSnapshot).join(PublishedSnapshot, Article.published_snapshot_id == PublishedSnapshot.id)
    if category_slug:
        category = (await db.execute(select(CategoryRecord).where(CategoryRecord.slug == category_slug))).scalar_one_or_none()
        if category is None:
            raise AppError('CATEGORY_NOT_FOUND')
        base = base.where(PublishedSnapshot.category_id == category.id)
    if featured is not None:
        base = base.where(PublishedSnapshot.data['featured'].astext == ('true' if featured else 'false'))
    total = len((await db.execute(base)).all())
    stmt = base.order_by(PublishedSnapshot.published_at.desc(), Article.id.asc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()
    cards = []
    for article, snapshot in rows:
        category = await db.get(CategoryRecord, snapshot.category_id)
        author = await db.get(AuthorRecord, snapshot.author_id)
        media = await db.get(MediaRecord, snapshot.cover_media_id)
        cards.append(_card(article, snapshot, category, author, media))
    page_count = max(1, math.ceil(total / page_size))
    return PublicArticleList(data=cards, meta=PageMeta(page=page, pageSize=page_size, pageCount=page_count, total=total))


def _card(article: Article, snapshot: PublishedSnapshot, category: CategoryRecord, author: AuthorRecord, media: MediaRecord) -> PublicArticleCard:
    data = snapshot.data
    return PublicArticleCard(
        documentId=article.id,
        slug=snapshot.slug,
        title=data['title'],
        excerpt=data['excerpt'],
        category=PublicName(name=category.data['name'], slug=category.slug),
        author=PublicName(name=author.data['name'], slug=author.slug),
        cover=Cover(url=media.data['url'], alt=data['coverAlt'], width=media.data['width'], height=media.data['height']),
        publishedAt=snapshot.published_at,
        readingTimeMinutes=_reading_time(data['body']),
        featured=bool(data['featured']),
    )


async def public_article_detail(db: AsyncSession, slug: str) -> PublicArticleDetail:
    stmt = select(Article, PublishedSnapshot).join(PublishedSnapshot, Article.published_snapshot_id == PublishedSnapshot.id).where(PublishedSnapshot.slug == slug)
    row = (await db.execute(stmt)).first()
    if row is None:
        raise AppError('ARTICLE_NOT_FOUND')
    article, snapshot = row
    category = await db.get(CategoryRecord, snapshot.category_id)
    author = await db.get(AuthorRecord, snapshot.author_id)
    media = await db.get(MediaRecord, snapshot.cover_media_id)
    data = snapshot.data
    media_ids = {UUID(str(b['mediaDocumentId'])) for b in data['body'] if b.get('type') == 'image'}
    media_map: dict[UUID, MediaRecord] = {}
    for mid in media_ids:
        m = await db.get(MediaRecord, mid)
        if m is not None:
            media_map[mid] = m
    body = []
    for block in data['body']:
        if block.get('type') == 'image':
            m = media_map.get(UUID(str(block['mediaDocumentId'])))
            cover = Cover(url=m.data['url'], alt=block['alt'], width=m.data['width'], height=m.data['height']) if m else Cover(url='', alt=block['alt'], width=0, height=0)
            body.append({**block, 'media': cover.model_dump()})
        else:
            body.append(block)
    card = _card(article, snapshot, category, author, media)
    return PublicArticleDetail(
        **card.model_dump(),
        body=body,
        metaDescription=data['metaDescription'],
        tags=data['tags'],
        sourceLinks=data['sourceLinks'],
        informationCheckedAt=data.get('informationCheckedAt'),
        coverCaption=data['coverCaption'],
        imageCredit=data['imageCredit'],
        imageSourceUrl=data['imageSourceUrl'],
        regionLabel=data['regionLabel'],
        updatedAt=data['updatedAt'],
    )


async def public_categories(db: AsyncSession) -> PublicCategoryList:
    stmt = select(CategoryRecord).join(Article, Article.category_id == CategoryRecord.id).where(Article.published_snapshot_id.is_not(None)).distinct()
    rows = (await db.execute(stmt)).scalars().all()
    return PublicCategoryList(data=[PublicCategory(name=r.data['name'], slug=r.slug, description=r.data['description']) for r in rows])


async def public_sitemap(db: AsyncSession) -> PublicSitemapList:
    stmt = select(PublishedSnapshot).join(Article, Article.published_snapshot_id == PublishedSnapshot.id)
    rows = (await db.execute(stmt)).scalars().all()
    return PublicSitemapList(data=[SitemapEntry(slug=r.slug, updatedAt=r.data['updatedAt']) for r in rows])
