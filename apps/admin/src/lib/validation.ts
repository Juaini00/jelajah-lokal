import type { FieldIssue } from './api'
import type { Block, Inline, Writing } from './types'

/* Mirrors apps/api app/schemas.py (save) and services/content.py publish_issues (publish). The server stays authoritative. */
export const LIMITS = { title: [10, 120], excerpt: [50, 240], metaDescription: [70, 160], bodyWords: 150, bodyChars: 20_000, coverAlt: 180, caption: 240, credit: 240, region: 80, slug: 120, tags: 5, tag: [2, 30] } as const

export const fieldLabels: Record<string, string> = {
  title: 'Judul', slug: 'Slug', body: 'Isi artikel', excerpt: 'Ringkasan', metaDescription: 'Deskripsi SEO', tags: 'Tag',
  categoryDocumentId: 'Kategori', authorDocumentId: 'Penulis', coverMediaDocumentId: 'Gambar sampul', coverAlt: 'Teks alternatif sampul',
  coverCaption: 'Keterangan sampul', imageCredit: 'Kredit foto', imageSourceUrl: 'URL sumber foto', sourceLinks: 'Sumber informasi',
  informationCheckedAt: 'Tanggal pemeriksaan', operationalClaims: 'Klaim operasional', regionLabel: 'Wilayah', featured: 'Unggulan',
  name: 'Nama', description: 'Deskripsi', bio: 'Bio', order: 'Urutan', avatarMediaDocumentId: 'Foto profil', file: 'Berkas', credit: 'Kredit', sourceUrl: 'URL sumber', license: 'Lisensi',
}
export const labelFor = (path: string) => {
  const [head, index, ...rest] = path.split('.')
  if (head === 'sourceLinks' && index !== undefined) return `Sumber #${Number(index) + 1}${rest.includes('url') ? ' · URL' : rest.includes('label') ? ' · nama' : ''}`
  if (head === 'body' && index !== undefined) return `Isi artikel · blok ${Number(index) + 1}${rest.includes('alt') ? ' · teks alternatif' : ''}`
  return fieldLabels[head] ?? path
}

