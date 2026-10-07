from uuid import uuid4

import pytest

from app.errors import AppError
from app.schemas import ApplyInput, ApplyValues, ArticleCreate, GenerateInput
from app.services import content, editorial
from app.testing import FakeGeminiClient

LONG_BODY = [{'type': 'paragraph', 'children': [{'type': 'text', 'text': 'Kata bermakna ' * 120}]}]


@pytest.mark.asyncio
async def test_generate_then_apply_roundtrip(db, settings, admin_principal_factory):
    owner = admin_principal_factory(username='admin-ai')
    db.add(owner)
    await db.flush()
    draft = await content.create_draft(db, owner, ArticleCreate(title='Judul uji', body=LONG_BODY))
    await db.commit()

    settings.ai_enabled = True
    settings.gemini_model = 'gemini-test'
    settings.gemini_api_key = settings.gemini_api_key.__class__('test-key')

    client = FakeGeminiClient()
    key = uuid4()
    result = await editorial.generate(db, settings, client, owner, GenerateInput(articleDocumentId=draft.documentId, idempotencyKey=key))
    assert result.cacheHit is False
    assert result.result.suggestedTags

    applied = await editorial.apply(
        db,
        owner,
        ApplyInput(
            requestId=result.requestId,
            selectedFields=['excerpt'],
            values=ApplyValues(excerpt=result.result.excerpt),
        ),
    )
    assert applied.applied is True
    assert applied.draftRevision == draft.revision + 1


@pytest.mark.asyncio
async def test_generate_rejects_short_body(db, settings, admin_principal_factory):
    owner = admin_principal_factory(username='admin-ai-short')
    db.add(owner)
    await db.flush()
    draft = await content.create_draft(db, owner, ArticleCreate(title='Pendek', body=[{'type': 'paragraph', 'children': [{'type': 'text', 'text': 'Terlalu singkat.'}]}]))

    settings.ai_enabled = True
    settings.gemini_model = 'gemini-test'
    settings.gemini_api_key = settings.gemini_api_key.__class__('test-key')

    with pytest.raises(AppError) as exc:
        await editorial.generate(db, settings, FakeGeminiClient(), owner, GenerateInput(articleDocumentId=draft.documentId, idempotencyKey=uuid4()))
    assert exc.value.code == 'INPUT_TOO_SHORT'


@pytest.mark.asyncio
async def test_generate_disabled_when_ai_not_configured(db, settings, admin_principal_factory):
    owner = admin_principal_factory(username='admin-ai-off')
    db.add(owner)
    await db.flush()
    draft = await content.create_draft(db, owner, ArticleCreate(title='Judul', body=LONG_BODY))

    settings.ai_enabled = False

    with pytest.raises(AppError) as exc:
        await editorial.generate(db, settings, FakeGeminiClient(), owner, GenerateInput(articleDocumentId=draft.documentId, idempotencyKey=uuid4()))
    assert exc.value.code == 'AI_NOT_CONFIGURED'


@pytest.mark.asyncio
async def test_review_keeps_only_grounded_claims_and_cannot_be_applied(db, settings, admin_principal_factory):
    owner = admin_principal_factory(username='admin-ai-review')
    db.add(owner)
    await db.flush()
    draft = await content.create_draft(db, owner, ArticleCreate(title='Judul uji review', body=LONG_BODY))
    await db.commit()

    settings.ai_enabled = True
    settings.gemini_model = 'gemini-test'
    settings.gemini_api_key = settings.gemini_api_key.__class__('test-key')

    reviewed = await editorial.review(db, settings, FakeGeminiClient(), owner, GenerateInput(articleDocumentId=draft.documentId, idempotencyKey=uuid4()))

    # The invented price sentence is not in the article, so it must not reach the editor.
    assert [c.kind for c in reviewed.result.claims] == ['lainnya']
    assert reviewed.result.gaps[0].topic == 'Akses'
    # A finished request releases the lease, so the UI must not keep reporting "busy" until expiry.
    assert (await editorial.usage(db, settings)).busy is False

    with pytest.raises(AppError) as exc:
        await editorial.apply(db, owner, ApplyInput(requestId=reviewed.requestId, selectedFields=['excerpt'], values=ApplyValues(excerpt='x' * 60)))
    assert exc.value.code == 'IDEMPOTENCY_CONFLICT'
