import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, FileText, Images, LogIn, LogOut, Menu, Sparkles, Tags, UserRound, WifiOff, X } from 'lucide-react'
import { api, describeError, isApiError, login, sessionStore, useSession } from './lib/api'
import { Link, mayLeave, navigate, useLocation } from './lib/router'
import type { Session } from './lib/types'
import { ArticlesList } from './pages/ArticlesList'
import { useUsage } from './lib/queries'
import { Dialog, FeedbackHost } from './ui/feedback'
import { EmptyState, Skeleton, Spinner } from './ui/controls'

// The editor (TipTap/ProseMirror) and secondary pages load on demand; the editor chunk is warmed when idle.
const loadEditor = () => import('./pages/ArticleEditor')
const ArticleEditorPage = lazy(() => loadEditor().then(m => ({ default: m.ArticleEditorPage })))
const Assistant = lazy(() => import('./pages/Assistant').then(m => ({ default: m.Assistant })))
const MediaLibrary = lazy(() => import('./pages/MediaLibrary').then(m => ({ default: m.MediaLibrary })))
const Taxonomy = lazy(() => import('./pages/Taxonomy').then(m => ({ default: m.Taxonomy })))

const nav = [
  { group: 'Konten', items: [{ to: '/articles', label: 'Artikel', icon: FileText }, { to: '/media', label: 'Media', icon: Images }] },
  { group: 'Taksonomi', items: [{ to: '/categories', label: 'Kategori', icon: Tags }, { to: '/authors', label: 'Penulis', icon: UserRound }] },
  { group: 'Bantuan AI', items: [{ to: '/assistant', label: 'Editorial Assistant', icon: Sparkles }] },
]

function useOnline() {
  return useSyncExternalStore(listener => {
    window.addEventListener('online', listener); window.addEventListener('offline', listener)
    return () => { window.removeEventListener('online', listener); window.removeEventListener('offline', listener) }
  }, () => navigator.onLine)
}

function LoginForm({ presetUsername = '', onDone }: { presetUsername?: string; onDone?: (session: Session) => void }) {
  const [username, setUsername] = useState(presetUsername)
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!username.trim() || !password) { setError('Isi nama pengguna dan kata sandi.'); return }
    setPending(true); setError('')
    try {
      // Not `onDone?.(await login())`: optional calls skip evaluating their arguments when onDone is absent.
      const session = await login(username.trim(), password)
      onDone?.(session)
    }
    catch (failure) {
      setError(isApiError(failure, 'AUTH_REQUIRED') ? 'Nama pengguna atau kata sandi salah.' : describeError(failure).title)
      setPassword('')
    } finally { setPending(false) }
  }

  return <form className="stack" onSubmit={e => void submit(e)} noValidate>
    <div className="field">
      <div className="field-label"><label htmlFor="login-username">Nama pengguna</label></div>
      <input id="login-username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus={!presetUsername} disabled={pending} aria-invalid={!!error} />
    </div>
    <div className="field">
      <div className="field-label"><label htmlFor="login-password">Kata sandi</label></div>
      <div className="input-group">
        <input id="login-password" type={reveal ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus={!!presetUsername} disabled={pending} aria-invalid={!!error}
          onKeyUp={e => setCapsLock(e.getModifierState('CapsLock'))} />
        <button type="button" className="icon-button" aria-label={reveal ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setReveal(r => !r)}>{reveal ? <EyeOff size={16} /> : <Eye size={16} />}</button>
      </div>
      {capsLock && <p className="field-hint warn">Caps Lock aktif.</p>}
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <button type="submit" className="btn btn-primary btn-block" disabled={pending}>{pending ? <><Spinner />Memeriksa…</> : <><LogIn size={16} />Masuk</>}</button>
  </form>
}

function LoginScreen() {
  return <div className="login-screen">
    <div className="login-card">
      <div className="brand-mark large">JL</div>
      <h1>Masuk ke Jelajah Lokal</h1>
      <p>Ruang editorial untuk menulis dan menerbitkan panduan perjalanan.</p>
      <LoginForm />
    </div>
  </div>
}

