import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, FileText, RefreshCw, RotateCcw, Search, Sparkles } from 'lucide-react'
import { api, isApiError } from '../lib/api'
import { formatDate, timeAgo } from '../lib/format'
import { keys, useEditorialDrafts, useUsage } from '../lib/queries'
import { Link, navigate, useLocation } from '../lib/router'
import type { Applied, Article, Generated, MetadataField } from '../lib/types'
import { LIMITS, bodyText, codePoints, countWords, tagIssue } from '../lib/validation'
import { EmptyState, ErrorBanner, PageHeader, Skeleton, Spinner, TagInput } from '../ui/controls'
import { toast, useDebounced } from '../ui/feedback'

const fieldLabel: Record<MetadataField, string> = { excerpt: 'Ringkasan', metaDescription: 'Deskripsi SEO', tags: 'Tag' }
const AI_MIN_WORDS = 100

export function Assistant() {
  const { search: params } = useLocation()
  const drafts = useEditorialDrafts()
  const usage = useUsage()
  const selectedId = params.get('article')
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim().toLowerCase(), 150)
  const draft = drafts.data?.find(d => d.documentId === selectedId) ?? null
  const visible = useMemo(() => (drafts.data ?? []).filter(d => !query || (d.title || 'draft tanpa judul').toLowerCase().includes(query)), [drafts.data, query])
  const quota = usage.data

  return <div className="page">
    <PageHeader title="Editorial Assistant" description="Gemini mengusulkan ringkasan, deskripsi SEO, dan tag dari draft tersimpan. Anda yang memutuskan apa yang diterapkan — tidak ada publikasi otomatis."
      actions={quota && <div className="quota" title={`Reset ${formatDate(quota.resetsAt)}`}>
        <div className="quota-text"><strong>{quota.remaining}</strong> dari {quota.limit} proses tersisa hari ini</div>
        <div className="progress small"><span style={{ width: `${quota.limit ? (quota.used / quota.limit) * 100 : 0}%` }} /></div>
        <small>{!quota.enabled ? 'AI nonaktif' : quota.busy ? 'Ada proses aktif' : `Reset ${timeAgo(quota.resetsAt)}`}</small>
      </div>} />
    <ErrorBanner error={usage.error} onRetry={() => void usage.refetch()} />

    <div className="split">
      <section className="card list-pane">
        <header className="card-header">
          <h2>Draft tersimpan</h2>
          <button type="button" className="icon-button" aria-label="Muat ulang draft" onClick={() => void drafts.refetch()} disabled={drafts.isFetching}>{drafts.isFetching ? <Spinner /> : <RefreshCw size={16} />}</button>
        </header>
        <label className="search-box"><Search size={16} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari judul…" aria-label="Cari draft" /></label>
        <ErrorBanner error={drafts.error} onRetry={() => void drafts.refetch()} />
        {drafts.isPending ? <Skeleton rows={5} height={56} /> : !visible.length ? <p className="muted">Tidak ada draft yang cocok.</p> :
          <ul className="pick-list">
            {visible.map(d => <li key={d.documentId}>
              <button type="button" className={d.documentId === selectedId ? 'selected' : ''} aria-current={d.documentId === selectedId} onClick={() => void navigate(`/assistant?article=${d.documentId}`, { replace: true })}>
                <strong>{d.title || 'Draft tanpa judul'}</strong>
                <small>{countWords(bodyText(d.body))} kata · {timeAgo(d.updatedAt)}</small>
              </button>
            </li>)}
          </ul>}
      </section>
      {/* Keyed by draft: switching drafts starts a fresh request with a new idempotency key. */}
      <WorkPane key={selectedId ?? 'none'} draft={draft} loading={!!selectedId && drafts.isPending} onReload={() => void drafts.refetch()} />
    </div>
  </div>
}

