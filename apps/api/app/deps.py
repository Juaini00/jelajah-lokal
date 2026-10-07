from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError
from app.models import AdminSession, Principal
from app.security import constant_time_eq, token_digest


async def request_id(request: Request) -> str:
    rid = getattr(request.state, 'request_id', None)
    if not rid:
        rid = str(uuid4())
        request.state.request_id = rid
    return rid


async def require_content_token(request: Request, settings: Settings = Depends(get_settings)) -> bool:
    header = request.headers.get('authorization', '')
    scheme, _, token = header.partition(' ')
    if scheme.lower() != 'bearer' or not token or not constant_time_eq(token, settings.api_content_token.get_secret_value()):
        raise AppError('AUTH_REQUIRED')
    return True


async def get_session_principal(request: Request, db: AsyncSession = Depends(get_db), settings: Settings = Depends(get_settings)) -> Principal:
    raw = request.cookies.get(settings.admin_cookie_name)
    if not raw:
        raise AppError('AUTH_REQUIRED')
    digest = token_digest(raw)
    row = (await db.execute(select(AdminSession).where(AdminSession.token_hash == digest))).scalar_one_or_none()
    if row is None or row.expires_at <= datetime.now(timezone.utc):
        raise AppError('AUTH_REQUIRED')
    principal = (await db.execute(select(Principal).where(Principal.id == row.principal_id, Principal.active.is_(True)))).scalar_one_or_none()
    if principal is None:
        raise AppError('AUTH_REQUIRED')
    request.state.session = row
    request.state.principal = principal
    return principal


async def require_csrf(request: Request, settings: Settings = Depends(get_settings), principal: Principal = Depends(get_session_principal)) -> Principal:
    origin = request.headers.get('origin')
    allowed_origins = tuple(settings.admin_allowed_origins)
    if origin is not None:
        if origin not in allowed_origins:
            raise AppError('FORBIDDEN')
    else:
        # Same-origin GET/HEAD fetches in standard browsers omit Origin by
        # design; fall back to Referer prefix. Reject when neither is present.
        referer = request.headers.get('referer', '')
        if not referer or not referer.startswith(allowed_origins):
            raise AppError('FORBIDDEN')
    csrf_header = request.headers.get('x-csrf-token', '')
    session: AdminSession = request.state.session
    if not csrf_header or not constant_time_eq(csrf_header, session.csrf_token):
        raise AppError('FORBIDDEN')
    return principal


async def require_admin(principal: Principal = Depends(get_session_principal)) -> Principal:
    if principal.role != 'admin':
        raise AppError('FORBIDDEN')
    return principal
