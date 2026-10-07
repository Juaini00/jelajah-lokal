from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_session_principal, require_csrf
from app.models import Principal
from app.schemas import Data, LoggedOut, LoginInput, SessionDTO
from app.services import auth

router = APIRouter(prefix='/api/admin')


def _set_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        settings.admin_cookie_name,
        token,
        max_age=settings.admin_session_ttl_seconds,
        httponly=True,
        secure=settings.admin_cookie_secure,
        samesite='strict',
        path='/',
    )


@router.post('/login', response_model=Data[SessionDTO])
async def login(payload: LoginInput, request: Request, response: Response, db: AsyncSession = Depends(get_db), settings: Settings = Depends(get_settings)):
    session_dto, token = await auth.login(db, settings, request.headers.get('origin'), payload)
    _set_cookie(response, settings, token)
    return Data(data=session_dto)


@router.get('/session', response_model=Data[SessionDTO])
async def session(request: Request, db: AsyncSession = Depends(get_db), principal: Principal = Depends(get_session_principal)):
    row = request.state.session
    return Data(data=SessionDTO(principal=auth.principal_dto(principal), csrfToken=row.csrf_token))


@router.post('/logout', response_model=Data[LoggedOut])
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db), settings: Settings = Depends(get_settings), principal: Principal = Depends(require_csrf)):
    await auth.logout(db, settings, request.cookies.get(settings.admin_cookie_name))
    response.delete_cookie(settings.admin_cookie_name, path='/')
    return Data(data=LoggedOut(loggedOut=True))
