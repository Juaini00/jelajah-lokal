import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, ImageOff, ImagePlus, Images, Search, Trash2, UploadCloud, XCircle } from 'lucide-react'
import { api, describeError } from '../lib/api'
import { formatBytes, thumb } from '../lib/format'
import { keys, upsertIn, useMedia } from '../lib/queries'
import type { Media } from '../lib/types'
import { safeUrl } from '../lib/validation'
import { Dialog } from './feedback'
import { EmptyState, ErrorBanner, Field, Skeleton, Spinner } from './controls'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

export function fileProblem(file: File) {
  if (!ACCEPT.includes(file.type)) return `Format ${file.type || 'tidak dikenal'} tidak didukung. Gunakan JPEG, PNG, atau WebP.`
  if (file.size > MAX_BYTES) return `Ukuran ${formatBytes(file.size)} melebihi batas 5 MB. Kompres gambar terlebih dahulu.`
  return ''
}

interface Queued { id: string; file: File; preview: string; problem: string; state: 'ready' | 'uploading' | 'done' | 'failed'; error?: string }

/** Drag-and-drop / browse uploader with per-file validation, previews and sequential upload. */
export function UploadPanel({ onUploaded, single = false }: { onUploaded?: (media: Media) => void; single?: boolean }) {
  const client = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<Queued[]>([])
  const [dragging, setDragging] = useState(false)
  const [credit, setCredit] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [license, setLicense] = useState('')
  const [busy, setBusy] = useState(false)
  const queueRef = useRef(queue)
  useEffect(() => { queueRef.current = queue })
  useEffect(() => () => queueRef.current.forEach(q => URL.revokeObjectURL(q.preview)), [])

  function add(files: FileList | File[]) {
    const incoming = Array.from(files).slice(0, single ? 1 : 20).map(file => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), problem: fileProblem(file), state: 'ready' as const }))
    setQueue(current => {
      if (single) current.forEach(q => URL.revokeObjectURL(q.preview))
      return single ? incoming : [...current.filter(q => q.state !== 'done'), ...incoming]
    })
  }
  function remove(id: string) {
    setQueue(current => current.filter(q => { if (q.id === id) URL.revokeObjectURL(q.preview); return q.id !== id }))
  }
  function onDrop(event: DragEvent) {
    event.preventDefault(); setDragging(false)
    if (event.dataTransfer.files.length) add(event.dataTransfer.files)
  }
  const sourceInvalid = !!sourceUrl && !safeUrl(sourceUrl)
  const ready = queue.filter(q => !q.problem && (q.state === 'ready' || q.state === 'failed'))

  async function upload() {
    if (sourceInvalid || !ready.length) return
    setBusy(true)
    for (const item of ready) {
      setQueue(current => current.map(q => (q.id === item.id ? { ...q, state: 'uploading', error: undefined } : q)))
      const form = new FormData()
      form.set('file', item.file); form.set('credit', credit.trim()); form.set('sourceUrl', sourceUrl.trim()); form.set('license', license.trim())
      try {
        const { data } = await api.post<{ data: Media }>('/media', form)
        upsertIn(client, keys.media, data, true)
        setQueue(current => current.map(q => (q.id === item.id ? { ...q, state: 'done' } : q)))
        onUploaded?.(data)
      } catch (error) {
        setQueue(current => current.map(q => (q.id === item.id ? { ...q, state: 'failed', error: describeError(error).title } : q)))
      }
    }
    setBusy(false)
  }

  return <div className="upload-panel">
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      role="button" tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <UploadCloud size={28} />
      <strong>{dragging ? 'Lepaskan untuk menambahkan' : 'Seret gambar ke sini atau klik untuk memilih'}</strong>
      <span>JPEG, PNG, atau WebP · maksimal 5 MB{single ? '' : ' per berkas'}</span>
      <input ref={input} type="file" hidden accept={ACCEPT.join(',')} multiple={!single} onChange={e => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
    </div>
    {queue.length > 0 && <>
      <ul className="upload-queue">
        {queue.map(q => <li key={q.id} className={`upload-item ${q.problem || q.state === 'failed' ? 'bad' : ''}`}>
          {q.file.type.startsWith('image/') ? <img src={q.preview} alt="" /> : <span className="upload-thumb-bad" aria-hidden><ImageOff size={20} /></span>}
          <div>
            <strong title={q.file.name}>{q.file.name}</strong>
            <small>{q.problem || q.error || (q.state === 'done' ? 'Terunggah' : q.state === 'uploading' ? 'Mengunggah…' : formatBytes(q.file.size))}</small>
          </div>
          {q.state === 'uploading' ? <Spinner /> : q.state === 'done' ? <CheckCircle2 size={18} className="ok-icon" /> : q.problem || q.state === 'failed' ? <XCircle size={18} className="bad-icon" /> : null}
          {q.state !== 'uploading' && q.state !== 'done' && <button type="button" className="icon-button" aria-label={`Hapus ${q.file.name} dari antrean`} disabled={busy} onClick={() => remove(q.id)}><Trash2 size={16} /></button>}
        </li>)}
      </ul>
      <div className="form-grid three">
        <Field path="credit" label="Kredit foto" hint="Nama fotografer atau pemilik."><input id="field-credit" value={credit} onChange={e => setCredit(e.target.value)} placeholder="mis. Foto oleh Rani / Pexels" disabled={busy} /></Field>
        <Field path="sourceUrl" label="URL sumber" error={sourceInvalid ? 'Gunakan URL lengkap yang diawali https://.' : undefined}><input id="field-sourceUrl" type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://" disabled={busy} aria-invalid={sourceInvalid} /></Field>
        <Field path="license" label="Lisensi"><input id="field-license" value={license} onChange={e => setLicense(e.target.value)} placeholder="mis. Pexels License" disabled={busy} /></Field>
      </div>
      <div className="row-end">
        <button type="button" className="btn btn-primary" disabled={busy || !ready.length || sourceInvalid} onClick={() => void upload()}>
          {busy ? <><Spinner />Mengunggah…</> : <><UploadCloud size={16} />Unggah {ready.length > 1 ? `${ready.length} gambar` : 'gambar'}</>}
        </button>
      </div>
    </>}
  </div>
}

