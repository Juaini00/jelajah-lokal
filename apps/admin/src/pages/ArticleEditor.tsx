import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarCheck, Check, ChevronRight, Circle, CircleCheck, EyeOff, GitMerge, Lock, MoreHorizontal, Plus, RotateCcw, Save, Send, Sparkles, Trash2, TriangleAlert, Wand2, X } from 'lucide-react'
import { AiPanel, type AiControls } from '../editor/AiPanel'
import { BodyEditor, type BodyEditorHandle } from '../editor/BodyEditor'
import { api, isApiError, type FieldIssue } from '../lib/api'
import { formatDate, timeAgo } from '../lib/format'
import { dropArticle, storeArticle, useArticle, useAuthors, useCategories } from '../lib/queries'
import { Link, navigate, useLeaveGuard } from '../lib/router'
import { changedKeys, pickWriting, writingKeys, type Article, type Media, type Writing, type WritingKey } from '../lib/types'
import { LIMITS, fieldId, fieldLabels, focusField, labelFor, publishChecklist, saveIssues, slugify, tagIssue, type CheckItem } from '../lib/validation'
import { confirm, Dialog, toast } from '../ui/feedback'
import { ErrorBanner, Field, RequiredBadge, Skeleton, Spinner, Switch, TagInput } from '../ui/controls'
import { MediaField } from '../ui/media'

export function ArticleEditorPage({ id }: { id: string }) {
  const query = useArticle(id)
  if (query.data) return <ArticleEditor key={id} server={query.data} />
  if (query.error) return <div className="page">
    <Link to="/articles" className="back-link"><ArrowLeft size={16} />Semua artikel</Link>
    <ErrorBanner error={query.error} onRetry={isApiError(query.error, 'ARTICLE_NOT_FOUND') ? undefined : () => void query.refetch()} />
  </div>
  return <div className="page"><Skeleton rows={1} height={44} /><div className="editor-grid"><Skeleton rows={6} height={64} /><Skeleton rows={4} height={96} /></div></div>
}

/** Re-render on an interval so relative times ("2 menit lalu") stay true. */
function useNow(interval = 30_000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), interval); return () => window.clearInterval(t) }, [interval])
  return now
}

interface Recovery { revision: number; base: Writing; draft: Writing; at: number }
const recoveryKey = (id: string) => `jelajah-admin:recovery:${id}`
function readRecovery(id: string): Recovery | null {
  try { return JSON.parse(localStorage.getItem(recoveryKey(id)) ?? 'null') as Recovery | null } catch { return null }
}

/** Keep fields the editor changed relative to `base`; take everything else from `latest`. */
function merge(base: Writing, mine: Writing, latest: Writing): Writing {
  const mineChanged = new Set(changedKeys(mine, base))
  return Object.fromEntries(writingKeys.map(key => [key, mineChanged.has(key) ? mine[key] : latest[key]])) as Writing
}

type Busy = null | 'save' | 'publish' | 'unpublish' | 'delete'

