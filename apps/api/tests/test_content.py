import pytest

from app.errors import AppError
from app.schemas import ArticleCreate, ArticlePatch, RevisionInput
from app.services import content


@pytest.mark.asyncio
async def test_draft_lifecycle_and_publish_guard(db, admin_principal_factory):
    owner = admin_principal_factory()
    db.add(owner)
    await db.flush()

    draft = await content.create_draft(db, owner, ArticleCreate(title='Judul awal'))
    assert draft.revision == 1
    assert draft.publishedAt is None

    with pytest.raises(AppError) as exc:
        await content.publish(db, owner, draft.documentId, draft.revision)
    assert exc.value.code == 'PUBLISH_VALIDATION_FAILED'


@pytest.mark.asyncio
async def test_stale_revision_rejected(db, admin_principal_factory):
    owner = admin_principal_factory(username='admin-rev')
    db.add(owner)
    await db.flush()

    draft = await content.create_draft(db, owner, ArticleCreate(title='Judul'))
    await content.update_draft(db, owner, draft.documentId, ArticlePatch(revision=draft.revision, title='Judul baru'))

    with pytest.raises(AppError) as exc:
        await content.update_draft(db, owner, draft.documentId, ArticlePatch(revision=draft.revision, title='Judul lain'))
    assert exc.value.code == 'ARTICLE_CHANGED'


@pytest.mark.asyncio
async def test_editor_cannot_access_others_draft(db, admin_principal_factory):
    owner = admin_principal_factory(username='admin-owner')
    other = admin_principal_factory(username='editor-other', role='editor')
    db.add_all([owner, other])
    await db.flush()

    draft = await content.create_draft(db, owner, ArticleCreate(title='Rahasia'))

    with pytest.raises(AppError) as exc:
        await content.load_owned_article(db, other, draft.documentId)
    assert exc.value.code == 'FORBIDDEN'


@pytest.mark.asyncio
async def test_delete_unpublished_draft_succeeds(db, admin_principal_factory):
    owner = admin_principal_factory(username='admin-del')
    db.add(owner)
    await db.flush()
    draft = await content.create_draft(db, owner, ArticleCreate(title='Artikel'))

    await content.delete_draft(db, owner, draft.documentId)

    with pytest.raises(AppError) as exc:
        await content.load_owned_article(db, owner, draft.documentId)
    assert exc.value.code == 'ARTICLE_NOT_FOUND'

    with pytest.raises(AppError):
        await content.delete_draft(db, owner, draft.documentId)