/** Thumbnail grid picker with search and inline upload; replaces bare <select> dropdowns of IDs. */
export function MediaPicker({ open, onClose, onSelect, selectedId, title = 'Pilih gambar' }: {
  open: boolean; onClose: () => void; onSelect: (media: Media) => void; selectedId?: string | null; title?: string
}) {
  const media = useMedia()
  const [tab, setTab] = useState<'library' | 'upload'>('library')
  const [query, setQuery] = useState('')
  const [choice, setChoice] = useState<string | null>(selectedId ?? null)
  // Reset the picker each time it opens (render-phase state sync, no effect round-trip).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setChoice(selectedId ?? null); setQuery(''); setTab('library') }
  }
  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (media.data ?? []).filter(m => !q || `${m.credit} ${m.publicId} ${m.license}`.toLowerCase().includes(q))
  }, [media.data, query])
  const chosen = media.data?.find(m => m.documentId === choice)

  return <Dialog open={open} onClose={onClose} size="xl" title={title} description="Pilih dari pustaka atau unggah gambar baru."
    footer={tab === 'library' && <>
      <span className="footer-note">{chosen ? `${chosen.credit || chosen.publicId.split('/').pop()} · ${chosen.width}×${chosen.height}` : 'Belum ada gambar dipilih'}</span>
      <button type="button" className="btn btn-ghost" onClick={onClose}>Batal</button>
      <button type="button" className="btn btn-primary" disabled={!chosen} onClick={() => { if (chosen) { onSelect(chosen); onClose() } }}><Check size={16} />Gunakan gambar</button>
    </>}>
    <div className="segmented" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'library'} onClick={() => setTab('library')}><Images size={16} />Pustaka</button>
      <button type="button" role="tab" aria-selected={tab === 'upload'} onClick={() => setTab('upload')}><ImagePlus size={16} />Unggah baru</button>
    </div>
    {tab === 'upload' ? <UploadPanel single onUploaded={m => { onSelect(m); onClose() }} /> : <>
      <label className="search-box"><Search size={16} /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari kredit, nama berkas, lisensi…" aria-label="Cari media" /></label>
      <ErrorBanner error={media.error} onRetry={() => void media.refetch()} />
      {media.isPending ? <Skeleton rows={2} height={120} /> : !items.length ? <EmptyState icon={<Images size={28} />} title={query ? 'Tidak ada yang cocok' : 'Pustaka masih kosong'} action={<button type="button" className="btn btn-secondary" onClick={() => setTab('upload')}><ImagePlus size={16} />Unggah gambar</button>} /> :
        <div className="picker-grid" role="listbox" aria-label="Pustaka media">
          {items.map(m => <button type="button" role="option" aria-selected={choice === m.documentId} key={m.documentId} className={`picker-item ${choice === m.documentId ? 'selected' : ''}`} onClick={() => setChoice(m.documentId)} onDoubleClick={() => { onSelect(m); onClose() }}>
            <img src={thumb(m.url, 240, 180)} alt={m.credit || m.publicId} loading="lazy" decoding="async" />
            <span>{m.credit || m.publicId.split('/').pop()}</span>
            {choice === m.documentId && <span className="picker-check"><Check size={14} /></span>}
          </button>)}
        </div>}
    </>}
  </Dialog>
}

/** Selected-image preview with change/remove, used for cover and avatar fields. */
export function MediaField({ id, mediaId, onChange, emptyLabel = 'Pilih gambar', invalid }: { id: string; mediaId: string | null; onChange: (media: Media | null) => void; emptyLabel?: string; invalid?: boolean }) {
  const media = useMedia()
  const [open, setOpen] = useState(false)
  const current = media.data?.find(m => m.documentId === mediaId)
  return <>
    {mediaId ? <div className="media-field">
      {current ? <img src={thumb(current.url, 640)} alt="" /> : <div className="media-missing">{media.isPending ? <Spinner /> : 'Gambar tidak ditemukan di pustaka'}</div>}
      <div className="media-field-actions">
        <button id={id} type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(true)}>Ganti</button>
        <button type="button" className="btn btn-sm btn-ghost danger" onClick={() => onChange(null)}>Lepas</button>
      </div>
    </div> : <button id={id} type="button" className={`media-empty ${invalid ? 'invalid' : ''}`} onClick={() => setOpen(true)}><ImagePlus size={22} /><span>{emptyLabel}</span></button>}
    <MediaPicker open={open} onClose={() => setOpen(false)} selectedId={mediaId} onSelect={m => onChange(m)} />
  </>
}
