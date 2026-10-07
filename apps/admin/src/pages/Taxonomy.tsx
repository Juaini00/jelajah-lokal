import { useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Pencil, RefreshCw, Search, Tags, Trash2, UserPlus, UserRound, Wand2 } from 'lucide-react'
import { api, describeError, isApiError, type FieldIssue } from '../lib/api'
import { thumb } from '../lib/format'
import { keys, removeFrom, upsertIn, useArticles, useAuthors, useCategories, useMedia } from '../lib/queries'
import { useLeaveGuard } from '../lib/router'
import type { Author, Category } from '../lib/types'
import { SLUG_PATTERN, codePoints, fieldId, focusField, slugify, unsafeText } from '../lib/validation'
import { EmptyState, ErrorBanner, Field, PageHeader, Skeleton, Spinner } from '../ui/controls'
import { confirm, Dialog, toast, useDebounced } from '../ui/feedback'
import { MediaField } from '../ui/media'

type Kind = 'categories' | 'authors'
type Entity = Category | Author
interface Form { name: string; slug: string; text: string; order: string; avatar: string | null }

const config = {
  categories: { title: 'Kategori', singular: 'kategori', description: 'Kelompokkan panduan agar mudah dijelajahi pembaca.', nameMax: 50, textKey: 'description', textLabel: 'Deskripsi', textMax: 240, addIcon: FolderPlus, icon: Tags, relation: 'categoryDocumentId' },
  authors: { title: 'Penulis', singular: 'penulis', description: 'Profil penulis publik — terpisah dari akun admin.', nameMax: 80, textKey: 'bio', textLabel: 'Bio', textMax: 300, addIcon: UserPlus, icon: UserRound, relation: 'authorDocumentId' },
} as const

const toForm = (item: Entity | null): Form => ({
  name: item?.name ?? '', slug: item?.slug ?? '',
  text: item ? ('description' in item ? item.description : item.bio) : '',
  order: item && 'order' in item ? String(item.order) : '0',
  avatar: item && 'avatarMediaDocumentId' in item ? item.avatarMediaDocumentId : null,
})

function validate(kind: Kind, form: Form): FieldIssue[] {
  const c = config[kind]
  const issues: FieldIssue[] = []
  const name = codePoints(form.name.trim())
  if (name < 2) issues.push({ field: 'name', message: 'Nama minimal 2 karakter.' })
  else if (name > c.nameMax) issues.push({ field: 'name', message: `Nama maksimal ${c.nameMax} karakter.` })
  else if (unsafeText(form.name)) issues.push({ field: 'name', message: 'Nama tidak boleh berisi tag HTML atau skrip.' })
  if (!form.slug) issues.push({ field: 'slug', message: 'Slug wajib diisi.' })
  else if (!SLUG_PATTERN.test(form.slug)) issues.push({ field: 'slug', message: 'Gunakan huruf kecil, angka, dan tanda hubung.' })
  if (codePoints(form.text) > c.textMax) issues.push({ field: c.textKey, message: `Maksimal ${c.textMax} karakter.` })
  else if (unsafeText(form.text)) issues.push({ field: c.textKey, message: 'Teks tidak boleh berisi tag HTML atau skrip.' })
  if (kind === 'categories' && !/^-?\d+$/.test(form.order.trim())) issues.push({ field: 'order', message: 'Masukkan bilangan bulat.' })
  else if (kind === 'categories' && Math.abs(Number(form.order)) > 10000) issues.push({ field: 'order', message: 'Antara -10.000 dan 10.000.' })
  return issues
}

