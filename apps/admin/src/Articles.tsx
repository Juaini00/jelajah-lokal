import { useEffect, useState } from 'react'
import type { Api, Article, Author, Category, Media, Writing } from './types'
import { dateLabel, points, tagsFrom } from './types'
import { ApiError, ErrorNotice, useCollection } from './api'
import { RichEditor } from './RichEditor'

const writingKeys: (keyof Writing)[] = ['title', 'slug', 'body', 'excerpt', 'metaDescription', 'tags', 'categoryDocumentId', 'authorDocumentId', 'coverMediaDocumentId', 'coverAlt', 'coverCaption', 'imageCredit', 'imageSourceUrl', 'sourceLinks', 'informationCheckedAt', 'operationalClaims', 'regionLabel', 'featured']
export function Articles({ api, openId, onOpened, onDirty }: { api: Api; openId: string | null; onOpened: () => void; onDirty: (dirty: boolean) => void }) {
  const collection = useCollection<Article>(api, '/articles')
  const categories = useCollection<Category>(api, '/categories')
  const authors = useCollection<Author>(api, '/authors')
  const media = useCollection<Media>(api, '/media')
  const [saved, setSaved] = useState<Article | null>(null)
  const [draft, setDraft] = useState<Article | null>(null)
  const [latest, setLatest] = useState<Article | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const [confirmation, setConfirmation] = useState<'publish' | 'unpublish' | 'delete' | null>(null)
  const [tagsText, setTagsText] = useState('')
  const [recovered, setRecovered] = useState(false)
  const dirty = !!draft && !!saved && writingKeys.some(key => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]))
  useEffect(() => { onDirty(dirty) }, [dirty, onDirty])
  function adopt(article: Article) { setSaved(article); setDraft(article); setTagsText(article.tags.join(', ')); setLatest(null); setRecovered(false); setConfirmation(null) }
  async function open(id: string) {
    if (dirty && !window.confirm('Perubahan belum disimpan. Buang perubahan dan buka artikel lain?')) return
    setPending(true); setError(null); setStatus('')
    try { adopt((await api<{ data: Article }>(`/articles/${id}`)).data) } catch (e) { setError(e) } finally { setPending(false) }
  }
  useEffect(() => { if (openId) { void open(openId); onOpened() } }, [openId])
  async function create() {
    if (dirty && !window.confirm('Buang perubahan belum tersimpan dan buat draft baru?')) return
    setPending(true); setError(null)
    try { const article = (await api<{ data: Article }>('/articles', { method: 'POST', body: '{}' })).data; adopt(article); await collection.reload(); setStatus('Draft kosong dibuat. Lengkapi dan simpan tanpa harus menerbitkan.') } catch (e) { setError(e) } finally { setPending(false) }
  }
  async function save() {
    if (!draft || !saved) return
    const patch: Record<string, unknown> = { revision: saved.revision }
    writingKeys.forEach(key => { patch[key] = draft[key] })
    setPending(true); setError(null); setStatus('')
    try { adopt((await api<{ data: Article }>(`/articles/${draft.documentId}`, { method: 'PATCH', body: JSON.stringify(patch) })).data); setStatus('Perubahan disimpan ke draft. Versi live tidak berubah.'); await collection.reload() } catch (e) { setError(e) } finally { setPending(false) }
  }
  async function inspectLatest() {
    if (!draft) return
    setPending(true)
    try { setLatest((await api<{ data: Article }>(`/articles/${draft.documentId}`)).data) } catch (e) { setError(e) } finally { setPending(false) }
  }
  async function execute(action: 'publish' | 'unpublish' | 'delete') {
    if (!saved) return
    setPending(true); setError(null); setStatus('')
    try {
      if (action === 'delete') { await api(`/articles/${saved.documentId}`, { method: 'DELETE' }); setDraft(null); setSaved(null); setStatus('Draft dihapus.') }
      else { adopt((await api<{ data: Article }>(`/articles/${saved.documentId}/${action}`, { method: 'POST', body: JSON.stringify({ revision: saved.revision }) })).data); setStatus(action === 'publish' ? 'Draft yang tersimpan diterbitkan secara manual.' : 'Artikel ditarik dari publik. Draft tetap tersedia.') }
      setConfirmation(null); await collection.reload()
    } catch (e) { setError(e) } finally { setPending(false) }
  }
  function update<K extends keyof Article>(key: K, value: Article[K]) { setDraft(d => d ? { ...d, [key]: value } : d) }
  return <><header className="page-header"><div><h1>Artikel</h1><p>Tulis draft, periksa informasi, lalu terbitkan secara terpisah.</p></div><button disabled={pending} onClick={() => void create()}>Buat artikel</button></header>
    <ErrorNotice error={collection.error || categories.error || authors.error || media.error} />
    <div className="cms-grid"><section className="panel article-list"><div className="panel-title"><h2>Artikel tersimpan</h2><button className="secondary" disabled={collection.loading || pending} onClick={() => { void collection.reload(); void categories.reload(); void authors.reload(); void media.reload() }}>Muat ulang</button></div>
      {collection.loading && <p role="status">Memuat artikel…</p>}{!collection.loading && !collection.error && !collection.data.length && <p>Belum ada artikel. Buat draft pertama.</p>}
      {collection.data.map(a => <button key={a.documentId} className={`article-item ${draft?.documentId === a.documentId ? 'selected' : ''}`} disabled={pending} onClick={() => void open(a.documentId)}><strong>{a.title || 'Draft tanpa judul'}</strong><span>{a.publishedAt ? `Live r${a.publishedRevision}` : 'Belum terbit'} · Draft r{a.revision}</span><small>{dateLabel(a.updatedAt)}</small></button>)}
    </section><section className="panel editor-panel" aria-busy={pending}>
      <ErrorNotice error={error} /><div role="status" aria-live="polite">{status && <p className="notice success">{status}</p>}{pending && <p>Memproses…</p>}</div>
      {!draft ? <div className="empty"><h2>Pilih artikel atau buat draft baru</h2><p>Draft boleh belum lengkap. Aturan publikasi diperiksa server.</p></div> : <>
        <div className="panel-title"><h2>{draft.title || 'Draft baru'}</h2><span className={`badge ${dirty ? 'purple' : ''}`}>{dirty ? 'Belum disimpan' : 'Tersimpan'}</span></div>
        <div className="notice"><strong>Draft r{saved?.revision} · {dateLabel(saved?.updatedAt || null)}</strong>{saved?.publishedAt ? `Live r${saved.publishedRevision} · ${dateLabel(saved.publishedAt)}. ${saved.revision !== saved.publishedRevision ? 'Ada perubahan draft yang belum terbit.' : 'Versi tersimpan sama dengan versi live.'}` : 'Belum pernah diterbitkan. Tidak dapat dibaca publik.'}</div>
        {(error instanceof ApiError && error.code === 'ARTICLE_CHANGED' || error instanceof ApiError && error.code === 'NETWORK_ERROR') && <button className="secondary" disabled={pending} onClick={() => void inspectLatest()}>Muat keadaan server untuk pemulihan</button>}
        {latest && <div className="notice conflict"><h3>Bandingkan versi terbaru r{latest.revision}</h3><p>{dateLabel(latest.updatedAt)} · {latest.title || 'Tanpa judul'}</p><ul>{writingKeys.filter(k => JSON.stringify(saved?.[k]) !== JSON.stringify(latest[k])).map(k => <li key={k}>{k}: berubah di server{JSON.stringify(saved?.[k]) !== JSON.stringify(draft[k]) ? ' dan di isian Anda' : ''}</li>)}</ul><p>Pilih versi server atau gabungkan secara sadar. Kolom yang Anda ubah dipertahankan; semua kolom lain mengikuti server. Penyimpanan tetap tindakan terpisah.</p><div className="actions"><button disabled={pending} className="secondary" onClick={() => { if (window.confirm('Buang seluruh isian lokal dan gunakan versi server?')) { adopt(latest); setError(null) } }}>Gunakan versi server</button><button disabled={pending} onClick={() => { const merged = { ...latest }; writingKeys.forEach(k => { if (JSON.stringify(draft[k]) !== JSON.stringify(saved?.[k])) Object.assign(merged, { [k]: draft[k] }) }); setSaved(latest); setDraft(merged); setTagsText(merged.tags.join(', ')); setLatest(null); setError(null); setRecovered(true); setStatus('Isian digabungkan untuk ditinjau. Periksa lalu simpan secara manual.') }}>Pertahankan perubahan lokal untuk ditinjau</button></div></div>}
        {recovered && <p className="notice">Pemulihan konflik: tinjau seluruh isian sebelum menyimpan.</p>}
        <div inert={pending}><fieldset disabled={pending}>
          <div className="form-grid"><label>Judul<input value={draft.title} onChange={e => update('title', e.target.value)} /><small>Publikasi: 10–120 karakter · {points(draft.title)}</small></label><label>Slug<input value={draft.slug} readOnly={!!saved?.publishedAt} onChange={e => update('slug', e.target.value)} /><small>Huruf kecil, angka, tanda hubung. Slug artikel live tidak dapat diubah.</small></label><label>Kategori<select value={draft.categoryDocumentId || ''} onChange={e => update('categoryDocumentId', e.target.value || null)}><option value="">Belum dipilih</option>{categories.data.map(x => <option key={x.documentId} value={x.documentId}>{x.name}</option>)}</select></label><label>Penulis publik<select value={draft.authorDocumentId || ''} onChange={e => update('authorDocumentId', e.target.value || null)}><option value="">Belum dipilih</option>{authors.data.map(x => <option key={x.documentId} value={x.documentId}>{x.name}</option>)}</select></label><label>Wilayah<input value={draft.regionLabel} onChange={e => update('regionLabel', e.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={draft.featured} onChange={e => update('featured', e.target.checked)} />Artikel pilihan</label></div>
          <RichEditor key={draft.documentId} value={draft.body} onChange={v => update('body', v)} media={media.data} />
          <h2>Metadata</h2><label>Ringkasan<textarea value={draft.excerpt} onChange={e => update('excerpt', e.target.value)} /><small>{points(draft.excerpt)} / 240 karakter · publikasi 50–240</small></label><label>Deskripsi SEO<textarea value={draft.metaDescription} onChange={e => update('metaDescription', e.target.value)} /><small>{points(draft.metaDescription)} / 160 karakter · publikasi 70–160</small></label><label>Tag, pisahkan dengan koma<input value={tagsText} onChange={e => { setTagsText(e.target.value); update('tags', tagsFrom(e.target.value)) }} /><small>Maksimal 5 tag unik, masing-masing 2–30 karakter.</small></label>
          <h2>Foto sampul</h2><label>Gambar sampul<select value={draft.coverMediaDocumentId || ''} onChange={e => update('coverMediaDocumentId', e.target.value || null)}><option value="">Belum dipilih</option>{media.data.map(m => <option value={m.documentId} key={m.documentId}>{m.credit || m.publicId} · {m.width} × {m.height}</option>)}</select></label>{media.data.find(m => m.documentId === draft.coverMediaDocumentId) && <img className="cover-preview" src={media.data.find(m => m.documentId === draft.coverMediaDocumentId)!.url} alt={draft.coverAlt} />}<div className="form-grid"><label>Deskripsi alternatif<input value={draft.coverAlt} onChange={e => update('coverAlt', e.target.value)} /></label><label>Caption<input value={draft.coverCaption} onChange={e => update('coverCaption', e.target.value)} /></label><label>Kredit foto<input value={draft.imageCredit} onChange={e => update('imageCredit', e.target.value)} /></label><label>URL sumber foto<input type="url" value={draft.imageSourceUrl} onChange={e => update('imageSourceUrl', e.target.value)} /></label></div>
          <h2>Sumber dan pemeriksaan</h2><label className="checkbox-label"><input type="checkbox" checked={draft.operationalClaims} onChange={e => update('operationalClaims', e.target.checked)} />Memuat klaim harga/jam buka/informasi operasional</label><label>Tanggal informasi diperiksa<input type="date" value={draft.informationCheckedAt?.slice(0, 10) || ''} onChange={e => update('informationCheckedAt', e.target.value || null)} /><small>Isi hanya setelah benar-benar memeriksa. Wajib untuk klaim operasional.</small></label>
          {draft.sourceLinks.map((source, i) => <div className="source-row" key={i}><label>Nama sumber {i + 1}<input value={source.label} onChange={e => update('sourceLinks', draft.sourceLinks.map((s, j) => j === i ? { ...s, label: e.target.value } : s))} /></label><label>URL sumber {i + 1}<input type="url" value={source.url} onChange={e => update('sourceLinks', draft.sourceLinks.map((s, j) => j === i ? { ...s, url: e.target.value } : s))} /></label><label>Tanggal akses {i + 1}<input type="date" value={source.accessedAt?.slice(0, 10) || ''} onChange={e => update('sourceLinks', draft.sourceLinks.map((s, j) => j === i ? { ...s, accessedAt: e.target.value || null } : s))} /></label><button type="button" className="secondary danger" onClick={() => update('sourceLinks', draft.sourceLinks.filter((_, j) => j !== i))}>Hapus sumber</button></div>)}<button type="button" className="secondary" onClick={() => update('sourceLinks', [...draft.sourceLinks, { label: '', url: '', accessedAt: null }])}>Tambah sumber</button>
        </fieldset></div>
        <div className="editor-actions"><button disabled={pending || !dirty || !!latest} onClick={() => void save()}>Simpan draft</button><button className="secondary" disabled={pending || dirty || !!latest} onClick={() => setConfirmation('publish')}>{saved?.publishedAt ? 'Terbitkan draft terbaru' : 'Terbitkan'}</button>{saved?.publishedAt ? <button className="secondary danger" disabled={pending || dirty} onClick={() => setConfirmation('unpublish')}>Tarik dari publik</button> : <button className="secondary danger" disabled={pending} onClick={() => setConfirmation('delete')}>Hapus draft</button>}</div>
        <p className="hint">{dirty ? 'Anda punya perubahan belum disimpan — simpan draft untuk mengaktifkan tombol Terbitkan.' : 'Gemini tidak diperlukan untuk terbitkan. Server memvalidasi semua syarat publikasi saat tombol ditekan.'}</p>
        {confirmation && <div className="notice confirmation" role="alert"><strong>{confirmation === 'publish' ? `Terbitkan versi tersimpan r${saved?.revision} ke publik?` : confirmation === 'unpublish' ? 'Tarik artikel dari semua halaman publik dan sitemap?' : 'Hapus draft secara permanen?'}</strong><p>{confirmation === 'delete' ? 'Isian lokal juga akan dibuang. Tindakan ini tidak dapat dibatalkan.' : 'Ini tindakan editorial manual, bukan bagian dari Assistant.'}</p><div className="actions"><button disabled={pending} onClick={() => void execute(confirmation)}>Ya, {confirmation === 'publish' ? 'terbitkan' : confirmation === 'unpublish' ? 'tarik dari publik' : 'hapus draft'}</button><button className="secondary" disabled={pending} onClick={() => setConfirmation(null)}>Batal</button></div></div>}
      </>}
    </section></div></>
}
