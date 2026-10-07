
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import require_content_token
from app.schemas import Data, PublicArticleDetail, PublicArticleList, PublicCategoryList, PublicSitemapList
from app.services import content

router = APIRouter(prefix='/api/public', dependencies=[Depends(require_content_token)])


@router.get('/articles', response_model=PublicArticleList)
async def list_articles(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1, le=1000),
    pageSize: int = Query(9, ge=1, le=12),
    category: str | None = Query(None, max_length=120),
    featured: bool | None = Query(None),
):
    return await content.public_list_articles(db, page=page, page_size=pageSize, category_slug=category, featured=featured)


@router.get('/articles/{slug}', response_model=Data[PublicArticleDetail])
async def article_detail(slug: str, db: AsyncSession = Depends(get_db)):
    detail = await content.public_article_detail(db, slug)
    return Data(data=detail)


@router.get('/categories', response_model=PublicCategoryList)
async def categories(db: AsyncSession = Depends(get_db)):
    return await content.public_categories(db)


@router.get('/sitemap-entries', response_model=PublicSitemapList)
async def sitemap(db: AsyncSession = Depends(get_db)):
    return await content.public_sitemap(db)