export function Taxonomy({ kind }: { kind: Kind }) {
  const c = config[kind]
  const client = useQueryClient()
  const categories = useCategories()
  const authors = useAuthors()
  const list = kind === 'categories' ? categories : authors
  const articles = useArticles()
  const media = useMedia()
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim().toLowerCase(), 150)
  const [editing, setEditing] = useState<Entity | 'new' | null>(null)

  const usage = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const article of articles.data ?? []) {
      const ref = article[c.relation]
      if (ref) counts[ref] = (counts[ref] ?? 0) + 1
    }
    return counts
  }, [articles.data, c.relation])

  const items = useMemo(() => {
    const all = [...(list.data ?? [])] as Entity[]
    all.sort((a, b) => ('order' in a && 'order' in b ? a.order - b.order : 0) || a.name.localeCompare(b.name, 'id'))
    return all.filter(item => !query || `${item.name} ${item.slug}`.toLowerCase().includes(query))
  }, [list.data, query])

  async function remove(item: Entity) {
    const used = usage[item.documentId] ?? 0
    if (!await confirm({
      title: `Hapus ${c.singular} "${item.name}"?`,
      message: used ? `${c.title} ini masih dipakai ${used} artikel. Ganti ${c.singular} di artikel tersebut terlebih dahulu — server akan menolak penghapusan.` : 'Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Hapus', tone: 'danger',
    })) return
    try {
      await api.delete(`/${kind}/${item.documentId}`)
      removeFrom(client, keys[kind], item.documentId)
      toast.success(`${c.title} dihapus`)
    } catch (error) {
      toast.error(isApiError(error, 'RELATION_REFERENCED') ? `${c.title} masih dipakai artikel` : 'Gagal menghapus', isApiError(error, 'RELATION_REFERENCED') ? `Ganti ${c.singular} pada artikel terkait (termasuk versi terbit), lalu coba lagi.` : describeError(error).title)
    }
  }

  const AddIcon = c.addIcon
  const Icon = c.icon
  return <div className="page">
    <PageHeader title={c.title} description={c.description}
      actions={<button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><AddIcon size={16} />Tambah {c.singular}</button>} />
    <div className="toolbar-row">
      <label className="search-box grow"><Search size={16} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={`Cari ${c.singular}…`} aria-label={`Cari ${c.singular}`} /></label>
      <button type="button" className="icon-button" aria-label="Muat ulang" title="Muat ulang" onClick={() => void list.refetch()} disabled={list.isFetching}>{list.isFetching ? <Spinner /> : <RefreshCw size={16} />}</button>
    </div>
    <ErrorBanner error={list.error} onRetry={() => void list.refetch()} />
    {list.isPending ? <Skeleton rows={4} /> : !list.data?.length ? <EmptyState icon={<Icon size={28} />} title={`Belum ada ${c.singular}`} action={<button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><AddIcon size={16} />Tambah {c.singular}</button>}>{kind === 'categories' ? 'Setiap artikel butuh satu kategori sebelum terbit.' : 'Setiap artikel butuh penulis publik sebelum terbit.'}</EmptyState>
      : !items.length ? <EmptyState icon={<Search size={28} />} title="Tidak ada yang cocok" />
      : <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Nama</th><th className="hide-sm">{c.textLabel}</th>{kind === 'categories' && <th className="num">Urutan</th>}<th className="num">Artikel</th><th className="actions-col"><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            {items.map(item => {
              const avatar = 'avatarMediaDocumentId' in item ? media.data?.find(m => m.documentId === item.avatarMediaDocumentId) : undefined
              const text = 'description' in item ? item.description : item.bio
              return <tr key={item.documentId}>
                <td className="cell-title">
                  <div className="cell-with-avatar">
                    {kind === 'authors' && (avatar ? <img className="avatar" src={thumb(avatar.url, 64, 64)} alt="" /> : <span className="avatar avatar-fallback">{item.name.slice(0, 1).toUpperCase()}</span>)}
                    <div><button type="button" className="row-link as-button" onClick={() => setEditing(item)}>{item.name}</button><small>/{item.slug}</small></div>
                  </div>
                </td>
                <td className="hide-sm clamp">{text || <span className="muted">—</span>}</td>
                {'order' in item && <td className="num">{item.order}</td>}
                <td className="num">{usage[item.documentId] ?? 0}</td>
                <td className="actions-col">
                  <button type="button" className="icon-button" aria-label={`Ubah ${item.name}`} onClick={() => setEditing(item)}><Pencil size={16} /></button>
                  <button type="button" className="icon-button danger" aria-label={`Hapus ${item.name}`} onClick={() => void remove(item)}><Trash2 size={16} /></button>
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>}
    {editing && <EntitySheet key={editing === 'new' ? 'new' : editing.documentId} kind={kind} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={saved => { upsertIn(client, keys[kind], saved); setEditing(null) }} />}
  </div>
}

function EntitySheet({ kind, item, onClose, onSaved }: { kind: Kind; item: Entity | null; onClose: () => void; onSaved: (item: Entity) => void }) {
  const c = config[kind]
  const initial = useMemo(() => toForm(item), [item])
  const [form, setForm] = useState(initial)
  const [autoSlug, setAutoSlug] = useState(!item)
  const [attempted, setAttempted] = useState(false)
  const [serverIssues, setServerIssues] = useState<FieldIssue[]>([])
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  useLeaveGuard(dirty)
  const issues = validate(kind, form)
  const errorFor = (field: string) => serverIssues.find(i => i.field === field)?.message ?? (attempted || (field !== 'name' && field !== 'slug') ? issues.find(i => i.field === field)?.message : undefined)

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm(current => ({ ...current, [key]: value, ...(key === 'name' && autoSlug ? { slug: slugify(String(value)) } : {}) }))
    setServerIssues(current => current.filter(i => i.field !== (key === 'text' ? c.textKey : key === 'avatar' ? 'avatarMediaDocumentId' : key)))
  }

  async function close() {
    if (dirty && !await confirm({ title: 'Buang perubahan?', message: 'Isian di formulir ini belum disimpan.', confirmLabel: 'Buang', tone: 'danger' })) return
    onClose()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (issues.length) { focusField(issues[0].field); return }
    const body = kind === 'categories'
      ? { name: form.name.trim(), slug: form.slug, description: form.text.trim(), order: Number(form.order) }
      : { name: form.name.trim(), slug: form.slug, bio: form.text.trim(), avatarMediaDocumentId: form.avatar }
    setSaving(true); setError(null)
    try {
      const { data } = item ? await api.patch<{ data: Entity }>(`/${kind}/${item.documentId}`, body) : await api.post<{ data: Entity }>(`/${kind}`, body)
      toast.success(item ? `${c.title} diperbarui` : `${c.title} ditambahkan`, 'Artikel yang sudah terbit tetap memakai data saat diterbitkan.')
      onSaved(data)
    } catch (failure) {
      setError(failure)
      if (isApiError(failure) && failure.fields.length) { setServerIssues(failure.fields); focusField(failure.fields[0].field) }
    } finally { setSaving(false) }
  }

  return <Dialog open onClose={() => void close()} variant="sheet" busy={saving} title={item ? `Ubah ${c.singular}` : `Tambah ${c.singular}`}
    footer={<>
      <button type="button" className="btn btn-ghost" onClick={() => void close()} disabled={saving}>Batal</button>
      <button type="submit" form="entity-form" className="btn btn-primary" disabled={saving || (!!item && !dirty)}>{saving ? <><Spinner />Menyimpan…</> : 'Simpan'}</button>
    </>}>
    <form id="entity-form" className="stack" onSubmit={e => void submit(e)} noValidate>
      <ErrorBanner error={isApiError(error) && error.fields.length ? null : error} onDismiss={() => setError(null)} />
      <Field path="name" label="Nama" error={errorFor('name')} counter={{ value: form.name, min: 2, max: c.nameMax }}>
        <input id={fieldId('name')} value={form.name} autoFocus onChange={e => set('name', e.target.value)} aria-invalid={!!errorFor('name')} />
      </Field>
      <Field path="slug" label="Slug" error={errorFor('slug')} hint={`Dipakai di URL. Huruf kecil, angka, dan tanda hubung.`}>
        <div className="input-group">
          <input id={fieldId('slug')} value={form.slug} onChange={e => { setAutoSlug(false); set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-')) }} aria-invalid={!!errorFor('slug')} />
          <button type="button" className={`btn btn-sm ${autoSlug ? 'btn-soft' : 'btn-ghost'}`} onClick={() => { setAutoSlug(true); set('slug', slugify(form.name)) }}><Wand2 size={14} />Dari nama</button>
        </div>
      </Field>
      <Field path={c.textKey} label={c.textLabel} error={errorFor(c.textKey)} counter={{ value: form.text, max: c.textMax }}>
        <textarea id={fieldId(c.textKey)} rows={4} value={form.text} onChange={e => set('text', e.target.value)} />
      </Field>
      {kind === 'categories' && <Field path="order" label="Urutan tampil" error={errorFor('order')} hint="Angka lebih kecil tampil lebih dulu.">
        <input id={fieldId('order')} type="number" inputMode="numeric" step={1} value={form.order} onChange={e => set('order', e.target.value)} />
      </Field>}
      {kind === 'authors' && <Field path="avatarMediaDocumentId" label="Foto profil" error={errorFor('avatarMediaDocumentId')}>
        <MediaField id={fieldId('avatarMediaDocumentId')} mediaId={form.avatar} onChange={m => set('avatar', m?.documentId ?? null)} emptyLabel="Pilih foto profil" />
      </Field>}
    </form>
  </Dialog>
}
