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
    # Title meets the 10-character minimum; every other unmet requirement is itemized for the editor.
    assert [issue['field'] for issue in exc.value.fields] == ['slug', 'categoryDocumentId', 'authorDocumentId', 'body', 'excerpt', 'metaDescription', 'coverMediaDocumentId', 'coverAlt']


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


@pytest.mark.asyncio
async def test_formatted_text_keeps_spaces_between_runs(db, admin_principal_factory):
    owner = admin_principal_factory(username='admin-runs')
    db.add(owner)
    await db.flush()
    runs = [{'type': 'text', 'text': 'Saya '}, {'type': 'text', 'text': 'suka', 'bold': True}, {'type': 'text', 'text': ' pantai'}]
    draft = await content.create_draft(db, owner, ArticleCreate.model_validate({'body': [{'type': 'paragraph', 'children': runs}]}))

    saved = await content.update_draft(db, owner, draft.documentId, ArticlePatch.model_validate({'revision': draft.revision, 'body': draft.model_dump(mode='json')['body']}))

    assert ''.join(run['text'] for run in saved.model_dump(mode='json')['body'][0]['children']) == 'Saya suka pantai'


@pytest.mark.asyncio
async def test_unpublished_article_can_be_deleted(db, admin_principal_factory):
    from app.models import AuthorRecord, CategoryRecord, MediaRecord

    owner = admin_principal_factory(username='admin-unpub')
    category = CategoryRecord(slug='uji-kategori', data={'name': 'Uji', 'description': '', 'order': 0})
    author = AuthorRecord(slug='uji-penulis', data={'name': 'Penulis Uji', 'bio': ''})
    media = MediaRecord(public_id='uji/sampul', asset_id='uji-asset', data={'url': 'https://res.cloudinary.com/x/image/upload/uji.jpg', 'width': 10, 'height': 10, 'format': 'jpg', 'credit': '', 'sourceUrl': '', 'license': ''})
    db.add_all([owner, category, author, media])
    await db.flush()
    words = ' '.join(['pantai'] * 160)
    draft = await content.create_draft(db, owner, ArticleCreate.model_validate({
        'title': 'Judul yang cukup panjang', 'slug': 'judul-uji', 'excerpt': 'r' * 60, 'metaDescription': 'm' * 80,
        'body': [{'type': 'paragraph', 'children': [{'type': 'text', 'text': words}]}],
        'categoryDocumentId': str(category.id), 'authorDocumentId': str(author.id), 'coverMediaDocumentId': str(media.id), 'coverAlt': 'Sampul',
    }))
    live = await content.publish(db, owner, draft.documentId, draft.revision)
    await content.unpublish(db, owner, draft.documentId, live.revision)

    # Previously the leftover snapshot made the delete fail at commit, after a 200 had already been sent.
    await content.delete_draft(db, owner, draft.documentId)

    with pytest.raises(AppError) as exc:
        await content.load_owned_article(db, owner, draft.documentId)
    assert exc.value.code == 'ARTICLE_NOT_FOUND'
