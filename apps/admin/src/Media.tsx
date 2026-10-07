import { useRef, useState } from 'react'
import type { Api, Media as MediaItem } from './types'
import { dateLabel } from './types'
import { ApiError, ErrorNotice, useCollection } from './api'

export function Media({ api }: { api: Api }) {
  const collection = useCollection<MediaItem>(api, '/media')
  const fileInput = useRef<HTMLInputElement>(null)
  const [credit, setCredit] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [license, setLicense] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<unknown>(null)
  const [status, setStatus] = useState('')
  const [remove, setRemove] = useState<MediaItem | null>(null)
  const [deleteError, setDeleteError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileInput.current?.files?.[0]
    if (!file) { setUploadError(new ApiError(0, 'CLIENT_ERROR', 'Pilih berkas JPEG, PNG, atau WebP terlebih dahulu.')); return }
    const form = new FormData()
    form.set('file', file); form.set('credit', credit); form.set('sourceUrl', sourceUrl); form.set('license', license)
    setUploading(true); setUploadError(null); setStatus('')
    try {
      await api<{ data: MediaItem }>('/media', { method: 'POST', body: form })
      setStatus('Media diunggah ke Cloudinary.'); setCredit(''); setSourceUrl(''); setLicense('')
      if (fileInput.current) fileInput.current.value = ''
      await collection.reload()
    } catch (e) { setUploadError(e) } finally { setUploading(false) }
  }
  async function deleteItem() {
    if (!remove) return
    setPending(true); setDeleteError(null)
    try { await api(`/media/${remove.documentId}`, { method: 'DELETE' }); setRemove(null); setStatus('Media dihapus.'); await collection.reload() }
    catch (e) { setDeleteError(e) } finally { setPending(false) }
  }

  return <>
    <header className="page-header"><div><h1>Media</h1><p>Unggah foto legal ke Cloudinary dan kelola kredit/sumbernya.</p></div></header>
    <div className="cms-grid">
      <section className="panel">
        <h2>Unggah media baru</h2>
        <form onSubmit={e => void upload(e)}>
          <fieldset disabled={uploading}>
            <label>Berkas gambar (JPEG/PNG/WebP, maksimal 5MB)<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" required /></label>
            <label>Kredit foto<input value={credit} onChange={e => setCredit(e.target.value)} /></label>
            <label>URL sumber<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} /></label>
            <label>Lisensi<input value={license} onChange={e => setLicense(e.target.value)} placeholder="mis. Pexels License" /></label>
            <button type="submit" disabled={uploading}>{uploading ? 'Mengunggah…' : 'Unggah media'}</button>
          </fieldset>
        </form>
        <ErrorNotice error={uploadError} />
        <div role="status" aria-live="polite">{status && <p className="notice success">{status}</p>}</div>
      </section>
      <section className="panel article-list">
        <div className="panel-title"><h2>Pustaka media</h2><button className="secondary" disabled={collection.loading} onClick={() => void collection.reload()}>Muat ulang</button></div>
        <ErrorNotice error={collection.error} />
        {collection.loading && <p role="status">Memuat media…</p>}
        {!collection.loading && !collection.error && !collection.data.length && <p>Belum ada media diunggah.</p>}
        <div className="media-grid">
          {collection.data.map(m => <div className="media-card" key={m.documentId}>
            <img src={m.url} alt={m.credit || m.publicId} width={m.width} height={m.height} />
            <strong>{m.credit || m.publicId}</strong>
            <small>{m.width} × {m.height} · {m.format} · {dateLabel(m.createdAt)}</small>
            {m.license && <small>Lisensi: {m.license}</small>}
            <button type="button" className="secondary danger" onClick={() => setRemove(m)}>Hapus</button>
          </div>)}
        </div>
      </section>
    </div>
    {remove && <section className="notice confirmation" role="alert">
      <strong>Hapus {remove.credit || remove.publicId}?</strong>
      <p>Media yang masih dirujuk draft atau artikel live akan ditolak server (409).</p>
      <ErrorNotice error={deleteError} />
      <div className="actions"><button disabled={pending} className="danger" onClick={() => void deleteItem()}>Ya, hapus</button><button disabled={pending} className="secondary" onClick={() => setRemove(null)}>Batal</button></div>
    </section>}
  </>
}
