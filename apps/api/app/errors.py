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
    'PUBLISH_VALIDATION_FAILED': 'Artikel belum memenuhi syarat terbit. Lengkapi kolom yang ditandai.',
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
    def __init__(self, code: str, status: int | None = None, retryable: bool = False, fields: list[dict] | None = None):
        self.code = code
        self.status = status or STATUSES.get(code, 400)
        self.retryable = retryable
        self.fields = fields
        super().__init__(code)


def envelope(code: str, request_id: str, retryable: bool = False, fields: list[dict] | None = None):
    error = {'code': code, 'message': MESSAGES.get(code, MESSAGES['INVALID_REQUEST']), 'requestId': request_id, 'retryable': retryable}
    if fields:
        error['fields'] = fields
    return {'error': error}


# Model-level validator messages carry no location of their own; map them onto the field they guard.
_MODEL_MESSAGES = {
    'Body text exceeds': ('body', 'Isi artikel melebihi 20.000 karakter.'),
    'Checked date cannot be in the future': ('informationCheckedAt', 'Tanggal pemeriksaan tidak boleh di masa depan.'),
    'Provide exactly the unique selected metadata fields': ('selectedFields', 'Pilih kolom metadata yang unik dan kirim nilainya.'),
}
_VALUE_MESSAGES = {
    'safe HTTP(S) URL': 'Gunakan URL http(s) lengkap tanpa spasi atau kredensial.',
    'HTML and executable content': 'Teks tidak boleh berisi tag HTML atau skrip.',
    'Control characters': 'Teks berisi karakter kontrol yang tidak diizinkan.',
    'Tags must be unique': 'Maksimal 5 tag unik, masing-masing 2–30 karakter.',
    'Slug must contain': 'Gunakan huruf kecil, angka, dan tanda hubung.',
}


def _issue_message(error: dict) -> str:
    kind = error.get('type', '')
    ctx = error.get('ctx') or {}
    if kind == 'missing':
        return 'Wajib diisi.'
    if kind == 'string_too_short':
        return 'Wajib diisi.' if ctx.get('min_length') == 1 else f"Minimal {ctx.get('min_length')} karakter."
    if kind == 'string_too_long':
        return f"Maksimal {ctx.get('max_length')} karakter."
    if kind == 'too_short':
        return f"Minimal {ctx.get('min_length')} item."
    if kind == 'too_long':
        return f"Maksimal {ctx.get('max_length')} item."
    if kind == 'string_pattern_mismatch':
        return 'Gunakan huruf kecil, angka, dan tanda hubung.'
    if kind.startswith('uuid'):
        return 'Pilih data yang valid.'
    if kind.startswith('date'):
        return 'Tanggal tidak valid.'
    if kind in ('greater_than_equal', 'greater_than'):
        return f"Nilai minimal {ctx.get('ge', ctx.get('gt'))}."
    if kind in ('less_than_equal', 'less_than'):
        return f"Nilai maksimal {ctx.get('le', ctx.get('lt'))}."
    if kind.startswith('int'):
        return 'Masukkan bilangan bulat.'
    if kind == 'extra_forbidden':
        return 'Properti tidak dikenal.'
    if kind == 'value_error':
        text = str(error.get('msg', ''))
        return next((message for needle, message in _VALUE_MESSAGES.items() if needle in text), 'Isian tidak valid.')
    return 'Isian tidak valid.'


def validation_fields(errors: list[dict]) -> list[dict]:
    """Translate pydantic errors into `{field, message}` with dotted paths relative to the request body."""
    out: list[dict] = []
    for error in errors:
        loc = [str(part) for part in error.get('loc', ())]
        if loc and loc[0] in ('body', 'query', 'path'):
            loc = loc[1:]
        field = '.'.join(loc)
        message = _issue_message(error)
        if error.get('type') == 'value_error':
            text = str(error.get('msg', ''))
            mapped = next((target for needle, target in _MODEL_MESSAGES.items() if needle in text), None)
            if mapped:
                field = '.'.join([*loc, mapped[0]])
                message = mapped[1]
        if not any(item['field'] == field and item['message'] == message for item in out):
            out.append({'field': field, 'message': message})
    return out


def audit(component: str, event: str, **fields):
    logging.getLogger('jelajah').info(json.dumps({'timestamp': datetime.now(timezone.utc).isoformat(), 'level': 'info', 'component': component, 'event': event, **fields}, ensure_ascii=False))


def register_errors(app):
    @app.exception_handler(AppError)
    async def application_error(request: Request, exc: AppError):
        return JSONResponse(envelope(exc.code, request.state.request_id, exc.retryable, exc.fields), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(envelope('INVALID_REQUEST', request.state.request_id, fields=validation_fields(list(exc.errors()))), status_code=400 if request.url.path.startswith('/api/public') else 422)

    @app.exception_handler(IntegrityError)
    async def integrity_error(request: Request, exc: IntegrityError):
        sqlstate = getattr(getattr(exc, 'orig', None), 'sqlstate', None)
        if sqlstate == '23503':
            code = 'RELATION_REFERENCED' if request.method == 'DELETE' else 'INVALID_REQUEST'
            return JSONResponse(envelope(code, request.state.request_id), status_code=409 if code == 'RELATION_REFERENCED' else 422)
        return JSONResponse(envelope('SLUG_CONFLICT', request.state.request_id, fields=[{'field': 'slug', 'message': MESSAGES['SLUG_CONFLICT']}]), status_code=409)

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, exc: SQLAlchemyError):
        code = 'QUOTA_STORE_UNAVAILABLE' if '/editorial/' in request.url.path else 'SERVICE_UNAVAILABLE'
        return JSONResponse(envelope(code, request.state.request_id, True), status_code=503)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = 'NOT_FOUND' if exc.status_code == 404 else 'INVALID_REQUEST'
        return JSONResponse(envelope(code, getattr(request.state, 'request_id', str(uuid4()))), status_code=exc.status_code)