function ArticleEditor({ server }: { server: Article }) {
  const id = server.documentId
  const client = useQueryClient()
  const categories = useCategories()
  const authors = useAuthors()
  const now = useNow()

  const [baseline, setBaseline] = useState(server)
  const [draft, setDraft] = useState<Writing>(() => pickWriting(server))
  const [bodyKey, setBodyKey] = useState(0)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<unknown>(null)
  const [serverIssues, setServerIssues] = useState<FieldIssue[]>([])
  const [publishAttempted, setPublishAttempted] = useState(false)
  const [conflict, setConflict] = useState<Article | null>(null)
  const [remote, setRemote] = useState<Article | null>(null)
  const [recovery, setRecovery] = useState<Recovery | null>(() => {
    const entry = readRecovery(id)
    return entry && changedKeys(entry.draft, pickWriting(server)).length ? entry : null
  })
  const [autoSlug, setAutoSlug] = useState(() => !server.slug && !server.publishedAt)
  const [menuOpen, setMenuOpen] = useState(false)

  const saved = useMemo(() => pickWriting(baseline), [baseline])
  const changed = useMemo(() => changedKeys(draft, saved), [draft, saved])
  const dirty = changed.length > 0
  const localIssues = useMemo(() => saveIssues(draft), [draft])
  const checklist = useMemo(() => publishChecklist(draft), [draft])
  const missing = checklist.filter(item => !item.ok)
  const published = !!baseline.publishedAt
  const liveIsCurrent = published && baseline.publishedRevision === baseline.revision
  useLeaveGuard(dirty)

  const adopt = useCallback((article: Article) => {
    setBaseline(article); setDraft(pickWriting(article)); setBodyKey(k => k + 1)
    setServerIssues([]); setConflict(null); setRemote(null); setError(null)
  }, [])

  /* Sync with the query cache: the server copy may change behind us (another tab, Assistant apply, refetch on focus).
     Clean editor → adopt silently; unsaved edits → offer a merge instead of letting the next save fail. */
  useEffect(() => {
    if (busy || server.updatedAt <= baseline.updatedAt) return
    if (server.revision === baseline.revision) setBaseline(server)
    else if (!dirty) { adopt(server); toast.info(`Draft diperbarui ke r${server.revision}`, 'Versi terbaru dimuat dari server.') }
    else setRemote(server)
  }, [server, baseline, dirty, busy, adopt])

  /* Crash/close recovery: mirror unsaved edits to localStorage. */
  useEffect(() => {
    if (!dirty) { localStorage.removeItem(recoveryKey(id)); return }
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(recoveryKey(id), JSON.stringify({ revision: baseline.revision, base: saved, draft, at: Date.now() } satisfies Recovery)) } catch { /* storage full or disabled: recovery is best-effort */ }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, saved, baseline.revision, id])

  const update = useCallback(<K extends WritingKey>(key: K, value: Writing[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    setServerIssues(issues => issues.filter(issue => issue.field.split('.')[0] !== key))
  }, [])
  const onBody = useCallback((body: Writing['body']) => update('body', body), [update])

  function errorFor(path: string): string | undefined {
    return serverIssues.find(i => i.field === path)?.message
      ?? localIssues.find(i => i.field === path)?.message
      ?? (publishAttempted ? missing.find(i => i.field === path)?.message : undefined)
  }

  function report(issues: { field: string; message: string }[], title: string) {
    focusField(issues[0].field)
    toast.error(title, issues.slice(0, 3).map(i => `${labelFor(i.field)}: ${i.message}`).join(' · ') + (issues.length > 3 ? ` · +${issues.length - 3} lainnya` : ''))
  }

  async function handleFailure(failure: unknown) {
    if (isApiError(failure, 'ARTICLE_CHANGED')) {
      try { setConflict((await api.get<{ data: Article }>(`/articles/${id}`)).data) } catch (e) { setError(e) }
      return
    }
    if (isApiError(failure) && failure.fields.length) {
      setServerIssues(failure.fields)
      if (failure.code === 'PUBLISH_VALIDATION_FAILED') setPublishAttempted(true)
    }
    setError(failure)
    if (isApiError(failure) && failure.fields.length) focusField(failure.fields[0].field)
  }

  async function save(): Promise<Article | null> {
    if (localIssues.length) { report(localIssues, `${localIssues.length} isian perlu diperbaiki sebelum menyimpan`); return null }
    const sent = draft
    setBusy('save'); setError(null)
    try {
      const { data } = await api.patch<{ data: Article }>(`/articles/${id}`, { revision: baseline.revision, ...sent })
      storeArticle(client, data)
      setBaseline(data)
      // Keep anything typed while the request was in flight.
      setDraft(current => (current === sent ? pickWriting(data) : current))
      setServerIssues([]); setRecovery(null)
      return data
    } catch (failure) {
      await handleFailure(failure)
      return null
    } finally { setBusy(null) }
  }

  async function saveWithToast() {
    if (!dirty) return
    if (await save()) toast.success('Draft tersimpan', published ? 'Versi publik belum berubah sampai Anda menerbitkan.' : undefined)
  }

  async function publish() {
    setPublishAttempted(true)
    if (missing.length) { report(missing.map(m => ({ field: m.field, message: m.message })), `${missing.length} syarat terbit belum terpenuhi`); return }
    if (localIssues.length) { report(localIssues, 'Perbaiki isian sebelum menerbitkan'); return }
    const go = await confirm({
      title: published ? 'Terbitkan perubahan terbaru?' : 'Terbitkan artikel ini?',
      message: <>{dirty && <p>Perubahan Anda akan disimpan terlebih dahulu.</p>}<p>{published ? 'Versi publik akan diganti dengan draft ini.' : 'Artikel akan langsung tampil di situs publik dan sitemap.'}</p></>,
      confirmLabel: dirty ? 'Simpan & terbitkan' : 'Terbitkan',
    })
    if (!go) return
    let current: Article | null = baseline
    if (dirty) current = await save()
    if (!current) return
    setBusy('publish'); setError(null)
    try {
      const { data } = await api.post<{ data: Article }>(`/articles/${id}/publish`, { revision: current.revision })
      storeArticle(client, data); setBaseline(data); setServerIssues([])
      toast.success(published ? 'Perubahan diterbitkan' : 'Artikel terbit', 'Langsung tampil di situs publik.')
    } catch (failure) { await handleFailure(failure) } finally { setBusy(null) }
  }

  async function unpublish() {
    setMenuOpen(false)
    if (!await confirm({ title: 'Tarik artikel dari publik?', message: 'Artikel hilang dari situs publik dan sitemap. Draft tetap tersimpan dan bisa diterbitkan lagi.', confirmLabel: 'Tarik dari publik', tone: 'danger' })) return
    setBusy('unpublish'); setError(null)
    try {
      const { data } = await api.post<{ data: Article }>(`/articles/${id}/unpublish`, { revision: baseline.revision })
      storeArticle(client, data); setBaseline(data)
      toast.success('Artikel ditarik dari publik', 'Draft tetap tersedia.')
    } catch (failure) { await handleFailure(failure) } finally { setBusy(null) }
  }

  async function remove() {
    setMenuOpen(false)
    if (!await confirm({ title: 'Hapus draft ini secara permanen?', message: `"${draft.title || 'Draft tanpa judul'}" beserta semua isinya akan dihapus. Tindakan ini tidak dapat dibatalkan.`, confirmLabel: 'Hapus permanen', tone: 'danger' })) return
    setBusy('delete'); setError(null)
    try {
      await api.delete(`/articles/${id}`)
      localStorage.removeItem(recoveryKey(id))
      dropArticle(client, id)
      toast.success('Draft dihapus')
      void navigate('/articles', { force: true })
    } catch (failure) { await handleFailure(failure); setBusy(null) }
  }

  /* Inline AI: generation reads the saved draft, so pending edits are saved first. */
  const aiControls = useRef<AiControls>(null)
  const bodyHandle = useRef<BodyEditorHandle>(null)
  const ensureSaved = async () => (dirty ? save() : baseline)
  const showAi = () => document.getElementById('ai-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  function onAiApplied(article: Article) {
    storeArticle(client, article)
    adopt(article)
  }
  function onAiInsert(values: Partial<Pick<Writing, 'excerpt' | 'metaDescription' | 'tags'>>) {
    for (const [key, value] of Object.entries(values) as [WritingKey, Writing[WritingKey]][]) update(key, value)
  }
  function markOperational() {
    update('operationalClaims', true)
    requestAnimationFrame(() => focusField('informationCheckedAt'))
  }

  /* ⌘/Ctrl+S saves from anywhere on the page. */
  const saveRef = useRef(saveWithToast)
  useLayoutEffect(() => { saveRef.current = saveWithToast })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function restoreRecovery() {
    if (!recovery) return
    const next = recovery.revision === baseline.revision ? recovery.draft : merge(recovery.base, recovery.draft, saved)
    setDraft(next); setBodyKey(k => k + 1); setRecovery(null)
    toast.info('Perubahan lokal dipulihkan', recovery.revision === baseline.revision ? 'Tinjau lalu simpan.' : `Digabung dengan versi server r${baseline.revision}. Tinjau sebelum menyimpan.`)
  }

  function resolveConflict(mode: 'merge' | 'server') {
    const latest = conflict ?? remote
    if (!latest) return
    if (mode === 'server') { adopt(latest); toast.info('Versi server dimuat', 'Perubahan lokal dibuang.'); return }
    const merged = merge(saved, draft, pickWriting(latest))
    setBaseline(latest); setDraft(merged); setBodyKey(k => k + 1); setConflict(null); setRemote(null); setError(null)
    toast.info('Perubahan digabung', 'Tinjau hasilnya lalu simpan.')
  }

  function setTitle(title: string) {
    update('title', title)
    if (autoSlug) update('slug', slugify(title))
  }

  function pickCover(media: Media | null) {
    update('coverMediaDocumentId', media?.documentId ?? null)
    // Prefill attribution from the media library so credits are not retyped.
    if (media && !draft.imageCredit && media.credit) update('imageCredit', media.credit)
    if (media && !draft.imageSourceUrl && media.sourceUrl) update('imageSourceUrl', media.sourceUrl)
  }

  const conflictSource = conflict ?? remote
  const status = !published ? { label: 'Draft', tone: 'neutral' } : liveIsCurrent ? { label: 'Terbit', tone: 'success' } : { label: 'Terbit · ada perubahan', tone: 'warning' }
  const saveState = busy === 'save' ? <><Spinner size={14} />Menyimpan…</> : dirty ? <><span className="dot dot-warning" />Belum disimpan</> : <><Check size={14} />Tersimpan {timeAgo(baseline.updatedAt, now)}</>
  const busyAny = busy !== null

  return <div className="page page-editor">
    <div className="editor-topbar">
      <Link to="/articles" className="icon-button" aria-label="Kembali ke daftar artikel"><ArrowLeft size={18} /></Link>
      <div className="topbar-title">
        <span className="crumb">Artikel <ChevronRight size={14} /></span>
        <strong>{draft.title || 'Draft tanpa judul'}</strong>
      </div>
      <span className={`badge badge-${status.tone}`}>{status.label}</span>
      <span className="save-state" role="status" aria-live="polite">{saveState}</span>
      <div className="topbar-actions">
        <button type="button" className="btn btn-ghost hide-sm ai-trigger" onClick={showAi}><Sparkles size={16} />Asisten AI</button>
        <button type="button" className="btn btn-secondary" onClick={() => void saveWithToast()} disabled={busyAny || !dirty} title="Simpan draft (⌘/Ctrl+S)"><Save size={16} />Simpan</button>
        <button type="button" className="btn btn-primary" onClick={() => void publish()} disabled={busyAny || (liveIsCurrent && !dirty)}>
          {busy === 'publish' ? <Spinner /> : <Send size={16} />}
          {liveIsCurrent && !dirty ? 'Sudah terbit' : published ? 'Terbitkan perubahan' : 'Terbitkan'}
          {missing.length > 0 && <span className="count-pill" title={`${missing.length} syarat belum terpenuhi`}>{missing.length}</span>}
        </button>
        <div className="menu">
          <button type="button" className="icon-button" aria-label="Tindakan lain" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}><MoreHorizontal size={18} /></button>
          {menuOpen && <>
            <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
            <div className="menu-list" role="menu">
              <button type="button" role="menuitem" className="show-sm" onClick={() => { setMenuOpen(false); showAi() }}><Sparkles size={16} />Asisten AI</button>
              {dirty && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void confirm({ title: 'Buang semua perubahan?', message: 'Isian kembali ke versi tersimpan terakhir.', confirmLabel: 'Buang perubahan', tone: 'danger' }).then(ok => { if (ok) adopt(baseline) }) }}><RotateCcw size={16} />Buang perubahan</button>}
              {published
                ? <button type="button" role="menuitem" className="danger" onClick={() => void unpublish()} disabled={dirty}><EyeOff size={16} />Tarik dari publik{dirty ? ' (simpan dulu)' : ''}</button>
                : <button type="button" role="menuitem" className="danger" onClick={() => void remove()}><Trash2 size={16} />Hapus draft</button>}
            </div>
          </>}
        </div>
      </div>
    </div>

    {recovery && <div className="banner banner-info" role="status">
      <RotateCcw size={20} />
      <div className="banner-content"><strong>Ada perubahan yang belum tersimpan dari {timeAgo(recovery.at, now)}.</strong><p>Kemungkinan halaman tertutup sebelum Anda menyimpan.{recovery.revision !== baseline.revision ? ` Draft server sudah berubah (r${recovery.revision} → r${baseline.revision}); pemulihan akan digabung.` : ''}</p></div>
      <div className="banner-actions">
        <button type="button" className="btn btn-sm btn-primary" onClick={restoreRecovery}>Pulihkan</button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { localStorage.removeItem(recoveryKey(id)); setRecovery(null) }}>Buang</button>
      </div>
    </div>}
    {remote && !conflict && <div className="banner banner-warning" role="status">
      <TriangleAlert size={20} />
      <div className="banner-content"><strong>Draft ini diubah di tempat lain (r{remote.revision}).</strong><p>Menyimpan sekarang akan ditolak. Gabungkan agar perubahan Anda tetap aman.</p></div>
      <div className="banner-actions"><button type="button" className="btn btn-sm btn-primary" onClick={() => setConflict(remote)}><GitMerge size={14} />Tinjau</button></div>
    </div>}
    <ErrorBanner error={isApiError(error, 'ARTICLE_CHANGED') ? null : error} onJump={focusField} onDismiss={() => setError(null)} />

    <div className="editor-grid">
      <main className="editor-main">
        <div className={`field title-field ${errorFor('title') ? 'has-error' : ''}`}>
          <AutoTextarea id={fieldId('title')} className="title-input" value={draft.title} placeholder="Judul artikel" maxLength={LIMITS.title[1]} onChange={setTitle} aria-label="Judul artikel" aria-invalid={!!errorFor('title')} />
          <div className="title-meta">
            {errorFor('title') ? <p className="field-error">{errorFor('title')}</p> : <span className="field-hint">{LIMITS.title[0]}–{LIMITS.title[1]} karakter untuk terbit</span>}
            <span className={`counter ${draft.title.length && Array.from(draft.title).length < LIMITS.title[0] ? 'under' : ''}`}>{Array.from(draft.title).length} / {LIMITS.title[1]}</span>
          </div>
        </div>

        <div className={`field slug-field ${errorFor('slug') ? 'has-error' : ''}`}>
          <label htmlFor={fieldId('slug')} className="slug-row">
            <span className="slug-prefix">/panduan/</span>
            <input id={fieldId('slug')} value={draft.slug} readOnly={published} placeholder="slug-artikel" aria-invalid={!!errorFor('slug')}
              onChange={e => { setAutoSlug(false); update('slug', e.target.value.toLowerCase().replace(/\s+/g, '-')) }} />
            {published ? <span className="slug-lock" title="Slug artikel terbit tidak dapat diubah"><Lock size={14} /></span>
              : <button type="button" className={`btn btn-sm ${autoSlug ? 'btn-soft' : 'btn-ghost'}`} title="Buat slug dari judul" onClick={() => { setAutoSlug(true); update('slug', slugify(draft.title)) }}><Wand2 size={14} />{autoSlug ? 'Otomatis' : 'Dari judul'}</button>}
          </label>
          {errorFor('slug') ? <p className="field-error">{errorFor('slug')}</p> : published && <p className="field-hint">Slug terkunci karena artikel pernah terbit — tautan lama tetap berfungsi.</p>}
        </div>

        <BodyEditor key={bodyKey} value={draft.body} onChange={onBody} invalid={!!errorFor('body')} handle={bodyHandle} />
        {errorFor('body') && <p className="field-error standalone">{errorFor('body')}</p>}

        <section className="card">
          <header className="card-header">
            <div><h2>Ringkasan & SEO</h2><p>Tampil di kartu artikel dan hasil pencarian.</p></div>
            <button type="button" className="btn btn-sm btn-soft" onClick={() => aiControls.current?.suggest()} disabled={busyAny}><Sparkles size={14} />Usulkan dengan AI</button>
          </header>
          <Field path="excerpt" label="Ringkasan" badge={<RequiredBadge />} error={errorFor('excerpt')} counter={{ value: draft.excerpt, min: LIMITS.excerpt[0], max: LIMITS.excerpt[1] }} hint="1–2 kalimat yang membuat pembaca ingin membuka artikel.">
            <AutoTextarea id={fieldId('excerpt')} value={draft.excerpt} onChange={v => update('excerpt', v)} rows={3} />
          </Field>
          <Field path="metaDescription" label="Deskripsi SEO" badge={<RequiredBadge />} error={errorFor('metaDescription')} counter={{ value: draft.metaDescription, min: LIMITS.metaDescription[0], max: LIMITS.metaDescription[1] }} hint="Ditampilkan mesin pencari di bawah judul.">
            <AutoTextarea id={fieldId('metaDescription')} value={draft.metaDescription} onChange={v => update('metaDescription', v)} rows={2} />
          </Field>
          <div className="serp" aria-label="Pratinjau hasil pencarian">
            <small>jelajahlokal · panduan › {draft.slug || 'slug-artikel'}</small>
            <strong>{draft.title || 'Judul artikel'}</strong>
            <p>{draft.metaDescription || 'Deskripsi SEO akan tampil di sini.'}</p>
          </div>
          <Field path="tags" label="Tag" error={errorFor('tags') ?? (tagIssue(draft.tags) || undefined)} hint={`Opsional · maksimal ${LIMITS.tags} tag, ${LIMITS.tag[0]}–${LIMITS.tag[1]} karakter.`}>
            <TagInput id={fieldId('tags')} value={draft.tags} onChange={v => update('tags', v)} max={LIMITS.tags} invalid={!!errorFor('tags')} />
          </Field>
        </section>

        <section className="card">
          <header className="card-header"><div><h2>Sumber & verifikasi</h2><p>Bantu pembaca menilai keakuratan informasi.</p></div></header>
          <Switch id="field-operationalClaims" checked={draft.operationalClaims} onChange={v => update('operationalClaims', v)} label="Artikel memuat harga, jam buka, atau info operasional" description="Wajib mencantumkan tanggal Anda memeriksanya." />
          <Field path="informationCheckedAt" label="Tanggal informasi diperiksa" badge={draft.operationalClaims ? <RequiredBadge /> : undefined} error={errorFor('informationCheckedAt')} hint="Isi hanya setelah benar-benar memeriksa sumbernya.">
            <input id={fieldId('informationCheckedAt')} type="date" max={new Date().toLocaleDateString('sv-SE')} value={draft.informationCheckedAt?.slice(0, 10) ?? ''} onChange={e => update('informationCheckedAt', e.target.value || null)} />
          </Field>
          <div className="sources" id={fieldId('sourceLinks')}>
            <div className="field-label"><span>Sumber informasi</span><span className="counter">{draft.sourceLinks.length} / 30</span></div>
            {draft.sourceLinks.length === 0 && <p className="muted">Belum ada sumber. Tambahkan situs resmi atau rujukan yang Anda gunakan.</p>}
            {draft.sourceLinks.map((source, i) => {
              const set = (patch: Partial<typeof source>) => update('sourceLinks', draft.sourceLinks.map((s, j) => (j === i ? { ...s, ...patch } : s)))
              return <div className="source-row" key={i}>
                <span className="source-index">{i + 1}</span>
                <Field path={`sourceLinks.${i}.label`} label="Nama sumber" error={errorFor(`sourceLinks.${i}.label`)}><input id={fieldId(`sourceLinks.${i}.label`)} value={source.label} maxLength={120} placeholder="mis. Dinas Pariwisata NTB" onChange={e => set({ label: e.target.value })} /></Field>
                <Field path={`sourceLinks.${i}.url`} label="URL" error={errorFor(`sourceLinks.${i}.url`)}><input id={fieldId(`sourceLinks.${i}.url`)} type="url" value={source.url} placeholder="https://" onChange={e => set({ url: e.target.value.trim() })} /></Field>
                <Field path={`sourceLinks.${i}.accessedAt`} label="Diakses"><input id={fieldId(`sourceLinks.${i}.accessedAt`)} type="date" value={source.accessedAt?.slice(0, 10) ?? ''} onChange={e => set({ accessedAt: e.target.value || null })} /></Field>
                <button type="button" className="icon-button danger" aria-label={`Hapus sumber ${i + 1}`} onClick={() => update('sourceLinks', draft.sourceLinks.filter((_, j) => j !== i))}><X size={16} /></button>
              </div>
            })}
            <button type="button" className="btn btn-sm btn-secondary" disabled={draft.sourceLinks.length >= 30} onClick={() => {
              update('sourceLinks', [...draft.sourceLinks, { label: '', url: '', accessedAt: new Date().toLocaleDateString('sv-SE') }])
              requestAnimationFrame(() => focusField(`sourceLinks.${draft.sourceLinks.length}.label`))
            }}><Plus size={14} />Tambah sumber</button>
          </div>
        </section>
      </main>

      <aside className="editor-side">
        <Readiness items={checklist} published={liveIsCurrent && !dirty} onAiFill={() => aiControls.current?.suggest()} />
        <AiPanel controls={aiControls} article={baseline} draft={draft} dirty={dirty} ensureSaved={ensureSaved}
          onApplied={onAiApplied} onInsert={onAiInsert} onHighlight={quote => bodyHandle.current?.highlight(quote) ?? false} onMarkOperational={markOperational} />

        <section className="card">
          <header className="card-header"><h2>Pengaturan</h2></header>
          <Field path="categoryDocumentId" label="Kategori" badge={<RequiredBadge />} error={errorFor('categoryDocumentId')}
            hint={categories.data?.length === 0 ? <>Belum ada kategori. <Link to="/categories">Buat kategori</Link></> : undefined}>
            <select id={fieldId('categoryDocumentId')} value={draft.categoryDocumentId ?? ''} onChange={e => update('categoryDocumentId', e.target.value || null)} disabled={categories.isPending}>
              <option value="">{categories.isPending ? 'Memuat…' : 'Pilih kategori'}</option>
              {categories.data?.map(c => <option key={c.documentId} value={c.documentId}>{c.name}</option>)}
            </select>
          </Field>
          <Field path="authorDocumentId" label="Penulis publik" badge={<RequiredBadge />} error={errorFor('authorDocumentId')}
            hint={authors.data?.length === 0 ? <>Belum ada penulis. <Link to="/authors">Buat profil penulis</Link></> : undefined}>
            <select id={fieldId('authorDocumentId')} value={draft.authorDocumentId ?? ''} onChange={e => update('authorDocumentId', e.target.value || null)} disabled={authors.isPending}>
              <option value="">{authors.isPending ? 'Memuat…' : 'Pilih penulis'}</option>
              {authors.data?.map(a => <option key={a.documentId} value={a.documentId}>{a.name}</option>)}
            </select>
          </Field>
          <Field path="regionLabel" label="Wilayah" error={errorFor('regionLabel')} counter={{ value: draft.regionLabel, max: LIMITS.region }}>
            <input id={fieldId('regionLabel')} value={draft.regionLabel} placeholder="mis. Lombok, NTB" onChange={e => update('regionLabel', e.target.value)} />
          </Field>
          <Switch id={fieldId('featured')} checked={draft.featured} onChange={v => update('featured', v)} label="Artikel unggulan" description="Ditampilkan menonjol di beranda." />
        </section>

        <section className={`card ${errorFor('coverMediaDocumentId') || errorFor('coverAlt') ? 'has-error' : ''}`}>
          <header className="card-header"><h2>Gambar sampul</h2><RequiredBadge /></header>
          <MediaField id={fieldId('coverMediaDocumentId')} mediaId={draft.coverMediaDocumentId} onChange={pickCover} emptyLabel="Pilih gambar sampul" invalid={!!errorFor('coverMediaDocumentId')} />
          {errorFor('coverMediaDocumentId') && <p className="field-error">{errorFor('coverMediaDocumentId')}</p>}
          <Field path="coverAlt" label="Teks alternatif" badge={<RequiredBadge />} error={errorFor('coverAlt')} counter={{ value: draft.coverAlt, max: LIMITS.coverAlt }} hint="Deskripsikan isi gambar untuk pembaca layar.">
            <input id={fieldId('coverAlt')} value={draft.coverAlt} onChange={e => update('coverAlt', e.target.value)} placeholder="mis. Perahu nelayan di Pantai Pink saat senja" />
          </Field>
          <Field path="coverCaption" label="Keterangan" error={errorFor('coverCaption')} counter={{ value: draft.coverCaption, max: LIMITS.caption }}>
            <input id={fieldId('coverCaption')} value={draft.coverCaption} onChange={e => update('coverCaption', e.target.value)} />
          </Field>
          <Field path="imageCredit" label="Kredit foto" error={errorFor('imageCredit')}>
            <input id={fieldId('imageCredit')} value={draft.imageCredit} onChange={e => update('imageCredit', e.target.value)} />
          </Field>
          <Field path="imageSourceUrl" label="URL sumber foto" error={errorFor('imageSourceUrl')}>
            <input id={fieldId('imageSourceUrl')} type="url" value={draft.imageSourceUrl} placeholder="https://" onChange={e => update('imageSourceUrl', e.target.value.trim())} />
          </Field>
        </section>

        <section className="card status-card">
          <header className="card-header"><h2>Riwayat</h2></header>
          <dl>
            <dt>Draft</dt><dd>r{baseline.revision} · {formatDate(baseline.updatedAt)}</dd>
            <dt>Versi publik</dt><dd>{published ? `r${baseline.publishedRevision} · ${formatDate(baseline.publishedAt)}` : 'Belum pernah terbit'}</dd>
            <dt>Dibuat</dt><dd>{formatDate(baseline.createdAt)}</dd>
          </dl>
          {published && !liveIsCurrent && <p className="muted"><CalendarCheck size={14} /> Draft punya perubahan yang belum diterbitkan.</p>}
        </section>
      </aside>
    </div>

    <Dialog open={!!conflict} onClose={() => setConflict(null)} size="md" title="Artikel diubah di tempat lain"
      description={conflictSource && `Versi server sekarang r${conflictSource.revision} (${timeAgo(conflictSource.updatedAt, now)}). Tidak ada yang ditimpa.`}
      footer={<>
        <button type="button" className="btn btn-ghost danger" onClick={() => void confirm({ title: 'Buang perubahan Anda?', message: 'Semua isian lokal diganti versi server.', confirmLabel: 'Pakai versi server', tone: 'danger' }).then(ok => { if (ok) resolveConflict('server') })}>Pakai versi server</button>
        <button type="button" className="btn btn-primary" onClick={() => resolveConflict('merge')}><GitMerge size={16} />Gabungkan</button>
      </>}>
      {conflictSource && <ConflictDiff base={saved} mine={draft} latest={pickWriting(conflictSource)} />}
    </Dialog>
  </div>
}

