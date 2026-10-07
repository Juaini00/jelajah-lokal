// Bound to contracts/implementation.md. Replace these aliases with generated
// contracts/api.d.ts components when the coordinator exports the OpenAPI schema.
export type TextInline = { type: 'text'; text: string; bold?: boolean; italic?: boolean };
export type Inline = TextInline | { type: 'link'; url: string; children: TextInline[] };
export type Cover = { url: string; alt: string; width: number; height: number };
export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 2 | 3; children: Inline[] }
  | { type: 'quote'; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'image'; mediaDocumentId: string; alt: string; caption?: string; media: Cover };
export type PublicArticleCard = {
  documentId: string; slug: string; title: string; excerpt: string;
  category: { name: string; slug: string }; author: { name: string; slug: string };
  cover: Cover; publishedAt: string; readingTimeMinutes: number; featured: boolean;
};
export type PublicArticleDetail = PublicArticleCard & {
  body: Block[]; metaDescription: string; tags: string[];
  sourceLinks: { label: string; url: string; accessedAt: string | null }[];
  informationCheckedAt: string | null; coverCaption: string; imageCredit: string;
  imageSourceUrl: string; regionLabel: string; updatedAt: string;
};
export type ArticleList = { data: PublicArticleCard[]; meta: { page: number; pageSize: number; pageCount: number; total: number } };
export type Category = { name: string; slug: string; description: string };
export type Categories = { data: Category[] };
export type SitemapEntries = { data: { slug: string; updatedAt: string }[] };
