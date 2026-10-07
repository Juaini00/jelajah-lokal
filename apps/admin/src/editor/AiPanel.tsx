import { useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ClipboardCheck, Lightbulb, LocateFixed, RotateCcw, ShieldAlert, Sparkles, X } from 'lucide-react'
import { api, isApiError } from '../lib/api'
import { formatDate, timeAgo } from '../lib/format'
import { keys, useUsage } from '../lib/queries'
import type { Applied, Article, Generated, MetadataField, Review, Writing } from '../lib/types'
import { LIMITS, bodyText, codePoints, countWords, tagIssue } from '../lib/validation'
import { ErrorBanner, Spinner, TagInput } from '../ui/controls'
import { toast } from '../ui/feedback'

export interface AiControls { suggest: () => void }

const AI_MIN_WORDS = 100
const fieldLabel: Record<MetadataField, string> = { excerpt: 'Ringkasan', metaDescription: 'Deskripsi SEO', tags: 'Tag' }
const kindLabel: Record<string, string> = { harga: 'Harga', jadwal: 'Jadwal', kontak: 'Kontak', lokasi: 'Akses/lokasi', lainnya: 'Klaim' }
const operationalKinds = new Set(['harga', 'jadwal', 'kontak'])

type Busy = null | 'suggest' | 'review' | 'apply'
interface Suggestion { response: Generated; revision: number; values: { excerpt: string; metaDescription: string; tags: string[] }; selected: Record<MetadataField, boolean> }

/**
 * Inline Gemini assistance for the open article. Both actions read the *saved* draft (saving first when needed);
 * metadata suggestions are applied only on explicit confirmation, the claim review never changes the article.
 */