function Page({ path }: { path: string }) {
  const [, section, id] = path.split('/')
  useEffect(() => {
    const titles: Record<string, string> = { articles: id ? 'Edit artikel' : 'Artikel', media: 'Media', categories: 'Kategori', authors: 'Penulis', assistant: 'Editorial Assistant' }
    document.title = `${titles[section] ?? 'Admin'} · Jelajah Lokal`
  }, [section, id])
  useEffect(() => { if (!section) void navigate('/articles', { replace: true, force: true }) }, [section])

  if (section === 'articles') return id ? <ArticleEditorPage id={id} /> : <ArticlesList />
  if (section === 'media') return <MediaLibrary />
  if (section === 'categories') return <Taxonomy kind="categories" />
  if (section === 'authors') return <Taxonomy kind="authors" />
  if (section === 'assistant') return <Assistant />
  if (!section) return null
  return <div className="page"><EmptyState icon={<X size={28} />} title="Halaman tidak ditemukan" action={<Link to="/articles" className="btn btn-primary">Ke daftar artikel</Link>} /></div>
}

function Shell({ session }: { session: Session }) {
  const client = useQueryClient()
  const { path } = useLocation()
  const online = useOnline()
  const { expired } = useSession()
  const usage = useUsage()
  const [navOpen, setNavOpen] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => void loadEditor(), 1500)
    return () => window.clearTimeout(timer)
  }, [])

  async function logout() {
    if (!await mayLeave()) return
    try { await api.post('/logout') } catch { /* the session ends locally either way */ }
    sessionStore.signedOut()
    client.clear()
  }

  return <div className="shell">
    <a href="#main" className="skip-link">Langsung ke konten</a>
    <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark">JL</span><span><strong>Jelajah Lokal</strong><small>Editorial</small></span></div>
      <nav aria-label="Navigasi utama">
        {nav.map(group => <div key={group.group} className="nav-group">
          <span className="nav-group-label">{group.group}</span>
          {group.items.map(item => {
            const active = path === item.to || path.startsWith(`${item.to}/`)
            const Icon = item.icon
            return <Link key={item.to} to={item.to} onClick={() => setNavOpen(false)} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
              <Icon size={18} />{item.label}
              {item.to === '/assistant' && usage.data && <span className="nav-badge" title="Sisa proses AI hari ini">{usage.data.enabled ? `${usage.data.remaining}/${usage.data.limit}` : 'off'}</span>}
            </Link>
          })}
        </div>)}
      </nav>
      <div className="sidebar-footer">
        <span className="avatar avatar-fallback">{session.principal.username.slice(0, 1).toUpperCase()}</span>
        <span className="who"><strong>{session.principal.username}</strong><small>{session.principal.role === 'admin' ? 'Administrator' : 'Editor'}</small></span>
        <button type="button" className="icon-button" aria-label="Keluar" title="Keluar" onClick={() => void logout()}><LogOut size={18} /></button>
      </div>
    </aside>
    {navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}
    <div className="main">
      <header className="mobile-bar">
        <button type="button" className="icon-button" aria-label="Buka navigasi" onClick={() => setNavOpen(true)}><Menu size={20} /></button>
        <span className="brand"><span className="brand-mark">JL</span><strong>Jelajah Lokal</strong></span>
      </header>
      {!online && <div className="offline-bar" role="status"><WifiOff size={16} />Anda sedang offline. Perubahan tetap tersimpan di perangkat ini sampai Anda bisa menyimpan lagi.</div>}
      <main id="main" tabIndex={-1}><Suspense fallback={<div className="page"><Skeleton rows={6} /></div>}><Page path={path} /></Suspense></main>
    </div>
    <Dialog open={expired} onClose={() => undefined} dismissible={false} size="sm" title="Sesi berakhir" description="Masuk kembali untuk melanjutkan. Isian di halaman ini tetap utuh.">
      <LoginForm presetUsername={session.principal.username} onDone={() => void client.invalidateQueries()} />
    </Dialog>
  </div>
}

export default function App() {
  const { session, checked } = useSession()
  useEffect(() => {
    let active = true
    api.get<{ data: Session }>('/session')
      .then(r => { if (active) sessionStore.signedIn(r.data) })
      .catch(() => { if (active) sessionStore.signedOut() })
    return () => { active = false }
  }, [])

  return <>
    {!checked ? <div className="login-screen"><Spinner size={24} /></div> : session ? <Shell session={session} /> : <LoginScreen />}
    <FeedbackHost />
  </>
}
