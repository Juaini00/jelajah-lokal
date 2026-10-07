from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import require_csrf
from app.models import Principal
from app.schemas import ApplyInput, ApplyResponse, ArticleDraft, Data, GenerateInput, GenerateResponse, UsageResponse
from app.services import content, editorial
from app.services.gemini import GeminiClient, get_gemini_client

router = APIRouter(prefix='/api/admin/editorial', dependencies=[Depends(require_csrf)])


@router.get('/articles', response_model=Data[list[ArticleDraft]])
async def editorial_articles(db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return Data(data=await content.list_drafts(db, principal, limit=50))


@router.get('/usage', response_model=UsageResponse)
async def editorial_usage(db: AsyncSession = Depends(get_db), settings: Settings = Depends(get_settings), principal: Principal = Depends(require_csrf)):
    return await editorial.usage(db, settings)


@router.post('/generate', response_model=GenerateResponse)
async def editorial_generate(
    payload: GenerateInput,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    client: GeminiClient = Depends(get_gemini_client),
    principal: Principal = Depends(require_csrf),
):
    return await editorial.generate(db, settings, client, principal, payload)


@router.post('/apply', response_model=ApplyResponse)
async def editorial_apply(payload: ApplyInput, db: AsyncSession = Depends(get_db), principal: Principal = Depends(require_csrf)):
    return await editorial.apply(db, principal, payload)
