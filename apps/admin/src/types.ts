// Frozen contract DTOs; replace aliases with contracts/api.d.ts when OpenAPI is exported.
export type TextInline = { type: 'text'; text: string; bold?: boolean; italic?: boolean }
export type Inline = TextInline | { type: 'link'; url: string; children: TextInline[] }
export type Block = { type: 'paragraph' | 'quote'; children: Inline[] } | { type: 'heading'; level: 2 | 3; children: Inline[] } | { type: 'list'; ordered: boolean; items: Inline[][] } | { type: 'image'; mediaDocumentId: string; alt: string; caption?: string }
export interface Article {
  documentId: string; revision: number; title: string; slug: string; body: Block[]; excerpt: string; metaDescription: string; tags: string[];
  categoryDocumentId: string | null; authorDocumentId: string | null; coverMediaDocumentId: string | null; coverAlt: string; coverCaption: string; imageCredit: string; imageSourceUrl: string;
  sourceLinks: { label: string; url: string; accessedAt: string | null }[]; informationCheckedAt: string | null; operationalClaims: boolean; regionLabel: string; featured: boolean;
  createdAt: string; updatedAt: string; publishedAt: string | null; publishedRevision: number | null;
}
export type Writing = Omit<Article, 'documentId' | 'revision' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'publishedRevision'>
export interface Category { documentId: string; name: string; slug: string; description: string; order: number }
export interface Author { documentId: string; name: string; slug: string; bio: string; avatarMediaDocumentId: string | null }
export interface Media { documentId: string; url: string; publicId: string; assetId: string; width: number; height: number; format: string; credit: string; sourceUrl: string; license: string; createdAt: string }
export interface Session { principal: { documentId: string; username: string; role: string }; csrfToken: string }
export interface Usage { provider: 'gemini'; enabled: boolean; used: number; limit: number; remaining: number; resetsAt: string; busy: boolean }
export type MetadataField = 'excerpt' | 'metaDescription' | 'tags'
export interface Generated { requestId: string; articleDocumentId: string; revisionFingerprint: string; result: { excerpt: string; metaDescription: string; suggestedTags: string[] }; cacheHit: boolean; quota: { used: number; limit: number; remaining: number } }
export interface Applied { requestId: string; articleDocumentId: string; applied: true; draftRevision: number; selectedFields: MetadataField[] }
export type Api = <T>(path: string, options?: RequestInit) => Promise<T>
export const points = (value: string) => Array.from(value).length
export const tagsFrom = (value: string) => value.split(',').map(x => x.trim()).filter(Boolean)
export const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Belum diterbitkan'
export const inlineText = (items: Inline[]) => items.map(x => x.type === 'text' ? x.text : x.children.map(t => t.text).join('')).join('')
export const bodyText = (blocks: Block[]) => blocks.map(b => b.type === 'image' ? '' : b.type === 'list' ? b.items.map(inlineText).join('\n') : inlineText(b.children)).filter(Boolean).join('\n\n')
export const safeUrl = (value: string) => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password } catch { return false } }
