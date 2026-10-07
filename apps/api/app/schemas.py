import re
from datetime import date, datetime
from typing import Annotated, Generic, Literal, TypeVar
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class DTO(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


def safe_text(value: str) -> str:
    if re.search(r'<\s*/?\s*[a-z!]|\bon\w+\s*=|javascript\s*:', value, re.I):
        raise ValueError('HTML and executable content are not permitted')
    if any(ord(c) < 32 and c not in '\n\t\r' for c in value):
        raise ValueError('Control characters are not permitted')
    return value


def safe_url(value: str) -> str:
    p = urlsplit(value)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password or any(c.isspace() for c in value) or '\\' in value:
        raise ValueError('A safe HTTP(S) URL is required')
    return value


Text = Annotated[str, Field(max_length=20000), field_validator] if False else str
Slug = Annotated[str, Field(pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$', max_length=120)]


class TextInline(DTO):
    # Runs are fragments of one sentence: stripping would glue "Saya " + **suka** + " pantai" into "Sayasukapantai".
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)
    type: Literal['text']
    text: str = Field(max_length=20000)
    bold: bool = False
    italic: bool = False
    _safe = field_validator('text')(safe_text)


class LinkInline(DTO):
    type: Literal['link']
    url: str = Field(max_length=2048)
    children: list[TextInline] = Field(min_length=1, max_length=100)
    _url = field_validator('url')(safe_url)


Inline = Annotated[TextInline | LinkInline, Field(discriminator='type')]


class Paragraph(DTO):
    type: Literal['paragraph']
    children: list[Inline] = Field(max_length=200)


class Heading(DTO):
    type: Literal['heading']
    level: Literal[2, 3]
    children: list[Inline] = Field(min_length=1, max_length=200)


class Quote(DTO):
    type: Literal['quote']
    children: list[Inline] = Field(max_length=200)


class ListBlock(DTO):
    type: Literal['list']
    ordered: bool
    items: list[list[Inline]] = Field(min_length=1, max_length=100)


class ImageBlock(DTO):
    type: Literal['image']
    mediaDocumentId: UUID
    alt: str = Field(min_length=1, max_length=180)
    caption: str = Field(default='', max_length=240)
    _safe = field_validator('alt', 'caption')(safe_text)


Block = Annotated[Paragraph | Heading | Quote | ListBlock | ImageBlock, Field(discriminator='type')]


def body_text(body: list[dict]) -> str:
    def inline(nodes):
        return ''.join(n.get('text', '') if n['type'] == 'text' else inline(n['children']) for n in nodes)
    parts = []
    for block in body:
        if block['type'] == 'image':
            continue
        parts.extend(inline(nodes) for nodes in (block['items'] if block['type'] == 'list' else [block['children']]))
    return '\n'.join(parts)


def meaningful_words(text: str) -> int:
    return len(re.findall(r'[^\W\d_]+(?:[-’\'][^\W\d_]+)*', text, re.UNICODE))


def validate_tags(tags: list[str]) -> list[str]:
    tags = [safe_text(t.strip()) for t in tags]
    if len(tags) > 5 or any(not 2 <= len(t) <= 30 for t in tags) or len({t.casefold() for t in tags}) != len(tags):
        raise ValueError('Tags must be unique, at most five, each 2–30 characters')
    return tags


class SourceLink(DTO):
    label: str = Field(min_length=1, max_length=120)
    url: str = Field(max_length=2048)
    accessedAt: date | None = None
    _url = field_validator('url')(safe_url)
    _safe = field_validator('label')(safe_text)


class WritingFields(DTO):
    title: str = Field(default='', max_length=120)
    slug: str = Field(default='', max_length=120)
    body: list[Block] = Field(default_factory=list, max_length=300)
    excerpt: str = Field(default='', max_length=240)
    metaDescription: str = Field(default='', max_length=160)
    tags: list[str] = Field(default_factory=list, max_length=5)
    categoryDocumentId: UUID | None = None
    authorDocumentId: UUID | None = None
    coverMediaDocumentId: UUID | None = None
    coverAlt: str = Field(default='', max_length=180)
    coverCaption: str = Field(default='', max_length=240)
    imageCredit: str = Field(default='', max_length=240)
    imageSourceUrl: str = Field(default='', max_length=2048)
    sourceLinks: list[SourceLink] = Field(default_factory=list, max_length=30)
    informationCheckedAt: date | None = None
    operationalClaims: bool = False
    regionLabel: str = Field(default='', max_length=80)
    featured: bool = False
    _tags = field_validator('tags')(validate_tags)
    _safe = field_validator('title', 'excerpt', 'metaDescription', 'coverAlt', 'coverCaption', 'imageCredit', 'regionLabel')(safe_text)

    @field_validator('slug')
    @classmethod
    def valid_slug(cls, value):
        if value and not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', value):
            raise ValueError('Slug must contain lowercase Latin letters, numbers and hyphens')
        return value

    @field_validator('imageSourceUrl')
    @classmethod
    def valid_source(cls, value):
        return safe_url(value) if value else value

    @model_validator(mode='after')
    def body_limit(self):
        if len(body_text([b.model_dump(mode='json') for b in self.body])) > 20000:
            raise ValueError('Body text exceeds 20,000 characters')
        if self.informationCheckedAt and self.informationCheckedAt > date.today():
            raise ValueError('Checked date cannot be in the future')
        return self


class ArticleCreate(WritingFields):
    pass


class ArticlePatch(WritingFields):
    revision: int = Field(ge=1)


class RevisionInput(DTO):
    revision: int = Field(ge=1)


class ArticleDraft(WritingFields):
    documentId: UUID
    revision: int
    createdAt: datetime
    updatedAt: datetime
    publishedAt: datetime | None
    publishedRevision: int | None


class CategoryInput(DTO):
    name: str = Field(min_length=2, max_length=50)
    slug: Slug
    description: str = Field(default='', max_length=240)
    order: int = Field(default=0, ge=-10000, le=10000)
    _safe = field_validator('name', 'description')(safe_text)


class Category(CategoryInput):
    documentId: UUID


class AuthorInput(DTO):
    name: str = Field(min_length=2, max_length=80)
    slug: Slug
    bio: str = Field(default='', max_length=300)
    avatarMediaDocumentId: UUID | None = None
    _safe = field_validator('name', 'bio')(safe_text)


class Author(AuthorInput):
    documentId: UUID


class Media(DTO):
    documentId: UUID
    url: str
    publicId: str
    assetId: str
    width: int
    height: int
    format: Literal['jpg', 'jpeg', 'png', 'webp']
    credit: str
    sourceUrl: str
    license: str
    createdAt: datetime


class Cover(DTO):
    url: str
    alt: str
    width: int
    height: int


class PublicImageBlock(ImageBlock):
    media: Cover


PublicBlock = Annotated[Paragraph | Heading | Quote | ListBlock | PublicImageBlock, Field(discriminator='type')]


class PublicName(DTO):
    name: str
    slug: str


class PublicArticleCard(DTO):
    documentId: UUID
    slug: str
    title: str
    excerpt: str
    category: PublicName
    author: PublicName
    cover: Cover
    publishedAt: datetime
    readingTimeMinutes: int
    featured: bool


class PublicArticleDetail(PublicArticleCard):
    body: list[PublicBlock]
    metaDescription: str
    tags: list[str]
    sourceLinks: list[SourceLink]
    informationCheckedAt: date | None
    coverCaption: str
    imageCredit: str
    imageSourceUrl: str
    regionLabel: str
    updatedAt: datetime


class PageMeta(DTO):
    page: int
    pageSize: int
    pageCount: int
    total: int


class PublicArticleList(DTO):
    data: list[PublicArticleCard]
    meta: PageMeta


class PublicCategory(PublicName):
    description: str


class PublicCategoryList(DTO):
    data: list[PublicCategory]


class SitemapEntry(DTO):
    slug: str
    updatedAt: datetime


class PublicSitemapList(DTO):
    data: list[SitemapEntry]


T = TypeVar('T')


class Data(DTO, Generic[T]):
    data: T


class PrincipalDTO(DTO):
    documentId: UUID
    username: str
    role: Literal['admin', 'editor']


class SessionDTO(DTO):
    principal: PrincipalDTO
    csrfToken: str


class LoginInput(DTO):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=1024)


class GeneratedMetadata(DTO):
    excerpt: str = Field(min_length=50, max_length=240)
    metaDescription: str = Field(min_length=70, max_length=160)
    suggestedTags: list[str] = Field(min_length=1, max_length=5)
    _tags = field_validator('suggestedTags')(validate_tags)
    _safe = field_validator('excerpt', 'metaDescription')(safe_text)


class GenerateInput(DTO):
    articleDocumentId: UUID
    idempotencyKey: UUID


class ApplyValues(DTO):
    excerpt: str | None = Field(default=None, min_length=50, max_length=240)
    metaDescription: str | None = Field(default=None, min_length=70, max_length=160)
    tags: list[str] | None = None

    @field_validator('excerpt', 'metaDescription')
    @classmethod
    def valid_text(cls, value):
        return safe_text(value) if value is not None else value

    @field_validator('tags')
    @classmethod
    def valid_tags(cls, value):
        return validate_tags(value) if value is not None else value


class ApplyInput(DTO):
    requestId: UUID
    selectedFields: list[Literal['excerpt', 'metaDescription', 'tags']] = Field(min_length=1, max_length=3)
    values: ApplyValues

    @model_validator(mode='after')
    def selected_values(self):
        if len(set(self.selectedFields)) != len(self.selectedFields) or set(self.values.model_fields_set) != set(self.selectedFields) or any(getattr(self.values, f) is None for f in self.selectedFields):
            raise ValueError('Provide exactly the unique selected metadata fields')
        return self


class QuotaDTO(DTO):
    used: int
    limit: int
    remaining: int


class GenerateResponse(DTO):
    requestId: UUID
    articleDocumentId: UUID
    revisionFingerprint: str
    result: GeneratedMetadata
    cacheHit: bool
    quota: QuotaDTO


class ReviewClaim(DTO):
    quote: str = Field(min_length=3, max_length=300)
    kind: Literal['harga', 'jadwal', 'kontak', 'lokasi', 'lainnya']
    note: str = Field(min_length=1, max_length=240)
    _safe = field_validator('quote', 'note')(safe_text)


class ReviewGap(DTO):
    topic: str = Field(min_length=2, max_length=80)
    suggestion: str = Field(min_length=1, max_length=280)
    _safe = field_validator('topic', 'suggestion')(safe_text)


class EditorialReview(DTO):
    summary: str = Field(min_length=1, max_length=400)
    claims: list[ReviewClaim] = Field(max_length=6)
    gaps: list[ReviewGap] = Field(max_length=4)
    _safe = field_validator('summary')(safe_text)


class ReviewResponse(DTO):
    requestId: UUID
    articleDocumentId: UUID
    revisionFingerprint: str
    result: EditorialReview
    cacheHit: bool
    quota: QuotaDTO


class ApplyResponse(DTO):
    requestId: UUID
    articleDocumentId: UUID
    applied: Literal[True]
    draftRevision: int
    selectedFields: list[Literal['excerpt', 'metaDescription', 'tags']]


class UsageResponse(QuotaDTO):
    provider: Literal['gemini']
    enabled: bool
    resetsAt: datetime
    busy: bool


class FieldIssue(DTO):
    field: str
    message: str


class ErrorDetail(DTO):
    code: str
    message: str
    requestId: str
    retryable: bool
    fields: list[FieldIssue] | None = None


class ErrorEnvelope(DTO):
    error: ErrorDetail


class Deleted(DTO):
    deleted: Literal[True]


class LoggedOut(DTO):
    loggedOut: Literal[True]
