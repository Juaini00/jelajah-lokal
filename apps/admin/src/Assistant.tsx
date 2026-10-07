import { useCallback, useEffect, useRef, useState } from 'react'
import type { Api, Applied, Article, Generated, MetadataField, Usage } from './types'
import { bodyText, dateLabel, points, tagsFrom } from './types'
import { ApiError, ErrorNotice } from './api'

const fieldLabel: Record<MetadataField, string> = { excerpt: 'Ringkasan', metaDescription: 'Deskripsi SEO', tags: 'Tag' }
const fieldLimit: Record<MetadataField, number> = { excerpt: 240, metaDescription: 160, tags: 30 }

export function Assistant({ api }: { api: Api }) {
  const [drafts, setDrafts] = useState<Article[]>([])
  const [listError, setListError] = useState<unknown>(null)
  const [listLoading, setListLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [usage, setUsage] = useState<Usage | null>(null)
  const [usageError, setUsageError] = useState<unknown>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<unknown>(null)
  const [result, setResult] = useState<Generated | null>(null)
  const [excerpt, setExcerpt] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [selected, setSelected] = useState<Record<MetadataField, boolean>>({ excerpt: true, metaDescription: true, tags: true })
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<unknown>(null)
  const [applied, setApplied] = useState<Applied | null>(null)
  const key = useRef(crypto.randomUUID())
  const selectedDraft = drafts.find(d => d.documentId === selectedId) || null

  const loadDrafts = useCallback(async () => {
    setListLoading(true); setListError(null)
    try { setDrafts((await api<{ data: Article[] }>('/editorial/articles')).data) } catch (e) { setListError(e) } finally { setListLoading(false) }
  }, [api])
  const loadUsage = useCallback(async () => {
    setUsageError(null)
    try { setUsage(await api<Usage>('/editorial/usage')) } catch (e) { setUsageError(e) }
  }, [api])
  useEffect(() => { void loadDrafts(); void loadUsage() }, [loadDrafts, loadUsage])

  function selectDraft(id: string) {
    setSelectedId(id); setResult(null); setGenerateError(null); setApplyError(null); setApplied(null); key.current = crypto.randomUUID()
  }

  async function generate() {
    if (!selectedDraft) return
    setGenerating(true); setGenerateError(null); setApplied(null)
    try {
      const generated = await api<Generated>('/editorial/generate', { method: 'POST', body: JSON.stringify({ articleDocumentId: selectedDraft.documentId, idempotencyKey: key.current }) })
      setResult(generated)
      setExcerpt(generated.result.excerpt)
      setMetaDescription(generated.result.metaDescription)
      setTagsText(generated.result.suggestedTags.join(', '))
      setSelected({ excerpt: true, metaDescription: true, tags: true })
      await loadUsage()
    } catch (e) { setGenerateError(e) } finally { setGenerating(false) }
  }
  function newRequest() { setResult(null); setGenerateError(null); setApplied(null); key.current = crypto.randomUUID() }

  async function apply() {
    if (!result) return
    const fields = (Object.keys(selected) as MetadataField[]).filter(f => selected[f])
    if (!fields.length) return
    const values: { excerpt?: string; metaDescription?: string; tags?: string[] } = {}
    if (selected.excerpt) values.excerpt = excerpt
    if (selected.metaDescription) values.metaDescription = metaDescription
    if (selected.tags) values.tags = tagsFrom(tagsText)
    setApplying(true); setApplyError(null)
    try {
      const applyResult = await api<Applied>('/editorial/apply', { method: 'POST', body: JSON.stringify({ requestId: result.requestId, selectedFields: fields, values }) })
      setApplied(applyResult); await loadDrafts()
    } catch (e) { setApplyError(e) } finally { setApplying(false) }
  }

  const wordCount = selectedDraft ? bodyText(selectedDraft.body).trim().split(/\s+/).filter(Boolean).length : 0
  const belowMinimum = selectedDraft !== null && wordCount < 100
  const filtered = drafts.filter(d => (d.title || 'Draft tanpa judul').toLowerCase().includes(search.toLowerCase()))
  const conflict = applyError instanceof ApiError && applyError.code === 'ARTICLE_CHANGED'
  const busy = usage?.busy || (generateError instanceof ApiError && generateError.code === 'AI_BUSY')

  return <>
    <header className="page-header"><div><h1>Editorial Assistant</h1><p>Hasilkan usulan ringkasan, deskripsi SEO, dan tag dari draft tersimpan. Tidak ada publish otomatis.</p></div></header>
    <div role="status" aria-live="polite" className="usage-badge">
      {usageError ? <ErrorNotice error={usageError} /> : usage ? <span className={`badge ${usage.busy ? 'purple' : ''}`}>{usage.used} dari {usage.limit} proses hari ini (UTC){usage.busy ? ' · Sedang ada proses aktif' : ''}{!usage.enabled ? ' · AI dinonaktifkan' : ''} · Reset {dateLabel(usage.resetsAt)}</span> : <span>Memuat penggunaan…</span>}
      <button className="secondary" onClick={() => void loadUsage()}>Muat ulang penggunaan</button>
    </div>
    <div className="cms-grid">
      <section className="panel article-list">
        <div className="panel-title"><h2>Pilih draft</h2><button className="secondary" disabled={listLoading} onClick={() => void loadDrafts()}>Muat ulang</button></div>
        <label className="search-label">Cari judul<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ketik judul draft…" /></label>
        <ErrorNotice error={listError} />
        {listLoading && <p role="status">Memuat draft…</p>}
        {!listLoading && !listError && !filtered.length && <p>Tidak ada draft yang dapat diakses.</p>}
        {filtered.map(d => <button key={d.documentId} className={`article-item ${selectedId === d.documentId ? 'selected' : ''}`} onClick={() => selectDraft(d.documentId)}>
          <strong>{d.title || 'Draft tanpa judul'}</strong>
          <span>{d.publishedAt ? `Live r${d.publishedRevision}` : 'Belum terbit'} · Draft r{d.revision}</span>
          <small>{dateLabel(d.updatedAt)}</small>
        </button>)}
      </section>
      <section className="panel editor-panel" aria-busy={generating || applying}>
        {!selectedDraft ? <div className="empty"><h2>Belum ada draft dipilih</h2><p>Pilih draft tersimpan di kiri. Perubahan yang belum disimpan di editor artikel tidak ikut dikirim ke Gemini.</p></div> : <>
          <div className="panel-title"><h2>{selectedDraft.title || 'Draft tanpa judul'}</h2><span className="badge">{wordCount} kata</span></div>
          <div className="notice"><strong>Disimpan {dateLabel(selectedDraft.updatedAt)}</strong><p>Pratinjau dari draft tersimpan di server. Simpan perubahan di editor artikel sebelum generate agar usulan memakai isi terbaru.</p>{belowMinimum && <p className="hint">Artikel belum memiliki 100 kata bermakna; generate kemungkinan ditolak server dengan INPUT_TOO_SHORT.</p>}</div>

          <div className="editor-actions">
            <button disabled={generating || busy} onClick={() => void generate()}>{generating ? 'Membuat usulan…' : result ? 'Buat usulan baru' : 'Buat usulan metadata'}</button>
            {result && !generating && <button className="secondary" disabled={applying} onClick={newRequest}>Mulai permintaan baru</button>}
          </div>
          {generating && <p role="status">Menghubungi Gemini. Jangan tutup halaman…</p>}
          <ErrorNotice error={generateError} />

          {result && <section className="notice result-panel">
            <div className="panel-title"><h3>Usulan metadata</h3><span className={`badge ${result.cacheHit ? 'purple' : ''}`}>{result.cacheHit ? 'Dari cache tervalidasi' : 'Hasil baru'}</span></div>
            <p>Kuota setelah proses ini: {result.quota.used} dari {result.quota.limit} · sisa {result.quota.remaining}</p>
            <label className="checkbox-label"><input type="checkbox" checked={selected.excerpt} onChange={e => setSelected(s => ({ ...s, excerpt: e.target.checked }))} />Terapkan {fieldLabel.excerpt}</label>
            <label>{fieldLabel.excerpt}<textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} disabled={!selected.excerpt} /><small>{points(excerpt)} / {fieldLimit.excerpt} karakter</small></label>
            <label className="checkbox-label"><input type="checkbox" checked={selected.metaDescription} onChange={e => setSelected(s => ({ ...s, metaDescription: e.target.checked }))} />Terapkan {fieldLabel.metaDescription}</label>
            <label>{fieldLabel.metaDescription}<textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} disabled={!selected.metaDescription} /><small>{points(metaDescription)} / {fieldLimit.metaDescription} karakter</small></label>
            <label className="checkbox-label"><input type="checkbox" checked={selected.tags} onChange={e => setSelected(s => ({ ...s, tags: e.target.checked }))} />Terapkan {fieldLabel.tags}</label>
            <label>{fieldLabel.tags}, pisahkan dengan koma<input value={tagsText} onChange={e => setTagsText(e.target.value)} disabled={!selected.tags} /><small>{tagsFrom(tagsText).length} tag · maksimal 5, masing-masing 2–{fieldLimit.tags} karakter</small></label>

            <div className="editor-actions">
              <button disabled={applying || !Object.values(selected).some(Boolean) || (!!applied && applied.requestId === result.requestId)} onClick={() => void apply()}>{applying ? 'Menerapkan…' : 'Terapkan ke draft'}</button>
            </div>
            <ErrorNotice error={applyError} />
            {conflict && <div className="notice conflict" role="alert"><h3>Draft berubah sejak usulan dibuat</h3><p>Tidak ada penimpaan. Muat ulang draft, periksa isi terbaru di editor artikel, lalu buat permintaan baru jika usulan masih relevan.</p><div className="actions"><button className="secondary" onClick={() => { void loadDrafts(); newRequest() }}>Muat ulang draft dan mulai permintaan baru</button></div></div>}
            {applied && applied.requestId === result.requestId && <p className="notice success" role="status">Metadata tersimpan ke draft r{applied.draftRevision} ({applied.selectedFields.map(f => fieldLabel[f]).join(', ')}). Periksa lalu publish melalui halaman Artikel.</p>}
          </section>}
        </>}
      </section>
    </div>
  </>
}