function ConflictDiff({ base, mine, latest }: { base: Writing; mine: Writing; latest: Writing }) {
  const theirs = new Set(changedKeys(latest, base))
  const ours = new Set(changedKeys(mine, base))
  const rows = writingKeys.filter(key => theirs.has(key) || ours.has(key))
  return <>
    <p>Gabungkan mempertahankan kolom yang Anda ubah dan mengambil sisanya dari server.</p>
    <ul className="diff-list">
      {rows.map(key => <li key={key} className={theirs.has(key) && ours.has(key) ? 'both' : ''}>
        <strong>{fieldLabels[key] ?? key}</strong>
        <span>{theirs.has(key) && ours.has(key) ? 'Diubah di keduanya — versi Anda dipakai' : theirs.has(key) ? 'Diubah di server — diambil' : 'Diubah oleh Anda — dipertahankan'}</span>
      </li>)}
    </ul>
  </>
}

function Readiness({ items, published, onAiFill }: { items: CheckItem[]; published: boolean; onAiFill: () => void }) {
  const done = items.filter(i => i.ok).length
  const ready = done === items.length
  return <section className={`card readiness ${ready ? 'ready' : ''}`} aria-labelledby="readiness-title">
    <header className="card-header">
      <h2 id="readiness-title">{published ? 'Sudah terbit' : ready ? 'Siap terbit' : 'Kesiapan terbit'}</h2>
      <span className="readiness-count">{done}/{items.length}</span>
    </header>
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}><span style={{ width: `${(done / items.length) * 100}%` }} /></div>
    <ul className="checklist">
      {items.map(item => <li key={item.field} className={item.ok ? 'ok' : 'todo'}>
        <button type="button" onClick={() => focusField(item.field)}>
          {item.ok ? <CircleCheck size={16} /> : <Circle size={16} />}
          <span><b>{item.label}</b>{!item.ok && <small>{item.message}</small>}</span>
          {item.progress && !item.ok && <em>{item.progress}</em>}
        </button>
        {!item.ok && (item.field === 'excerpt' || item.field === 'metaDescription') && <button type="button" className="ai-fill" title="Usulkan dengan AI" aria-label={`Usulkan ${item.label} dengan AI`} onClick={onAiFill}><Sparkles size={14} /></button>}
      </li>)}
    </ul>
  </section>
}

function AutoTextarea({ value, onChange, className = '', rows = 1, ...rest }: { value: string; onChange: (value: string) => void; className?: string; rows?: number } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} className={`auto-textarea ${className}`} rows={rows} value={value} onChange={e => onChange(e.target.value)} {...rest} />
}
