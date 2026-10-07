from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from app.config import get_settings
from app.db import engine
from app.errors import register_errors
from app.mcp_server import build_mcp_app, mcp
from app.routers import admin_auth, admin_content, admin_editorial, public

ADMIN_DIST = Path(__file__).resolve().parents[2] / 'admin' / 'dist'


class AdminStatic(StaticFiles):
    """Admin SPA: client routes fall back to index.html; hashed build assets cache forever, the shell never."""

    async def get_response(self, path: str, scope: Scope):
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404 or '.' in path.rsplit('/', 1)[-1]:
                raise
            response = await super().get_response('index.html', scope)
        immutable = path.startswith('assets/') and response.status_code == 200
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable' if immutable else 'no-cache'
        return response


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if settings.mcp_enabled:
            async with mcp.session_manager.run():
                yield
        else:
            yield

    app = FastAPI(title='Jelajah Lokal API', docs_url='/api/docs' if settings.environment != 'production' else None, lifespan=lifespan)

    if settings.cors_allowed_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_allowed_origins, allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

    @app.middleware('http')
    async def request_context(request: Request, call_next):
        request.state.request_id = str(uuid4())
        response = await call_next(request)
        if request.url.path.startswith(('/api', '/healthz', '/readyz', '/mcp')):
            response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Request-Id'] = request.state.request_id
        return response

    register_errors(app)

    app.include_router(public.router)
    app.include_router(admin_auth.router)
    app.include_router(admin_content.router)
    app.include_router(admin_editorial.router)

    if settings.mcp_enabled:
        app.mount('/mcp', build_mcp_app())

    @app.get('/healthz')
    async def healthz():
        return {'status': 'ok'}

    @app.get('/readyz')
    async def readyz():
        try:
            async with engine.connect() as conn:
                await conn.execute(text('SELECT 1'))
        except Exception:
            return JSONResponse({'status': 'error'}, status_code=503)
        return {'status': 'ok'}

    if ADMIN_DIST.is_dir():
        app.mount('/admin', AdminStatic(directory=str(ADMIN_DIST), html=True), name='admin')

    return app


app = create_app()
