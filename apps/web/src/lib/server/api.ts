import type { ArticleList, Categories, PublicArticleDetail, SitemapEntries } from './contracts';

export class ContentError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super('Published content is unavailable');
  }
}

function apiOrigin(): URL {
  const origin = new URL(process.env.API_URL || 'http://127.0.0.1:8000');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new ContentError(503, 'CONTENT_CONFIGURATION');
  }
  return origin;
}

async function request<T>(path: string, valid: (value: unknown) => boolean): Promise<T> {
  const started = Date.now();
  try {
    const token = process.env.API_CONTENT_TOKEN;
    if (!token) throw new ContentError(503, 'CONTENT_CONFIGURATION');
    const timeout = Number(process.env.API_REQUEST_TIMEOUT_MS || 5000);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 5000) throw new ContentError(503, 'CONTENT_CONFIGURATION');
    const response = await fetch(new URL(path, apiOrigin()), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      let code = 'CONTENT_UNAVAILABLE';
      try { const envelope = await response.json(); if (typeof envelope?.error?.code === 'string') code = envelope.error.code; } catch { /* Non-JSON upstream failure remains a service error. */ }
      throw new ContentError(response.status === 404 ? 404 : response.status === 400 ? 400 : 503, code);
    }
    const value: unknown = await response.json();
    if (!valid(value)) throw new ContentError(503, 'CONTENT_INVALID_RESPONSE');
    return value as T;
  } catch (error) {
    const failure = error instanceof ContentError ? error : new ContentError(503, 'CONTENT_UNAVAILABLE');
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', component: 'web', event: 'cms.fetch.failed', correlationId: crypto.randomUUID(), durationMs: Date.now() - started, errorCode: failure.code }));
    throw failure;
  }
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const slug = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120;
const string = (value: unknown): value is string => typeof value === 'string';
const date = (value: unknown): boolean => string(value) && Number.isFinite(Date.parse(value));
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
function cover(value: unknown): boolean {
  return record(value) && string(value.url) && string(value.alt) && integer(value.width) && value.width > 0 && integer(value.height) && value.height > 0;
}
function card(value: unknown): boolean {
  return record(value) && string(value.documentId) && slug(value.slug) && string(value.title) && string(value.excerpt) && record(value.category) && string(value.category.name) && slug(value.category.slug) && record(value.author) && string(value.author.name) && slug(value.author.slug) && cover(value.cover) && date(value.publishedAt) && integer(value.readingTimeMinutes) && typeof value.featured === 'boolean';
}
export function articles(query: { page?: number; pageSize?: number; category?: string; featured?: boolean } = {}): Promise<ArticleList> {
  const params = new URLSearchParams({ page: String(query.page || 1), pageSize: String(query.pageSize || 9) });
  if (query.category) params.set('category', query.category);
  if (query.featured !== undefined) params.set('featured', String(query.featured));
  return request(`/api/public/articles?${params}`, value => record(value) && Array.isArray(value.data) && value.data.every(card) && record(value.meta) && ['page', 'pageSize', 'pageCount', 'total'].every(key => integer(value.meta && (value.meta as RecordValue)[key])));
}
export function categories(): Promise<Categories> {
  return request('/api/public/categories', value => record(value) && Array.isArray(value.data) && value.data.every(item => record(item) && string(item.name) && slug(item.slug) && string(item.description)));
}
export function article(articleSlug: string): Promise<{ data: PublicArticleDetail }> {
  return request(`/api/public/articles/${encodeURIComponent(articleSlug)}`, value => {
    if (!record(value) || !record(value.data) || !card(value.data)) return false;
    const data = value.data;
    return Array.isArray(data.body) && string(data.metaDescription) && Array.isArray(data.tags) && data.tags.every(string) && Array.isArray(data.sourceLinks) && data.sourceLinks.every(item => record(item) && string(item.label) && string(item.url) && (item.accessedAt === null || date(item.accessedAt))) && (data.informationCheckedAt === null || date(data.informationCheckedAt)) && ['coverCaption', 'imageCredit', 'imageSourceUrl', 'regionLabel'].every(key => string(data[key])) && date(data.updatedAt);
  });
}
export function sitemapEntries(): Promise<SitemapEntries> {
  return request('/api/public/sitemap-entries', value => record(value) && Array.isArray(value.data) && value.data.every(item => record(item) && slug(item.slug) && date(item.updatedAt)));
}
