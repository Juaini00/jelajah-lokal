import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CircleCheck, FilePlus2, FileText, RefreshCw, Search, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { timeAgo } from '../lib/format'
import { storeArticle, useArticles, useCategories } from '../lib/queries'
import { Link, navigate } from '../lib/router'
import { pickWriting, type Article } from '../lib/types'
import { bodyText, countWords, publishChecklist } from '../lib/validation'
import { EmptyState, ErrorBanner, PageHeader, Skeleton, Spinner } from '../ui/controls'
import { toast, useDebounced } from '../ui/feedback'

type Status = 'all' | 'draft' | 'live' | 'pending'
const statusOf = (a: Article): Exclude<Status, 'all'> => (!a.publishedAt ? 'draft' : a.publishedRevision === a.revision ? 'live' : 'pending')
const statusLabel = { draft: 'Draft', live: 'Terbit', pending: 'Terbit · ada perubahan' } as const
const statusTone = { draft: 'neutral', live: 'success', pending: 'warning' } as const
const filters: { id: Status; label: string }[] = [{ id: 'all', label: 'Semua' }, { id: 'draft', label: 'Draft' }, { id: 'live', label: 'Terbit' }, { id: 'pending', label: 'Belum diterbitkan ulang' }]

export function ArticlesList() {
  const client = useQueryClient()
  const articles = useArticles()
  const categories = useCategories()
  const [status, setStatus] = useState<Status>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'updated' | 'title'>('updated')
  const [creating, setCreating] = useState(false)
  const query = useDebounced(search.trim().toLowerCase(), 150)

  const rows = useMemo(() => (articles.data ?? []).map(article => {
    const checks = publishChecklist(pickWriting(article))
    // Missing summary/SEO on a long-enough draft is exactly what the AI assistant can fill.
    const aiCanHelp = (!checks.find(c => c.field === 'excerpt')?.ok || !checks.find(c => c.field === 'metaDescription')?.ok) && countWords(bodyText(article.body)) >= 100
    return { article, status: statusOf(article), done: checks.filter(c => c.ok).length, total: checks.length, aiCanHelp }
  }), [articles.data])
  const counts = useMemo(() => rows.reduce((acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }), { all: rows.length, draft: 0, live: 0, pending: 0 }), [rows])
  const visible = useMemo(() => rows
    .filter(r => status === 'all' || r.status === status)
    .filter(r => !query || `${r.article.title} ${r.article.slug} ${r.article.tags.join(' ')}`.toLowerCase().includes(query))
    .sort((a, b) => (sort === 'title' ? (a.article.title || '~').localeCompare(b.article.title || '~', 'id') : b.article.updatedAt.localeCompare(a.article.updatedAt))),
  [rows, status, query, sort])
  const categoryName = (id: string | null) => categories.data?.find(c => c.documentId === id)?.name

  async function create() {
    setCreating(true)
    try {
      const { data } = await api.post<{ data: Article }>('/articles', {})
      storeArticle(client, data)
      void navigate(`/articles/${data.documentId}`)
    } catch (error) {
      toast.error('Draft baru gagal dibuat', error instanceof Error ? error.message : undefined)
    } finally { setCreating(false) }
  }

  return <div className="page">
    <PageHeader title="Artikel" description="Tulis, periksa, lalu terbitkan panduan perjalanan."
      actions={<button type="button" className="btn btn-primary" onClick={() => void create()} disabled={creating}>{creating ? <Spinner /> : <FilePlus2 size={16} />}Artikel baru</button>} />

    <div className="toolbar-row">
      <div className="segmented" role="tablist" aria-label="Filter status">
        {filters.map(f => <button key={f.id} type="button" role="tab" aria-selected={status === f.id} onClick={() => setStatus(f.id)}>{f.label}<span className="seg-count">{counts[f.id]}</span></button>)}
      </div>
      <div className="toolbar-right">
        <label className="search-box"><Search size={16} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari judul, slug, tag…" aria-label="Cari artikel" /></label>
        <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Urutkan">
          <option value="updated">Terakhir diubah</option>
          <option value="title">Judul A–Z</option>
        </select>
        <button type="button" className="icon-button" aria-label="Muat ulang" title="Muat ulang" onClick={() => void articles.refetch()} disabled={articles.isFetching}>{articles.isFetching ? <Spinner /> : <RefreshCw size={16} />}</button>
      </div>
    </div>

    <ErrorBanner error={articles.error} onRetry={() => void articles.refetch()} />
    {articles.isPending ? <Skeleton rows={6} /> : !rows.length ? <EmptyState icon={<FileText size={28} />} title="Belum ada artikel" action={<button type="button" className="btn btn-primary" onClick={() => void create()} disabled={creating}><FilePlus2 size={16} />Tulis artikel pertama</button>}>Draft boleh belum lengkap — simpan kapan saja, terbitkan saat siap.</EmptyState>
      : !visible.length ? <EmptyState icon={<Search size={28} />} title="Tidak ada artikel yang cocok" action={<button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setStatus('all') }}>Reset filter</button>} />
      : <div className="table-card">
        <table className="data-table">
          <thead><tr><th>Judul</th><th>Status</th><th className="hide-md">Kategori</th><th className="hide-sm">Kesiapan</th><th>Diubah</th></tr></thead>
          <tbody>
            {visible.map(({ article, status: s, done, total, aiCanHelp }) => <tr key={article.documentId}>
              <td className="cell-title">
                <Link to={`/articles/${article.documentId}`} className="row-link">{article.title || <em>Draft tanpa judul</em>}</Link>
                <small>/panduan/{article.slug || '—'}</small>
              </td>
              <td><span className={`badge badge-${statusTone[s]}`}>{statusLabel[s]}</span></td>
              <td className="hide-md">{categoryName(article.categoryDocumentId) ?? <span className="muted">—</span>}</td>
              <td className="hide-sm">{done === total ? <span className="ready-chip"><CircleCheck size={14} />Siap</span> : <span className="mini-progress" title={`${done} dari ${total} syarat terbit terpenuhi`}><span style={{ width: `${(done / total) * 100}%` }} /><em>{done}/{total}</em></span>}{aiCanHelp && <span className="ai-hint" title="Ringkasan & deskripsi SEO bisa diusulkan Asisten AI"><Sparkles size={14} /></span>}</td>
              <td title={new Date(article.updatedAt).toLocaleString('id-ID')}>{timeAgo(article.updatedAt)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
  </div>
}
