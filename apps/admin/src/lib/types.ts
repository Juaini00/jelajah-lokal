import type { components } from '../../../../contracts/api'

type Schemas = components['schemas']

// Responses always carry every field; the generator marks server defaults optional.
export type Article = Required<Schemas['ArticleDraft']>
export type Block = Article['body'][number]
export type TextInline = Required<Schemas['TextInline']>
export type LinkInline = Schemas['LinkInline']
export type Inline = TextInline | LinkInline
export type ImageBlock = Required<Schemas['ImageBlock']>
export type SourceLink = Schemas['SourceLink']
export type Category = Required<Schemas['Category']>
export type Author = Required<Schemas['Author']>
export type Media = Schemas['Media']
export type Session = Schemas['SessionDTO']
export type Usage = Schemas['UsageResponse']
export type Generated = Schemas['GenerateResponse']
export type Review = Schemas['ReviewResponse']
export type ReviewClaim = Review['result']['claims'][number]
export type Applied = Schemas['ApplyResponse']
export type MetadataField = Applied['selectedFields'][number]

export const writingKeys = [
  'title', 'slug', 'body', 'excerpt', 'metaDescription', 'tags', 'categoryDocumentId', 'authorDocumentId',
  'coverMediaDocumentId', 'coverAlt', 'coverCaption', 'imageCredit', 'imageSourceUrl', 'sourceLinks',
  'informationCheckedAt', 'operationalClaims', 'regionLabel', 'featured',
] as const satisfies readonly (keyof Article)[]
export type WritingKey = (typeof writingKeys)[number]
export type Writing = Pick<Article, WritingKey>

export const pickWriting = (article: Article): Writing =>
  Object.fromEntries(writingKeys.map(key => [key, article[key]])) as Writing

export const changedKeys = (a: Writing, b: Writing) =>
  writingKeys.filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
