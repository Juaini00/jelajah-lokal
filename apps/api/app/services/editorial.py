import hashlib
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import Session
from app.errors import AppError
from app.models import Article, DailyQuota, EditorialRequest, GlobalLease, Principal, ValidatedCache
from app.schemas import ApplyInput, ApplyResponse, GeneratedMetadata, GenerateInput, GenerateResponse, QuotaDTO, UsageResponse, body_text, meaningful_words
from app.services.content import draft_dto, load_owned_article
from app.services.gemini import (
    GeminiClient,
    GeminiInvalidOutput,
    GeminiProviderError,
    GeminiRateLimited,
    GeminiTimeout,
    get_gemini_client,
)

PROVIDER = 'gemini'
SCHEMA_VERSION = '1'
MIN_WORDS = 100
PRECHECK_CHARS = 7000
LEASE_RESOURCE = 'gemini'


def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def resets_at() -> datetime:
    today = today_utc()
    return datetime(today.year, today.month, today.day, tzinfo=timezone.utc) + timedelta(days=1)


def revision_fingerprint(article: Article) -> str:
    return hashlib.sha256(f'{article.id}:{article.revision}'.encode('utf-8')).hexdigest()


def input_hash(text: str, settings: Settings) -> str:
    normalized = ' '.join(text.split())
    payload = f'{normalized}|{settings.gemini_model}|id|{settings.ai_prompt_version}|{SCHEMA_VERSION}'
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


async def usage(db: AsyncSession, settings: Settings) -> UsageResponse:
    today = today_utc()
    quota = (await db.execute(select(DailyQuota).where(DailyQuota.provider == PROVIDER, DailyQuota.day == today))).scalar_one_or_none()
    used = quota.used if quota else 0
    limit_calls = quota.limit_calls if quota else settings.ai_daily_limit
    lease = (await db.execute(select(GlobalLease).where(GlobalLease.resource == LEASE_RESOURCE))).scalar_one_or_none()
    busy = bool(lease and lease.expires_at and lease.expires_at > datetime.now(timezone.utc))
    return UsageResponse(
        provider='gemini',
        enabled=settings.ai_enabled and bool(settings.gemini_model) and bool(settings.gemini_api_key.get_secret_value()),
        used=used,
        limit=limit_calls,
        remaining=max(0, limit_calls - used),
        resetsAt=resets_at(),
        busy=busy,
    )


def _require_enabled(settings: Settings) -> None:
    if not (settings.ai_enabled and settings.gemini_model and settings.gemini_api_key.get_secret_value()):
        raise AppError('AI_NOT_CONFIGURED')


