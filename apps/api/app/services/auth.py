from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.errors import AppError
from app.models import AdminSession, Principal
from app.schemas import LoginInput, PrincipalDTO, SessionDTO
from app.security import generate_token, token_digest, verify_password


def principal_dto(principal: Principal) -> PrincipalDTO:
    return PrincipalDTO(documentId=principal.id, username=principal.username, role=principal.role)


async def login(db: AsyncSession, settings: Settings, origin: str | None, payload: LoginInput) -> tuple[SessionDTO, str]:
    if origin is None or origin not in settings.admin_allowed_origins:
        raise AppError('FORBIDDEN')
    principal = (await db.execute(select(Principal).where(Principal.username == payload.username, Principal.active.is_(True)))).scalar_one_or_none()
    if principal is None or principal.role not in ('admin', 'editor') or not principal.password_hash or not verify_password(payload.password, principal.password_hash):
        raise AppError('AUTH_REQUIRED')
    token = generate_token()
    csrf_token = generate_token()
    session = AdminSession(
        token_hash=token_digest(token),
        principal_id=principal.id,
        csrf_token=csrf_token,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.admin_session_ttl_seconds),
    )
    db.add(session)
    await db.flush()
    return SessionDTO(principal=principal_dto(principal), csrfToken=csrf_token), token


async def logout(db: AsyncSession, settings: Settings, raw_token: str | None) -> None:
    if not raw_token:
        return
    digest = token_digest(raw_token)
    row = (await db.execute(select(AdminSession).where(AdminSession.token_hash == digest))).scalar_one_or_none()
    if row is not None:
        await db.delete(row)
