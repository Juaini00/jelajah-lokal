import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from './types'
import { ApiError, ErrorNotice, createApi } from './api'
import { Articles } from './Articles'
import { PeopleTaxonomy } from './PeopleTaxonomy'
import { Media } from './Media'
import { Assistant } from './Assistant'
import './App.css'

type Tab = 'articles' | 'categories' | 'authors' | 'media' | 'assistant'
const tabs: { id: Tab; label: string }[] = [
  { id: 'articles', label: 'Artikel' },
  { id: 'categories', label: 'Kategori' },
  { id: 'authors', label: 'Penulis' },
  { id: 'media', label: 'Media' },
  { id: 'assistant', label: 'Editorial Assistant' },
]

function Login({ onLoggedIn }: { onLoggedIn: (session: Session) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true); setError(null)
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
      })
      const payload: { data: Session; error?: { code: string; message: string; requestId: string; retryable: boolean } } | null = await response.json().catch(() => null)
      if (!response.ok || !payload) throw new ApiError(response.status, payload?.error?.code || 'SERVICE_ERROR', payload?.error?.message || 'Masuk gagal.', payload?.error?.requestId, payload?.error?.retryable)
      onLoggedIn(payload.data)
    } catch (e) { setError(e) } finally { setPending(false) }
  }
  return <div className="login-screen">
    <form className="login-card" onSubmit={e => void submit(e)}>
      <h1>Jelajah Lokal</h1>
      <p>Masuk ke admin editorial untuk mengelola artikel, media, dan Editorial Assistant.</p>
      <fieldset disabled={pending}>
        <label>Nama pengguna<input autoFocus required value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" /></label>
        <label>Kata sandi<input required type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <button type="submit" disabled={pending}>{pending ? 'Memeriksa…' : 'Masuk'}</button>
      </fieldset>
      <ErrorNotice error={error} />
    </form>
  </div>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [expiredNotice, setExpiredNotice] = useState(false)
  const [tab, setTab] = useState<Tab>('articles')
  const [openArticleId, setOpenArticleId] = useState<string | null>(null)
  const [articlesDirty, setArticlesDirty] = useState(false)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  const api = useRef(createApi(() => sessionRef.current?.csrfToken, () => { setSession(null); setExpiredNotice(true) })).current

  useEffect(() => {
    let active = true
    fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async r => { const payload: { data: Session } | null = await r.json().catch(() => null); return r.ok ? (payload?.data ?? null) : null })
      .then(data => { if (active) setSession(data) })
      .catch(() => { if (active) setSession(null) })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [])

  const logout = useCallback(async () => {
    try { await api('/logout', { method: 'POST' }) } catch { /* session treated as ended locally regardless of network outcome */ }
    setSession(null)
  }, [api])

  function switchTab(next: Tab) {
    if (tab === 'articles' && next !== 'articles' && articlesDirty && !window.confirm('Artikel memiliki perubahan belum disimpan. Pindah halaman dan buang perubahan?')) return
    setTab(next)
  }

  if (checking) return <div className="login-screen"><p role="status">Memeriksa sesi…</p></div>
  if (!session) return <>
    {expiredNotice && <p className="notice error" role="alert">Sesi berakhir. Masuk kembali untuk melanjutkan.</p>}
    <Login onLoggedIn={s => { setSession(s); setExpiredNotice(false) }} />
  </>

  return <div className="admin-shell">
    <aside className="admin-nav">
      <div className="brand">Jelajah Lokal<span>Admin</span></div>
      <nav aria-label="Navigasi admin">
        {tabs.map(t => <button key={t.id} className={`nav-item ${tab === t.id ? 'active' : ''}`} onClick={() => switchTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</button>)}
      </nav>
      <div className="nav-footer">
        <strong>{session.principal.username}</strong>
        <small>{session.principal.role === 'admin' ? 'Administrator' : 'Editor'}</small>
        <button className="secondary" onClick={() => void logout()}>Keluar</button>
      </div>
    </aside>
    <main className="admin-main">
      {tab === 'articles' && <Articles api={api} openId={openArticleId} onOpened={() => setOpenArticleId(null)} onDirty={setArticlesDirty} />}
      {tab === 'categories' && <PeopleTaxonomy api={api} kind="categories" />}
      {tab === 'authors' && <PeopleTaxonomy api={api} kind="authors" />}
      {tab === 'media' && <Media api={api} />}
      {tab === 'assistant' && <Assistant api={api} />}
    </main>
  </div>
}
