import hmac
from uuid import UUID

from mcp.server.mcpserver import MCPServer
from sqlalchemy import select
from starlette.applications import Starlette
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import get_settings
from app.db import Session
from app.errors import AppError
from app.models import Principal
from app.schemas import ApplyInput, ApplyValues, GenerateInput
from app.services import content, editorial
from app.services.gemini import get_gemini_client

mcp = MCPServer(name='jelajah-lokal-editorial', title='Jelajah Lokal Editorial', instructions='Read-only draft access plus metadata generation/application for authorized agents.')


async def _service_principal() -> Principal:
    async with Session() as db:
        async with db.begin():
            row = (await db.execute(select(Principal).where(Principal.username == 'mcp-service'))).scalar_one_or_none()
            if row is None:
                row = Principal(username='mcp-service', role='service', password_hash=None, active=True)
                db.add(row)
                await db.flush()
            await db.refresh(row)
        return row


def _error_dict(exc: AppError) -> dict:
    return {'error': {'code': exc.code, 'status': exc.status}}


@mcp.tool(description='List saved article drafts accessible to the editorial service principal.')
async def list_drafts() -> dict:
    principal = await _service_principal()
    async with Session() as db:
        try:
            drafts = await content.list_drafts(db, principal, limit=50)
            await db.commit()
        except AppError as exc:
            await db.rollback()
            return _error_dict(exc)
    return {'drafts': [d.model_dump(mode='json') for d in drafts]}


@mcp.tool(description='Read a single article draft by documentId.')
async def read_draft(articleDocumentId: str) -> dict:
    principal = await _service_principal()
    async with Session() as db:
        try:
            article = await content.load_owned_article(db, principal, UUID(articleDocumentId))
            snapshot = await content.get_snapshot(db, article)
            await db.commit()
        except AppError as exc:
            await db.rollback()
            return _error_dict(exc)
    return {'draft': content.draft_dto(article, snapshot).model_dump(mode='json')}


@mcp.tool(description='Generate editorial metadata (excerpt/metaDescription/suggestedTags) for a draft via Gemini.')
async def generate_metadata(articleDocumentId: str, idempotencyKey: str) -> dict:
    principal = await _service_principal()
    settings = get_settings()
    client = get_gemini_client(settings)
    async with Session() as db:
        try:
            payload = GenerateInput(articleDocumentId=UUID(articleDocumentId), idempotencyKey=UUID(idempotencyKey))
            result = await editorial.generate(db, settings, client, principal, payload)
            await db.commit()
        except AppError as exc:
            await db.rollback()
            return _error_dict(exc)
    return result.model_dump(mode='json')


@mcp.tool(description='Apply selected generated metadata fields to a draft.')
async def apply_metadata(requestId: str, selectedFields: list[str], excerpt: str | None = None, metaDescription: str | None = None, tags: list[str] | None = None) -> dict:
    principal = await _service_principal()
    async with Session() as db:
        try:
            values = ApplyValues(**{k: v for k, v in {'excerpt': excerpt, 'metaDescription': metaDescription, 'tags': tags}.items() if k in selectedFields})
            payload = ApplyInput(requestId=UUID(requestId), selectedFields=selectedFields, values=values)
            result = await editorial.apply(db, principal, payload)
            await db.commit()
        except AppError as exc:
            await db.rollback()
            return _error_dict(exc)
    return result.model_dump(mode='json')


@mcp.tool(description='Read the current Gemini usage/quota/busy state.')
async def read_usage() -> dict:
    settings = get_settings()
    async with Session() as db:
        result = await editorial.usage(db, settings)
        await db.commit()
    return result.model_dump(mode='json')


class ApiKeyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, api_key: str):
        super().__init__(app)
        self._api_key = api_key

    async def dispatch(self, request: Request, call_next):
        provided = request.headers.get('x-mcp-api-key', '')
        if not provided or not hmac.compare_digest(provided, self._api_key):
            return JSONResponse({'error': {'code': 'AUTH_REQUIRED', 'message': 'Invalid MCP API key'}}, status_code=401)
        return await call_next(request)


def build_mcp_app() -> Starlette:
    settings = get_settings()
    app = mcp.streamable_http_app(streamable_http_path='/')
    app.add_middleware(ApiKeyMiddleware, api_key=settings.mcp_api_key.get_secret_value())
    return app