async def generate(
    db: AsyncSession,
    settings: Settings,
    client: GeminiClient,
    principal: Principal,
    payload: GenerateInput,
) -> GenerateResponse:
    _require_enabled(settings)
    article = await load_owned_article(db, principal, payload.articleDocumentId)
    text = body_text(article.draft.get('body') or [])
    if meaningful_words(text) < MIN_WORDS:
        raise AppError('INPUT_TOO_SHORT')
    if len(text) > PRECHECK_CHARS:
        raise AppError('INPUT_TOO_LONG')

    existing = (
        await db.execute(select(EditorialRequest).where(EditorialRequest.principal_id == principal.id, EditorialRequest.idempotency_key == payload.idempotencyKey))
    ).scalar_one_or_none()
    fingerprint = revision_fingerprint(article)

    if existing is not None:
        if existing.article_id != article.id:
            raise AppError('IDEMPOTENCY_CONFLICT')
        if existing.status in ('reserved', 'running'):
            if existing.expires_at and existing.expires_at > datetime.now(timezone.utc):
                raise AppError('AI_BUSY')
            raise AppError('AI_REQUEST_EXPIRED')
        if existing.status in ('failed', 'expired'):
            raise AppError('AI_REQUEST_EXPIRED')
        if existing.status in ('succeeded', 'applied'):
            quota = await usage(db, settings)
            return GenerateResponse(
                requestId=existing.id,
                articleDocumentId=article.id,
                revisionFingerprint=existing.revision_fingerprint,
                result=GeneratedMetadata.model_validate(existing.result),
                cacheHit=existing.cache_hit,
                quota=QuotaDTO(used=quota.used, limit=quota.limit, remaining=quota.remaining),
            )
        raise AppError('IDEMPOTENCY_CONFLICT')

    cache_key = input_hash(text, settings)
    cached = (await db.execute(select(ValidatedCache).where(ValidatedCache.key == cache_key))).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if cached is not None and cached.expires_at > now:
        request = EditorialRequest(
            principal_id=principal.id,
            article_id=article.id,
            idempotency_key=payload.idempotencyKey,
            input_hash=cache_key,
            revision_fingerprint=fingerprint,
            model=settings.gemini_model,
            prompt_version=settings.ai_prompt_version,
            schema_version=SCHEMA_VERSION,
            status='succeeded',
            result=cached.result,
            cache_hit=True,
            completed_at=now,
        )
        db.add(request)
        await db.flush()
        quota = await usage(db, settings)
        return GenerateResponse(
            requestId=request.id,
            articleDocumentId=article.id,
            revisionFingerprint=fingerprint,
            result=GeneratedMetadata.model_validate(cached.result),
            cacheHit=True,
            quota=QuotaDTO(used=quota.used, limit=quota.limit, remaining=quota.remaining),
        )

    # Reserve lease + quota in a short, independent transaction.
    async with Session() as reserve_db:
        async with reserve_db.begin():
            lease = (await reserve_db.execute(select(GlobalLease).where(GlobalLease.resource == LEASE_RESOURCE).with_for_update())).scalar_one_or_none()
            if lease is None:
                lease = GlobalLease(resource=LEASE_RESOURCE, fence=0)
                reserve_db.add(lease)
                await reserve_db.flush()
            if lease.owner_request_id is not None and lease.expires_at and lease.expires_at > now:
                raise AppError('AI_BUSY')
            quota_row = (
                await reserve_db.execute(select(DailyQuota).where(DailyQuota.provider == PROVIDER, DailyQuota.day == today_utc()).with_for_update())
            ).scalar_one_or_none()
            if quota_row is None:
                quota_row = DailyQuota(provider=PROVIDER, day=today_utc(), used=0, limit_calls=settings.ai_daily_limit)
                reserve_db.add(quota_row)
                await reserve_db.flush()
            if quota_row.used >= quota_row.limit_calls:
                raise AppError('DAILY_QUOTA_EXCEEDED')
            quota_row.used += 1
            request = EditorialRequest(
                principal_id=principal.id,
                article_id=article.id,
                idempotency_key=payload.idempotencyKey,
                input_hash=cache_key,
                revision_fingerprint=fingerprint,
                model=settings.gemini_model,
                prompt_version=settings.ai_prompt_version,
                schema_version=SCHEMA_VERSION,
                status='running',
                quota_date=today_utc(),
            )
            reserve_db.add(request)
            await reserve_db.flush()
            lease.fence += 1
            lease.owner_request_id = request.id
            lease.expires_at = now + timedelta(milliseconds=settings.ai_timeout_ms)
            request.lease_fence = lease.fence
            request.expires_at = lease.expires_at
            request_id = request.id
            fence = lease.fence

    # Provider call happens with no open DB transaction.
    try:
        tokens = client.count_tokens(text)
        if tokens > settings.ai_max_input_tokens:
            raise AppError('INPUT_TOO_LONG')
        result = client.generate_metadata(text)
        validated = GeneratedMetadata.model_validate(result)
    except AppError:
        await _finish_failed(request_id, fence, 'INPUT_TOO_LONG')
        raise
    except GeminiTimeout:
        await _finish_failed(request_id, fence, 'AI_TIMEOUT')
        raise AppError('AI_TIMEOUT')
    except GeminiRateLimited:
        await _finish_failed(request_id, fence, 'PROVIDER_RATE_LIMITED')
        raise AppError('PROVIDER_RATE_LIMITED')
    except (GeminiInvalidOutput, Exception) as exc:
        if isinstance(exc, GeminiProviderError):
            await _finish_failed(request_id, fence, 'AI_PROVIDER_ERROR')
            raise AppError('AI_PROVIDER_ERROR')
        await _finish_failed(request_id, fence, 'INVALID_AI_OUTPUT')
        raise AppError('INVALID_AI_OUTPUT')

    async with Session() as finish_db:
        async with finish_db.begin():
            row = (await finish_db.execute(select(EditorialRequest).where(EditorialRequest.id == request_id))).scalar_one()
            row.status = 'succeeded'
            row.result = validated.model_dump(mode='json')
            row.completed_at = datetime.now(timezone.utc)
            lease = (await finish_db.execute(select(GlobalLease).where(GlobalLease.resource == LEASE_RESOURCE))).scalar_one_or_none()
            if lease and lease.fence == fence:
                lease.owner_request_id = None
            existing_cache = (await finish_db.execute(select(ValidatedCache).where(ValidatedCache.key == cache_key))).scalar_one_or_none()
            expires = datetime.now(timezone.utc) + timedelta(days=settings.ai_cache_ttl_days)
            if existing_cache is None:
                finish_db.add(ValidatedCache(key=cache_key, result=row.result, expires_at=expires))
            else:
                existing_cache.result = row.result
                existing_cache.expires_at = expires

    quota = await usage(db, settings)
    return GenerateResponse(
        requestId=request_id,
        articleDocumentId=article.id,
        revisionFingerprint=fingerprint,
        result=validated,
        cacheHit=False,
        quota=QuotaDTO(used=quota.used, limit=quota.limit, remaining=quota.remaining),
    )


