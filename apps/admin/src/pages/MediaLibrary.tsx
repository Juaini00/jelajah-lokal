import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Images, RefreshCw, Search, Trash2, UploadCloud } from 'lucide-react'
import { api, describeError, isApiError } from '../lib/api'
import { formatDate, thumb } from '../lib/format'
import { keys, removeFrom, useMedia } from '../lib/queries'
import type { Media } from '../lib/types'
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../ui/controls'
import { confirm, Dialog, toast, useDebounced } from '../ui/feedback'
import { UploadPanel } from '../ui/media'

export function MediaLibrary() {
  const client = useQueryClient()
  const media = useMedia()
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [detail, setDetail] = useState<Media | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<unknown>(null)
  const query = useDebounced(search.trim().toLowerCase(), 150)
  const items = useMemo(() => (media.data ?? []).filter(m => !query || `${m.credit} ${m.publicId} ${m.license}`.toLowerCase().includes(query)), [media.data, query])

  async function remove(item: Media) {
    if (!await confirm({ title: 'Hapus gambar ini?', message: 'Gambar dihapus dari Cloudinary dan pustaka. Gambar yang masih dipakai artikel tidak dapat dihapus.', confirmLabel: 'Hapus gambar', tone: 'danger' })) return
    setDeleting(true); setDeleteError(null)
    try {
      await api.delete(`/media/${item.documentId}`)
      removeFrom(client, keys.media, item.documentId)
      setDetail(null)
      toast.success('Gambar dihapus')
    } catch (error) {
      setDeleteError(error)
      if (!isApiError(error, 'RELATION_REFERENCED')) toast.error('Gagal menghapus gambar', describeError(error).title)
    } finally { setDeleting(false) }
  }

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); toast.success('URL disalin') } catch { toast.error('Tidak dapat menyalin', 'Izin clipboard ditolak browser.') }
  }

  return <div className="page">
    <PageHeader title="Media" description="Pustaka foto berlisensi untuk sampul dan isi artikel."
      actions={<button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)}><UploadCloud size={16} />Unggah gambar</button>} />
    <div className="toolbar-row">
      <label className="search-box grow"><Search size={16} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari kredit, nama berkas, lisensi…" aria-label="Cari media" /></label>
      <span className="muted">{media.data ? `${items.length} dari ${media.data.length} gambar` : ''}</span>
      <button type="button" className="icon-button" aria-label="Muat ulang" title="Muat ulang" onClick={() => void media.refetch()} disabled={media.isFetching}>{media.isFetching ? <Spinner /> : <RefreshCw size={16} />}</button>
    </div>
    <ErrorBanner error={media.error} onRetry={() => void media.refetch()} />
    {media.isPending ? <div className="media-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '4 / 3' }} />)}</div>
      : !media.data?.length ? <EmptyState icon={<Images size={28} />} title="Pustaka masih kosong" action={<button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)}><UploadCloud size={16} />Unggah gambar pertama</button>}>Unggah foto yang Anda miliki atau berlisensi bebas, lengkap dengan kreditnya.</EmptyState>
      : !items.length ? <EmptyState icon={<Search size={28} />} title="Tidak ada gambar yang cocok" />
      : <div className="media-grid">
        {items.map(m => <button type="button" key={m.documentId} className="media-tile" onClick={() => { setDeleteError(null); setDetail(m) }}>
          <img src={thumb(m.url, 360, 270)} alt={m.credit || m.publicId} loading="lazy" decoding="async" />
          <span className="media-tile-meta"><strong>{m.credit || m.publicId.split('/').pop()}</strong><small>{m.width}×{m.height} · {m.format.toUpperCase()}</small></span>
        </button>)}
      </div>}

    <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} size="lg" title="Unggah gambar" description="Gambar disimpan di Cloudinary. Cantumkan kredit dan lisensi agar penggunaan tetap sah.">
      <UploadPanel />
    </Dialog>

    <Dialog open={!!detail} onClose={() => setDetail(null)} size="lg" busy={deleting} title={detail?.credit || detail?.publicId.split('/').pop() || 'Detail gambar'}
      footer={detail && <>
        <button type="button" className="btn btn-ghost danger" onClick={() => void remove(detail)} disabled={deleting}>{deleting ? <Spinner /> : <Trash2 size={16} />}Hapus</button>
        <span className="grow" />
        <button type="button" className="btn btn-secondary" onClick={() => void copy(detail.url)}><Copy size={16} />Salin URL</button>
        <a className="btn btn-secondary" href={detail.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />Buka asli</a>
      </>}>
      {detail && <div className="media-detail">
        <img src={thumb(detail.url, 1200)} alt={detail.credit || detail.publicId} />
        {deleteError !== null && <ErrorBanner error={deleteError} onDismiss={() => setDeleteError(null)} />}
        <dl>
          <dt>Ukuran</dt><dd>{detail.width} × {detail.height} px · {detail.format.toUpperCase()}</dd>
          <dt>Kredit</dt><dd>{detail.credit || <span className="muted">Tidak diisi</span>}</dd>
          <dt>Lisensi</dt><dd>{detail.license || <span className="muted">Tidak diisi</span>}</dd>
          <dt>Sumber</dt><dd>{detail.sourceUrl ? <a href={detail.sourceUrl} target="_blank" rel="noreferrer">{detail.sourceUrl}</a> : <span className="muted">Tidak diisi</span>}</dd>
          <dt>Public ID</dt><dd><code>{detail.publicId}</code></dd>
          <dt>Diunggah</dt><dd>{formatDate(detail.createdAt)}</dd>
        </dl>
      </div>}
    </Dialog>
  </div>
}
