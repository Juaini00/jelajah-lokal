import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException

MESSAGES = {
    'AUTH_REQUIRED': 'Silakan masuk untuk melanjutkan.',
    'FORBIDDEN': 'Anda tidak memiliki izin untuk tindakan ini.',
    'INVALID_REQUEST': 'Periksa isian dan parameter permintaan.',
    'ARTICLE_NOT_FOUND': 'Artikel tidak ditemukan.',
    'CATEGORY_NOT_FOUND': 'Kategori tidak ditemukan.',
    'NOT_FOUND': 'Data tidak ditemukan.',
    'ARTICLE_CHANGED': 'Artikel berubah. Muat ulang dan periksa kembali.',
    'IDEMPOTENCY_CONFLICT': 'Permintaan ini sudah digunakan untuk tindakan berbeda.',
    'AI_BUSY': 'Proses bantuan lain masih berjalan. Tunggu sebentar.',
    'INPUT_TOO_LONG': 'Artikel terlalu panjang untuk bantuan AI. Metadata dapat diisi manual.',
    'INPUT_TOO_SHORT': 'Simpan sedikitnya 100 kata bermakna untuk bantuan AI.',
    'INVALID_AI_OUTPUT': 'Usulan tidak valid dan tidak diterapkan. Periksa metadata secara manual.',
    'DAILY_QUOTA_EXCEEDED': 'Batas proses harian tercapai. Tunggu reset UTC atau isi manual.',
    'PROVIDER_RATE_LIMITED': 'Batas penyedia tercapai. Coba lagi nanti secara manual.',
    'AI_NOT_CONFIGURED': 'Bantuan AI belum tersedia. Anda tetap dapat menyunting dan menerbitkan manual.',
    'QUOTA_STORE_UNAVAILABLE': 'Penyimpanan batas AI belum tersedia. Tidak ada proses baru dijalankan.',
    'AI_PROVIDER_ERROR': 'Penyedia AI belum dapat memproses permintaan.',
    'AI_TIMEOUT': 'Proses AI melewati batas waktu. Draft tetap utuh.',
    'AI_REQUEST_EXPIRED': 'Hasil proses tidak diketahui. Buat permintaan baru dengan sengaja.',
    'PUBLISH_VALIDATION_FAILED': 'Lengkapi judul, isi, metadata, kategori, penulis, gambar dan sumber sebelum menerbitkan.',
    'RELATION_REFERENCED': 'Data masih digunakan oleh draft atau versi terbit dan tidak dapat dihapus.',
    'SLUG_CONFLICT': 'Slug sudah digunakan.',
    'PUBLISHED_SLUG_IMMUTABLE': 'Slug artikel yang pernah terbit tidak dapat diubah.',
    'ARTICLE_PUBLISHED': 'Tarik artikel dari publik sebelum menghapusnya.',
    'MEDIA_INVALID': 'Unggah berkas JPEG, PNG, atau WebP valid, maksimal 5 MB.',
    'MEDIA_PROVIDER_ERROR': 'Penyimpanan gambar belum dapat memproses permintaan.',
    'SERVICE_UNAVAILABLE': 'Layanan belum tersedia. Coba lagi nanti.',
}
STATUSES = {'AUTH_REQUIRED': 401, 'FORBIDDEN': 403, 'ARTICLE_NOT_FOUND': 404, 'CATEGORY_NOT_FOUND': 404, 'NOT_FOUND': 404, 'SLUG_CONFLICT': 409, 'PUBLISHED_SLUG_IMMUTABLE': 409, 'RELATION_REFERENCED': 409, 'ARTICLE_PUBLISHED': 409, 'MEDIA_INVALID': 422, 'MEDIA_PROVIDER_ERROR': 502, 'PUBLISH_VALIDATION_FAILED': 422, 'AI_BUSY':409, 'ARTICLE_CHANGED':409, 'IDEMPOTENCY_CONFLICT':409, 'AI_REQUEST_EXPIRED':409, 'DAILY_QUOTA_EXCEEDED':429, 'PROVIDER_RATE_LIMITED':429, 'INPUT_TOO_LONG':422, 'INPUT_TOO_SHORT':422, 'INVALID_AI_OUTPUT':422, 'AI_NOT_CONFIGURED':503, 'QUOTA_STORE_UNAVAILABLE':503, 'AI_PROVIDER_ERROR':502, 'AI_TIMEOUT':504}


class AppError(Exception):
    def __init__(self, code: str, status: int | None = None, retryable: bool = False):
        self.code = code
        self.status = status or STATUSES.get(code, 400)
        self.retryable = retryable
        super().__init__(code)


def envelope(code: str, request_id: str, retryable: bool = False):
    return {'error': {'code': code, 'message': MESSAGES.get(code, MESSAGES['INVALID_REQUEST']), 'requestId': request_id, 'retryable': retryable}}


def audit(component: str, event: str, **fields):
    logging.getLogger('jelajah').info(json.dumps({'timestamp': datetime.now(timezone.utc).isoformat(), 'level': 'info', 'component': component, 'event': event, **fields}, ensure_ascii=False))


def register_errors(app):
    @app.exception_handler(AppError)
    async def application_error(request: Request, exc: AppError):
        return JSONResponse(envelope(exc.code, request.state.request_id, exc.retryable), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(envelope('INVALID_REQUEST', request.state.request_id), status_code=400 if request.url.path.startswith('/api/public') else 422)

    @app.exception_handler(IntegrityError)
    async def integrity_error(request: Request, exc: IntegrityError):
        sqlstate = getattr(getattr(exc, 'orig', None), 'sqlstate', None)
        if sqlstate == '23503':
            code = 'RELATION_REFERENCED' if request.method == 'DELETE' else 'INVALID_REQUEST'
            return JSONResponse(envelope(code, request.state.request_id), status_code=409 if code == 'RELATION_REFERENCED' else 422)
        return JSONResponse(envelope('SLUG_CONFLICT', request.state.request_id), status_code=409)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError):
        code = 'QUOTA_STORE_UNAVAILABLE' if '/editorial/' in request.url.path else 'SERVICE_UNAVAILABLE'
        return JSONResponse(envelope(code, request.state.request_id, True), status_code=503)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = 'NOT_FOUND' if exc.status_code == 404 else 'INVALID_REQUEST'
        return JSONResponse(envelope(code, getattr(request.state, 'request_id', str(uuid4()))), status_code=exc.status_code)