async def _finish_failed(request_id: UUID, fence: int, error_code: str) -> None:
    async with Session() as db:
        async with db.begin():
            row = (await db.execute(select(EditorialRequest).where(EditorialRequest.id == request_id))).scalar_one_or_none()
            if row is not None:
                row.status = 'failed'
                row.error_code = error_code
                row.completed_at = datetime.now(timezone.utc)
            lease = (await db.execute(select(GlobalLease).where(GlobalLease.resource == LEASE_RESOURCE))).scalar_one_or_none()
            if lease and lease.fence == fence:
                lease.owner_request_id = None


async def apply(db: AsyncSession, principal: Principal, payload: ApplyInput):
    request = (await db.execute(select(EditorialRequest).where(EditorialRequest.id == payload.requestId))).scalar_one_or_none()
    if request is None or request.principal_id != principal.id:
        raise AppError('ARTICLE_NOT_FOUND')
    if request.status == 'applied':
        replay_payload = {f: getattr(payload.values, f) for f in payload.selectedFields}
        if request.applied_payload != replay_payload or set(payload.selectedFields) != set((request.applied_response or {}).get('selectedFields', [])):
            raise AppError('IDEMPOTENCY_CONFLICT')
        return ApplyResponse(
            requestId=request.id,
            articleDocumentId=request.article_id,
            applied=True,
            draftRevision=request.applied_response['draftRevision'],
            selectedFields=request.applied_response['selectedFields'],
        )
    if request.status != 'succeeded':
        raise AppError('IDEMPOTENCY_CONFLICT')
    article = await load_owned_article(db, principal, request.article_id)
    if revision_fingerprint(article) != request.revision_fingerprint:
        raise AppError('ARTICLE_CHANGED')
    draft = dict(article.draft)
    values = payload.values
    for field in payload.selectedFields:
        draft[field] = getattr(values, field)
    article.draft = draft
    article.revision += 1
    article.updated_at = datetime.now(timezone.utc)
    request.status = 'applied'
    request.applied_payload = {f: getattr(values, f) for f in payload.selectedFields}
    request.applied_response = {'draftRevision': article.revision, 'selectedFields': payload.selectedFields}
    request.applied_at = datetime.now(timezone.utc)
    await db.flush()
    return ApplyResponse(
        requestId=request.id,
        articleDocumentId=article.id,
        applied=True,
        draftRevision=article.revision,
        selectedFields=payload.selectedFields,
    )