export const codePoints = (value: string) => Array.from(value).length
const inlineText = (items: Inline[]): string => items.map(x => (x.type === 'text' ? x.text : x.children.map(t => t.text).join(''))).join('')
export const bodyText = (blocks: Block[]) => blocks.flatMap(b => (b.type === 'image' ? [] : b.type === 'list' ? b.items.map(inlineText) : [inlineText(b.children)])).join('\n')
export const countWords = (text: string) => text.match(/\p{L}+(?:[-’']\p{L}+)*/gu)?.length ?? 0

export function safeUrl(value: string) {
  if (/\s|\\/.test(value)) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname && !url.username && !url.password
  } catch { return false }
}
export const unsafeText = (value: string) => /<\s*\/?\s*[a-z!]|\bon\w+\s*=|javascript\s*:/i.test(value)
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const slugify = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, LIMITS.slug).replace(/-+$/, '')
const today = () => new Date().toLocaleDateString('sv-SE')

export function tagIssue(tags: string[]) {
  if (tags.length > LIMITS.tags) return `Maksimal ${LIMITS.tags} tag.`
  const bad = tags.find(t => codePoints(t) < LIMITS.tag[0] || codePoints(t) > LIMITS.tag[1])
  if (bad !== undefined) return `Tag "${bad}" harus ${LIMITS.tag[0]}–${LIMITS.tag[1]} karakter.`
  if (new Set(tags.map(t => t.toLocaleLowerCase('id'))).size !== tags.length) return 'Tag tidak boleh duplikat.'
  return ''
}

/** Problems the server would reject on save (422). Empty optional fields are always fine. */
export function saveIssues(w: Writing): FieldIssue[] {
  const issues: FieldIssue[] = []
  const add = (field: string, message: string) => issues.push({ field, message })
  const max = (field: keyof Writing, value: string, limit: number) => { if (codePoints(value) > limit) add(field, `Maksimal ${limit} karakter.`) }
  max('title', w.title, LIMITS.title[1])
  if (w.slug && !SLUG_PATTERN.test(w.slug)) add('slug', 'Gunakan huruf kecil, angka, dan tanda hubung (contoh: pantai-pink-lombok).')
  max('slug', w.slug, LIMITS.slug)
  max('excerpt', w.excerpt, LIMITS.excerpt[1])
  max('metaDescription', w.metaDescription, LIMITS.metaDescription[1])
  max('coverAlt', w.coverAlt, LIMITS.coverAlt)
  max('coverCaption', w.coverCaption, LIMITS.caption)
  max('imageCredit', w.imageCredit, LIMITS.credit)
  max('regionLabel', w.regionLabel, LIMITS.region)
  const tags = tagIssue(w.tags)
  if (tags) add('tags', tags)
  for (const field of ['title', 'excerpt', 'metaDescription', 'coverAlt', 'coverCaption', 'imageCredit', 'regionLabel'] as const) {
    if (unsafeText(w[field])) add(field, 'Teks tidak boleh berisi tag HTML atau skrip.')
  }
  if (w.imageSourceUrl && !safeUrl(w.imageSourceUrl)) add('imageSourceUrl', 'Gunakan URL lengkap yang diawali https://.')
  if (w.informationCheckedAt && w.informationCheckedAt.slice(0, 10) > today()) add('informationCheckedAt', 'Tanggal pemeriksaan tidak boleh di masa depan.')
  w.sourceLinks.forEach((source, i) => {
    if (!source.label.trim()) add(`sourceLinks.${i}.label`, 'Nama sumber wajib diisi.')
    else if (codePoints(source.label) > 120) add(`sourceLinks.${i}.label`, 'Maksimal 120 karakter.')
    if (!safeUrl(source.url)) add(`sourceLinks.${i}.url`, source.url ? 'Gunakan URL lengkap yang diawali https://.' : 'URL sumber wajib diisi.')
  })
  if (codePoints(bodyText(w.body)) > LIMITS.bodyChars) add('body', `Isi artikel melebihi ${LIMITS.bodyChars.toLocaleString('id-ID')} karakter.`)
  if (unsafeText(bodyText(w.body))) add('body', 'Isi artikel tidak boleh memuat potongan HTML/skrip seperti "<b" atau "onclick=".')
  w.body.forEach((block, i) => {
    if (block.type !== 'image') return
    if (!block.alt.trim()) add(`body.${i}.image.alt`, 'Gambar di isi artikel butuh teks alternatif.')
    else if (codePoints(block.alt) > LIMITS.coverAlt) add(`body.${i}.image.alt`, `Teks alternatif maksimal ${LIMITS.coverAlt} karakter.`)
    if (codePoints(block.caption ?? '') > LIMITS.caption) add(`body.${i}.image.caption`, `Keterangan maksimal ${LIMITS.caption} karakter.`)
  })
  return issues
}

export interface CheckItem { field: string; label: string; ok: boolean; message: string; progress?: string }

/** Every publish requirement, satisfied or not, in editor reading order. */
export function publishChecklist(w: Writing): CheckItem[] {
  const title = codePoints(w.title)
  const words = countWords(bodyText(w.body))
  const excerpt = codePoints(w.excerpt)
  const meta = codePoints(w.metaDescription)
  const within = (n: number, [lo, hi]: readonly [number, number]) => n >= lo && n <= hi
  const items: CheckItem[] = [
    { field: 'title', label: 'Judul', ok: within(title, LIMITS.title), message: title < LIMITS.title[0] ? `Judul minimal ${LIMITS.title[0]} karakter.` : `Judul maksimal ${LIMITS.title[1]} karakter.`, progress: `${title}/${LIMITS.title[0]}+` },
    { field: 'slug', label: 'Slug URL', ok: !!w.slug && SLUG_PATTERN.test(w.slug), message: w.slug ? 'Perbaiki format slug.' : 'Slug wajib diisi.' },
    { field: 'categoryDocumentId', label: 'Kategori', ok: !!w.categoryDocumentId, message: 'Pilih kategori.' },
    { field: 'authorDocumentId', label: 'Penulis', ok: !!w.authorDocumentId, message: 'Pilih penulis publik.' },
    { field: 'body', label: 'Isi artikel', ok: words >= LIMITS.bodyWords, message: `Tulis minimal ${LIMITS.bodyWords} kata (kurang ${Math.max(0, LIMITS.bodyWords - words)}).`, progress: `${words}/${LIMITS.bodyWords} kata` },
    { field: 'excerpt', label: 'Ringkasan', ok: within(excerpt, LIMITS.excerpt), message: excerpt < LIMITS.excerpt[0] ? `Ringkasan minimal ${LIMITS.excerpt[0]} karakter (kurang ${LIMITS.excerpt[0] - excerpt}).` : `Ringkasan maksimal ${LIMITS.excerpt[1]} karakter.`, progress: `${excerpt}/${LIMITS.excerpt[0]}+` },
    { field: 'metaDescription', label: 'Deskripsi SEO', ok: within(meta, LIMITS.metaDescription), message: meta < LIMITS.metaDescription[0] ? `Deskripsi SEO minimal ${LIMITS.metaDescription[0]} karakter (kurang ${LIMITS.metaDescription[0] - meta}).` : `Deskripsi SEO maksimal ${LIMITS.metaDescription[1]} karakter.`, progress: `${meta}/${LIMITS.metaDescription[0]}+` },
    { field: 'coverMediaDocumentId', label: 'Gambar sampul', ok: !!w.coverMediaDocumentId, message: 'Pilih gambar sampul.' },
    { field: 'coverAlt', label: 'Teks alternatif sampul', ok: !!w.coverAlt.trim(), message: 'Jelaskan isi gambar sampul untuk pembaca layar.' },
  ]
  if (w.operationalClaims) items.push({ field: 'informationCheckedAt', label: 'Tanggal pemeriksaan', ok: !!w.informationCheckedAt, message: 'Artikel memuat harga/jam buka — isi tanggal Anda memeriksanya.' })
  return items
}

export const fieldId = (path: string) => `field-${path.replace(/\./g, '-')}`

/** Scroll to, focus and briefly highlight the closest rendered control for a field path. */
export function focusField(path: string) {
  const parts = path.split('.')
  if (parts[0] === 'body') {
    // Body paths address top-level editor nodes: jump into that block (e.g. an image's alt input) or the text itself.
    const root = document.querySelector<HTMLElement>('#field-body .ProseMirror')
    const block = parts[1] !== undefined ? root?.children[Number(parts[1])] as HTMLElement | undefined : undefined
    const target = block?.querySelectorAll<HTMLElement>('input')[parts.includes('caption') ? 1 : 0] ?? root
    if (!target) return false
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.focus({ preventScroll: true })
    return true
  }
  for (let n = parts.length; n > 0; n--) {
    const el = document.getElementById(fieldId(parts.slice(0, n).join('.')))
    if (!el) continue
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const target = el.matches('input, textarea, select, button, [contenteditable="true"]') ? el : el.querySelector<HTMLElement>('input, textarea, select, button, [contenteditable="true"]')
    target?.focus({ preventScroll: true })
    const frame = el.closest('.field, .card') ?? el
    frame.classList.remove('flash')
    void (frame as HTMLElement).offsetWidth
    frame.classList.add('flash')
    return true
  }
  return false
}