function WorkPane({ draft, loading, onReload }: { draft: Article | null; loading: boolean; onReload: () => void }) {
  const client = useQueryClient()
  const usage = useUsage()
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<unknown>(null)
  const [result, setResult] = useState<Generated | null>(null)
  const [values, setValues] = useState({ excerpt: '', metaDescription: '', tags: [] as string[] })
  const [selected, setSelected] = useState<Record<MetadataField, boolean>>({ excerpt: true, metaDescription: true, tags: true })
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<unknown>(null)
  const [applied, setApplied] = useState<Applied | null>(null)
  const idempotencyKey = useRef(crypto.randomUUID())
  const words = draft ? countWords(bodyText(draft.body)) : 0

  function reset() {
    setResult(null); setGenerateError(null); setApplyError(null); setApplied(null)
    idempotencyKey.current = crypto.randomUUID()
  }

  async function generate() {
    if (!draft) return
    setGenerating(true); setGenerateError(null); setApplied(null); setApplyError(null)
    try {
      const generated = await api.post<Generated>('/editorial/generate', { articleDocumentId: draft.documentId, idempotencyKey: idempotencyKey.current })
      setResult(generated)
      setValues({ excerpt: generated.result.excerpt, metaDescription: generated.result.metaDescription, tags: generated.result.suggestedTags })
      setSelected({ excerpt: true, metaDescription: true, tags: true })
    } catch (error) { setGenerateError(error) } finally {
      setGenerating(false)
      void client.invalidateQueries({ queryKey: keys.usage })
    }
  }

  const fieldError: Record<MetadataField, string> = {
    excerpt: codePoints(values.excerpt) < LIMITS.excerpt[0] || codePoints(values.excerpt) > LIMITS.excerpt[1] ? `Harus ${LIMITS.excerpt[0]}–${LIMITS.excerpt[1]} karakter.` : '',
    metaDescription: codePoints(values.metaDescription) < LIMITS.metaDescription[0] || codePoints(values.metaDescription) > LIMITS.metaDescription[1] ? `Harus ${LIMITS.metaDescription[0]}–${LIMITS.metaDescription[1]} karakter.` : '',
    tags: tagIssue(values.tags),
  }
  const chosen = (Object.keys(selected) as MetadataField[]).filter(f => selected[f])
  const blocked = chosen.some(f => fieldError[f])

  async function apply() {
    if (!result || !chosen.length || blocked) return
    setApplying(true); setApplyError(null)
    try {
      const body = { requestId: result.requestId, selectedFields: chosen, values: Object.fromEntries(chosen.map(f => [f, values[f]])) }
      const response = await api.post<Applied>('/editorial/apply', body)
      setApplied(response)
      void client.invalidateQueries({ queryKey: keys.article(response.articleDocumentId) })
      void client.invalidateQueries({ queryKey: keys.articles, exact: true })
      void client.invalidateQueries({ queryKey: keys.editorialDrafts })
      toast.success('Metadata diterapkan ke draft', `Draft r${response.draftRevision}. Terbitkan dari halaman editor.`)
    } catch (error) { setApplyError(error) } finally { setApplying(false) }
  }

  const quota = usage.data
  const busy = quota?.busy || isApiError(generateError, 'AI_BUSY')
  const disabledReason = !quota ? '' : !quota.enabled ? 'Bantuan AI sedang dinonaktifkan.' : quota.remaining <= 0 ? 'Kuota hari ini habis.' : busy ? 'Menunggu proses AI lain selesai…' : words < AI_MIN_WORDS ? `Draft tersimpan baru ${words} kata; butuh minimal ${AI_MIN_WORDS}.` : ''

  return <section className="card work-pane" aria-busy={generating || applying}>
    {!draft ? <EmptyState icon={<Sparkles size={28} />} title={loading ? 'Memuat draft…' : 'Pilih draft'}>Pilih draft di kiri. Assistant membaca versi yang sudah disimpan, bukan isian yang belum disimpan di editor.</EmptyState> : <>
      <header className="card-header">
        <div><h2>{draft.title || 'Draft tanpa judul'}</h2><p>r{draft.revision} · disimpan {timeAgo(draft.updatedAt)} · {words} kata</p></div>
        <Link to={`/articles/${draft.documentId}`} className="btn btn-sm btn-ghost"><FileText size={14} />Buka di editor<ArrowUpRight size={14} /></Link>
      </header>

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => void generate()} disabled={generating || !!disabledReason}>
          {generating ? <><Spinner />Gemini sedang menulis…</> : <><Sparkles size={16} />{result ? 'Buat usulan baru' : 'Buat usulan metadata'}</>}
        </button>
        {result && !generating && <button type="button" className="btn btn-ghost" onClick={reset}><RotateCcw size={14} />Mulai ulang</button>}
        {disabledReason && <span className="muted">{disabledReason}</span>}
      </div>
      <ErrorBanner error={generateError} onDismiss={() => setGenerateError(null)} />

      {result && <div className="suggestions">
        <p className="muted">{result.cacheHit ? 'Diambil dari hasil tervalidasi sebelumnya — tidak memakai kuota baru.' : 'Usulan baru dari Gemini.'} Edit sesuai kebutuhan, centang yang ingin diterapkan.</p>
        {(['excerpt', 'metaDescription'] as const).map(field => {
          const [min, max] = LIMITS[field]
          const length = codePoints(values[field])
          return <div key={field} className={`suggestion ${selected[field] ? '' : 'off'}`}>
            <label className="check-row"><input type="checkbox" checked={selected[field]} onChange={e => setSelected(s => ({ ...s, [field]: e.target.checked }))} /><strong>{fieldLabel[field]}</strong><span className={`counter ${length > max ? 'over' : length < min ? 'under' : 'ok'}`}>{length} / {min}–{max}</span></label>
            <textarea rows={field === 'excerpt' ? 4 : 3} value={values[field]} disabled={!selected[field]} onChange={e => setValues(v => ({ ...v, [field]: e.target.value }))} aria-label={fieldLabel[field]} />
            {selected[field] && fieldError[field] && <p className="field-error">{fieldError[field]}</p>}
            <details><summary>Nilai saat ini</summary><p>{draft[field] || <em>kosong</em>}</p></details>
          </div>
        })}
        <div className={`suggestion ${selected.tags ? '' : 'off'}`}>
          <label className="check-row"><input type="checkbox" checked={selected.tags} onChange={e => setSelected(s => ({ ...s, tags: e.target.checked }))} /><strong>Tag</strong><span className="counter">{values.tags.length} / {LIMITS.tags}</span></label>
          {selected.tags ? <TagInput id="assistant-tags" value={values.tags} onChange={tags => setValues(v => ({ ...v, tags }))} max={LIMITS.tags} invalid={!!fieldError.tags} /> : <p className="muted">{values.tags.join(', ')}</p>}
          {selected.tags && fieldError.tags && <p className="field-error">{fieldError.tags}</p>}
          <details><summary>Nilai saat ini</summary><p>{draft.tags.length ? draft.tags.join(', ') : <em>kosong</em>}</p></details>
        </div>
        <ErrorBanner error={isApiError(applyError, 'ARTICLE_CHANGED') ? null : applyError} onDismiss={() => setApplyError(null)} />
        {isApiError(applyError, 'ARTICLE_CHANGED') && <div className="banner banner-warning" role="alert">
          <RotateCcw size={20} />
          <div className="banner-content"><strong>Draft berubah setelah usulan dibuat.</strong><p>Tidak ada yang ditimpa. Muat ulang draft lalu buat usulan baru agar sesuai isi terbaru.</p></div>
          <div className="banner-actions"><button type="button" className="btn btn-sm btn-primary" onClick={() => { onReload(); reset() }}>Muat ulang</button></div>
        </div>}
        <div className="row-end">
          {applied?.requestId === result.requestId
            ? <><span className="ready-chip"><Check size={14} />Diterapkan ke draft r{applied.draftRevision}</span><Link to={`/articles/${draft.documentId}`} className="btn btn-primary">Tinjau & terbitkan<ArrowUpRight size={16} /></Link></>
            : <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={applying || !chosen.length || blocked}>{applying ? <><Spinner />Menerapkan…</> : <><Check size={16} />Terapkan {chosen.length ? chosen.map(f => fieldLabel[f].toLowerCase()).join(', ') : ''}</>}</button>}
        </div>
      </div>}
    </>}
  </section>
}
