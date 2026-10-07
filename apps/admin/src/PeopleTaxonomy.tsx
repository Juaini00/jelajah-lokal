import { useState } from 'react'
import type { Api, Author, Category, Media } from './types'
import { points } from './types'
import { ErrorNotice, useCollection } from './api'

export function PeopleTaxonomy({ api, kind }: { api: Api; kind: 'categories' | 'authors' }) {
  const list = useCollection<Category | Author>(api, `/${kind}`)
  const media = useCollection<Media>(api, '/media')
  const [id, setId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [order, setOrder] = useState('0')
  const [avatar, setAvatar] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const [remove, setRemove] = useState<Category | Author | null>(null)
  const [changed, setChanged] = useState(false)
  function edit(item?: Category | Author) {
    if (changed && !window.confirm('Buang perubahan yang belum disimpan?')) return
    setId(item?.documentId || null); setName(item?.name || ''); setSlug(item?.slug || '')
    setDescription(item ? ('description' in item ? item.description : item.bio) : '')
    setOrder(item && 'order' in item ? String(item.order) : '0'); setAvatar(item && 'avatarMediaDocumentId' in item ? item.avatarMediaDocumentId || '' : '')
    setError(null); setChanged(false); setStatus('')
  }
  async function save() {
    setPending(true); setError(null); setStatus('')
    const body = kind === 'categories' ? { name, slug, description, order: Number(order) } : { name, slug, bio: description, avatarMediaDocumentId: avatar || null }
    try { const item = (await api<{ data: Category | Author }>(`/${kind}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(body) })).data; setChanged(false); setId(item.documentId); setStatus('Perubahan disimpan. Versi artikel live tetap menggunakan snapshot saat publikasi.'); await list.reload() } catch (e) { setError(e) } finally { setPending(false) }
  }
  async function deleteItem() {
    if (!remove) return
    setPending(true); setError(null)
    try { await api(`/${kind}/${remove.documentId}`, { method: 'DELETE' }); if (id === remove.documentId) { setChanged(false); setId(null); setName(''); setSlug(''); setDescription(''); setOrder('0'); setAvatar('') } setRemove(null); setStatus('Entri dihapus.'); await list.reload() } catch (e) { setError(e) } finally { setPending(false) }
  }
  return <><header className="page-header"><div><h1>{kind === 'categories' ? 'Kategori' : 'Penulis'}</h1><p>{kind === 'categories' ? 'Kelompokkan panduan dengan kategori sederhana.' : 'Profil penulis publik terpisah dari akun admin.'}</p></div><button disabled={pending} onClick={() => edit()}>Tambah {kind === 'categories' ? 'kategori' : 'penulis'}</button></header><ErrorNotice error={list.error || media.error || error} /><div role="status">{pending ? 'Menyimpan…' : status}</div><div className="cms-grid"><section className="panel"><div className="panel-title"><h2>Daftar {kind === 'categories' ? 'kategori' : 'penulis'}</h2><button className="secondary" disabled={list.loading || pending} onClick={() => { void list.reload(); void media.reload() }}>Muat ulang</button></div>{list.loading && <p role="status">Memuat…</p>}{!list.loading && !list.error && !list.data.length && <p>Belum ada entri.</p>}{list.data.map(item => <div className="entity-row" key={item.documentId}><button disabled={pending} className="article-item" onClick={() => edit(item)}><strong>{item.name}</strong><small>{item.slug}</small></button><button disabled={pending} className="secondary danger" aria-label={`Hapus ${item.name}`} onClick={() => setRemove(item)}>Hapus</button></div>)}</section><section className="panel"><h2>{id ? 'Ubah' : 'Tambah'} {kind === 'categories' ? 'kategori' : 'penulis'}</h2><form onSubmit={e => { e.preventDefault(); void save() }} onChange={() => setChanged(true)}><fieldset disabled={pending}><label>Nama<input required value={name} onChange={e => setName(e.target.value)} /></label><label>Slug<input required value={slug} onChange={e => setSlug(e.target.value)} /><small>Huruf kecil, angka, tanda hubung.</small></label><label>{kind === 'categories' ? 'Deskripsi' : 'Bio'}<textarea value={description} onChange={e => setDescription(e.target.value)} /><small>{points(description)} / {kind === 'categories' ? 240 : 300} karakter</small></label>{kind === 'categories' ? <label>Urutan<input type="number" step="1" required value={order} onChange={e => setOrder(e.target.value)} /></label> : <><label>Foto profil<select value={avatar} onChange={e => setAvatar(e.target.value)}><option value="">Tanpa foto</option>{media.data.map(m => <option key={m.documentId} value={m.documentId}>{m.credit || m.publicId}</option>)}</select></label>{media.data.find(m => m.documentId === avatar) && <img className="avatar-preview" src={media.data.find(m => m.documentId === avatar)!.url} alt={`Foto ${name}`} />}</>}<button type="submit" disabled={pending}>Simpan {kind === 'categories' ? 'kategori' : 'penulis'}</button></fieldset></form><p className="hint">Validasi server berlaku. Entri yang masih dirujuk draft atau versi live tidak dapat dihapus.</p></section></div>{remove && <section className="notice confirmation" role="alert"><strong>Hapus {remove.name}?</strong><p>Server akan menolak jika masih dirujuk artikel.</p><div className="actions"><button disabled={pending} className="danger" onClick={() => void deleteItem()}>Ya, hapus</button><button disabled={pending} className="secondary" onClick={() => setRemove(null)}>Batal</button></div></section>}</>
}
