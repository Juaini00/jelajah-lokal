from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import require_csrf
from app.errors import AppError
from app.models import Principal
from app.schemas import (
    ArticleCreate,
    ArticleDraft,
    ArticlePatch,
    Author,
    AuthorInput,
    Category,
    CategoryInput,
    Data,
    Deleted,
    Media,
    RevisionInput,
)
from app.services import content, media

router = APIRouter(prefix='/api/admin', dependencies=[Depends(require_csrf)])


# Articles


@router.get('/articles', response_model=Data[list[ArticleDraft]])
async def list_articles(db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.list_drafts(db, principal))


@router.post('/articles', response_model=Data[ArticleDraft], status_code=201)
async def create_article(payload: ArticleCreate, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.create_draft(db, principal, payload))


@router.get('/articles/{article_id}', response_model=Data[ArticleDraft])
async def get_article(article_id: UUID, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    article = await content.load_owned_article(db, principal, article_id)
    snapshot = await content.get_snapshot(db, article)
    return Data(data=content.draft_dto(article, snapshot))


@router.patch('/articles/{article_id}', response_model=Data[ArticleDraft])
async def update_article(article_id: UUID, payload: ArticlePatch, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.update_draft(db, principal, article_id, payload))


@router.delete('/articles/{article_id}', response_model=Data[Deleted])
async def delete_article(article_id: UUID, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    await content.delete_draft(db, principal, article_id)
    return Data(data=Deleted(deleted=True))


@router.post('/articles/{article_id}/publish', response_model=Data[ArticleDraft])
async def publish_article(article_id: UUID, payload: RevisionInput, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.publish(db, principal, article_id, payload.revision))


@router.post('/articles/{article_id}/unpublish', response_model=Data[ArticleDraft])
async def unpublish_article(article_id: UUID, payload: RevisionInput, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.unpublish(db, principal, article_id, payload.revision))


# Categories


@router.get('/categories', response_model=Data[list[Category]])
async def list_categories(db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.list_categories(db))


@router.post('/categories', response_model=Data[Category], status_code=201)
async def create_category(payload: CategoryInput, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.create_category(db, payload))


@router.get('/categories/{category_id}', response_model=Data[Category])
async def get_category(category_id: UUID, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=content.category_dto(await content.get_category(db, category_id)))


@router.patch('/categories/{category_id}', response_model=Data[Category])
async def update_category(category_id: UUID, payload: CategoryInput, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.update_category(db, category_id, payload))


@router.delete('/categories/{category_id}', response_model=Data[Deleted])
async def delete_category(category_id: UUID, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    await content.delete_category(db, category_id)
    return Data(data=Deleted(deleted=True))


# Authors


@router.get('/authors', response_model=Data[list[Author]])
async def list_authors(db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.list_authors(db))


@router.post('/authors', response_model=Data[Author], status_code=201)
async def create_author(payload: AuthorInput, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.create_author(db, payload))


@router.get('/authors/{author_id}', response_model=Data[Author])
async def get_author(author_id: UUID, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=content.author_dto(await content.get_author(db, author_id)))


@router.patch('/authors/{author_id}', response_model=Data[Author])
async def update_author(author_id: UUID, payload: AuthorInput, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.update_author(db, author_id, payload))


@router.delete('/authors/{author_id}', response_model=Data[Deleted])
async def delete_author(author_id: UUID, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    await content.delete_author(db, author_id)
    return Data(data=Deleted(deleted=True))


# Media

ALLOWED_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


@router.get('/media', response_model=Data[list[Media]])
async def list_media(db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    rows = await media.list_media(db)
    return Data(data=[content.media_dto(r) for r in rows])


@router.post('/media', response_model=Data[Media], status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    credit: str = Form(''),
    sourceUrl: str = Form(''),
    license: str = Form(''),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    principal: Principal = Depends(require_csrf),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise AppError('MEDIA_INVALID')
    body = await file.read()
    row = await media.upload_media(db, settings, content=body, credit=credit, source_url=sourceUrl, license_=license)
    return Data(data=content.media_dto(row))


@router.delete('/media/{media_id}', response_model=Data[Deleted])
async def delete_media(media_id: UUID, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    await media.delete_media(db, media_id)
    return Data(data=Deleted(deleted=True))