export function AiPanel({ controls, article, draft, dirty, ensureSaved, onApplied, onInsert, onHighlight, onMarkOperational }: {
  controls: Ref<AiControls>
  article: Article
  draft: Writing
  dirty: boolean
  ensureSaved: () => Promise<Article | null>
  onApplied: (article: Article) => void
  onInsert: (values: Partial<Pick<Writing, MetadataField>>) => void
  onHighlight: (quote: string) => boolean
  onMarkOperational: () => void
}) {
  const client = useQueryClient()
  const usage = useUsage()
  const root = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<unknown>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [review, setReview] = useState<{ response: Review; revision: number } | null>(null)
  // Reuse a key only to replay after a network failure; any other outcome starts a fresh request.
  const pendingKey = useRef<Record<'suggest' | 'review', string | null>>({ suggest: null, review: null })

  const words = countWords(bodyText(draft.body))
  const quota = usage.data
  const blocker = !quota ? '' : !quota.enabled ? 'Bantuan AI sedang nonaktif.' : quota.remaining <= 0 ? `Kuota hari ini habis · reset ${timeAgo(quota.resetsAt)}.` : quota.busy ? 'Menunggu proses AI lain selesai…' : words < AI_MIN_WORDS ? `Butuh minimal ${AI_MIN_WORDS} kata (saat ini ${words}).` : ''

  async function call<T>(kind: 'suggest' | 'review'): Promise<{ data: T; revision: number } | null> {
    setError(null)
    const saved = await ensureSaved()
    if (!saved) return null
    setBusy(kind)
    const key = pendingKey.current[kind] ?? crypto.randomUUID()
    pendingKey.current[kind] = key
    try {
      const data = await api.post<T>(kind === 'suggest' ? '/editorial/generate' : '/editorial/review', { articleDocumentId: saved.documentId, idempotencyKey: key })
      pendingKey.current[kind] = null
      return { data, revision: saved.revision }
    } catch (failure) {
      if (!isApiError(failure, 'NETWORK_ERROR')) pendingKey.current[kind] = null
      setError(failure)
      return null
    } finally {
      setBusy(null)
      void client.invalidateQueries({ queryKey: keys.usage })
    }
  }

  async function suggest() {
    root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const result = await call<Generated>('suggest')
    if (!result) return
    const { excerpt, metaDescription, suggestedTags } = result.data.result
    // Pre-select only fields that are empty or differ, so existing hand-written metadata isn't replaced by default.
    setSuggestion({
      response: result.data, revision: result.revision,
      values: { excerpt, metaDescription, tags: suggestedTags },
      selected: { excerpt: !draft.excerpt || draft.excerpt !== excerpt, metaDescription: !draft.metaDescription || draft.metaDescription !== metaDescription, tags: !draft.tags.length },
    })
  }

  async function runReview() {
    const result = await call<Review>('review')
    if (result) setReview({ response: result.data, revision: result.revision })
  }

  useImperativeHandle(controls, () => ({ suggest: () => void suggest() }))

  const chosen = suggestion ? (Object.keys(suggestion.selected) as MetadataField[]).filter(f => suggestion.selected[f]) : []
  const fieldError = (field: MetadataField, s: Suggestion) => {
    if (field === 'tags') return tagIssue(s.values.tags)
    const [min, max] = LIMITS[field]
    const n = codePoints(s.values[field])
    return n < min || n > max ? `Harus ${min}–${max} karakter (saat ini ${n}).` : ''
  }
  const invalid = suggestion ? chosen.some(f => fieldError(f, suggestion)) : false
  const suggestionStale = !!suggestion && suggestion.revision !== article.revision

  async function apply() {
    if (!suggestion || !chosen.length || invalid) return
    const values = Object.fromEntries(chosen.map(f => [f, suggestion.values[f]])) as Partial<Pick<Writing, MetadataField>>
    // With unsaved edits (or a newer revision) a server apply would be rejected; put the values into the form instead.
    if (dirty || suggestionStale) {
      onInsert(values)
      setSuggestion(null)
      toast.info('Usulan dimasukkan ke formulir', 'Simpan draft untuk menyimpannya.')
      return
    }
    setBusy('apply'); setError(null)
    try {
      const applied = await api.post<Applied>('/editorial/apply', { requestId: suggestion.response.requestId, selectedFields: chosen, values })
      const { data } = await api.get<{ data: Article }>(`/articles/${applied.articleDocumentId}`)
      onApplied(data)
      setSuggestion(null)
      toast.success(`${chosen.map(f => fieldLabel[f]).join(', ')} diterapkan`, `Tersimpan sebagai draft r${applied.draftRevision}. Belum diterbitkan.`)
    } catch (failure) { setError(failure) } finally { setBusy(null) }
  }

  const claims = review?.response.result.claims ?? []
  const needsOperationalFlag = claims.some(c => operationalKinds.has(c.kind)) && !draft.operationalClaims

  return <section ref={root} id="ai-panel" className="card ai-panel" aria-busy={busy !== null}>
    <header className="card-header">
      <h2><Sparkles size={16} className="ai-icon" />Asisten AI</h2>
      {quota && <span className="ai-quota" title={`Reset ${formatDate(quota.resetsAt)}`}>{quota.remaining}/{quota.limit} tersisa</span>}
    </header>
    <p className="muted small">Gemini membaca draft tersimpan. Anda yang memutuskan apa yang dipakai — tidak ada yang terbit otomatis.</p>

    <div className="ai-actions">
      <button type="button" className="ai-action" onClick={() => void suggest()} disabled={busy !== null || !!blocker}>
        {busy === 'suggest' ? <Spinner /> : <Sparkles size={16} />}
        <span><b>{busy === 'suggest' ? 'Gemini sedang menulis…' : 'Usulkan ringkasan, SEO & tag'}</b><small>{dirty ? 'Menyimpan draft dulu' : '1 proses kuota'}</small></span>
      </button>
      <button type="button" className="ai-action" onClick={() => void runReview()} disabled={busy !== null || !!blocker}>
        {busy === 'review' ? <Spinner /> : <ClipboardCheck size={16} />}
        <span><b>{busy === 'review' ? 'Memeriksa artikel…' : 'Periksa klaim & kelengkapan'}</b><small>Harga, jadwal, akses yang perlu diverifikasi</small></span>
      </button>
    </div>
    {blocker && <p className="field-hint">{blocker}</p>}
    <ErrorBanner error={error} onDismiss={() => setError(null)} />

    {suggestion && <div className="ai-result">
      <div className="ai-result-head">
        <strong>Usulan metadata</strong>
        <span className="muted small">{suggestion.response.cacheHit ? 'dari cache · tanpa kuota' : `r${suggestion.revision}`}</span>
        <button type="button" className="icon-button" aria-label="Tutup usulan" onClick={() => setSuggestion(null)}><X size={14} /></button>
      </div>
      {(['excerpt', 'metaDescription', 'tags'] as const).map(field => {
        const error = suggestion.selected[field] ? fieldError(field, suggestion) : ''
        const current = field === 'tags' ? draft.tags.join(', ') : draft[field]
        const set = (patch: Partial<Suggestion['values']>) => setSuggestion(s => s && { ...s, values: { ...s.values, ...patch } })
        return <div key={field} className={`ai-field ${suggestion.selected[field] ? '' : 'off'}`}>
          <label className="check-row">
            <input type="checkbox" checked={suggestion.selected[field]} onChange={e => setSuggestion(s => s && { ...s, selected: { ...s.selected, [field]: e.target.checked } })} />
            <b>{fieldLabel[field]}</b>
            {field !== 'tags' && <span className={`counter ${error ? 'over' : 'ok'}`}>{codePoints(suggestion.values[field])}</span>}
          </label>
          {field === 'tags'
            ? <TagInput id="ai-tags" value={suggestion.values.tags} onChange={tags => set({ tags })} max={LIMITS.tags} invalid={!!error} />
            : <textarea rows={field === 'excerpt' ? 4 : 3} value={suggestion.values[field]} onChange={e => set({ [field]: e.target.value })} aria-label={`Usulan ${fieldLabel[field]}`} />}
          {error && <p className="field-error">{error}</p>}
          <small className="ai-current">Saat ini: {current ? <span>{current}</span> : <em>kosong</em>}</small>
        </div>
      })}
      {suggestionStale && !dirty && <p className="field-hint">Draft berubah sejak usulan dibuat — usulan akan dimasukkan ke formulir, bukan langsung disimpan.</p>}
      <button type="button" className="btn btn-primary btn-block" onClick={() => void apply()} disabled={busy !== null || !chosen.length || invalid}>
        {busy === 'apply' ? <><Spinner />Menerapkan…</> : <><Check size={16} />{dirty || suggestionStale ? 'Masukkan ke formulir' : 'Terapkan ke draft'}{chosen.length ? ` (${chosen.length})` : ''}</>}
      </button>
    </div>}

    {review && <div className="ai-result">
      <div className="ai-result-head">
        <strong>Hasil pemeriksaan</strong>
        <span className="muted small">{review.revision !== article.revision ? 'draft sudah berubah' : review.response.cacheHit ? 'dari cache' : `r${review.revision}`}</span>
        <button type="button" className="icon-button" aria-label="Tutup hasil pemeriksaan" onClick={() => setReview(null)}><X size={14} /></button>
      </div>
      <p className="ai-summary">{review.response.result.summary}</p>
      {needsOperationalFlag && <div className="ai-callout">
        <ShieldAlert size={16} />
        <span>Ada klaim harga/jadwal/kontak. Tandai artikel sebagai memuat info operasional agar tanggal pemeriksaan wajib diisi.</span>
        <button type="button" className="btn btn-sm btn-soft" onClick={onMarkOperational}>Tandai</button>
      </div>}
      {claims.length ? <ul className="ai-claims">
        {claims.map((claim, i) => <li key={i}>
          <span className={`claim-kind kind-${claim.kind}`}>{kindLabel[claim.kind] ?? claim.kind}</span>
          <button type="button" className="claim-quote" title="Tampilkan di editor" onClick={() => { if (!onHighlight(claim.quote)) toast.info('Kalimat tidak ditemukan', 'Teks mungkin sudah Anda ubah.') }}>
            “{claim.quote}” <LocateFixed size={13} />
          </button>
          <small>{claim.note}</small>
        </li>)}
      </ul> : <p className="ai-empty"><Check size={14} />Tidak ada klaim yang perlu diverifikasi.</p>}
      {review.response.result.gaps.length > 0 && <>
        <strong className="ai-subhead"><Lightbulb size={14} />Bisa dilengkapi</strong>
        <ul className="ai-gaps">{review.response.result.gaps.map((gap, i) => <li key={i}><b>{gap.topic}</b> — {gap.suggestion}</li>)}</ul>
      </>}
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => void runReview()} disabled={busy !== null || !!blocker}><RotateCcw size={14} />Periksa ulang</button>
    </div>}
  </section>
}
