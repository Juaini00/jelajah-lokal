import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertCircle, ArrowRight, Loader2, RefreshCw, X } from 'lucide-react'
import { describeError, type FieldIssue } from '../lib/api'
import { codePoints, fieldId, labelFor } from '../lib/validation'

export function Field({ path, label, hint, error, counter, badge, children, className = '' }: {
  path: string; label: ReactNode; hint?: ReactNode; error?: string; badge?: ReactNode
  counter?: { value: string; min?: number; max: number }; children: ReactNode; className?: string
}) {
  const length = counter ? codePoints(counter.value) : 0
  const tone = !counter ? '' : length > counter.max ? 'over' : counter.min && length > 0 && length < counter.min ? 'under' : length >= (counter.min ?? 0) && length > 0 ? 'ok' : ''
  return <div className={`field ${error ? 'has-error' : ''} ${className}`}>
    <div className="field-label">
      <label htmlFor={fieldId(path)}>{label}</label>
      {badge}
      {counter && <span className={`counter ${tone}`} aria-live="polite">{length}{counter.min ? ` / ${counter.min}–${counter.max}` : ` / ${counter.max}`}</span>}
    </div>
    {children}
    {error ? <p className="field-error" id={`${fieldId(path)}-error`}><AlertCircle size={14} />{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
  </div>
}

export const RequiredBadge = () => <span className="req-badge" title="Wajib sebelum terbit">Wajib terbit</span>

/** Error banner with plain-language guidance and one-click jumps to every offending field. */
export function ErrorBanner({ error, onRetry, onJump, onDismiss }: { error: unknown; onRetry?: () => void; onJump?: (field: string) => void; onDismiss?: () => void }) {
  if (!error) return null
  const { title, detail, error: apiError } = describeError(error)
  const fields: FieldIssue[] = apiError?.fields ?? []
  return <div className="banner banner-error" role="alert">
    <AlertCircle size={20} />
    <div className="banner-content">
      <strong>{title}</strong>
      {detail && !fields.length && <p>{detail}</p>}
      {fields.length > 0 && <ul className="issue-list">
        {fields.map(issue => <li key={`${issue.field}:${issue.message}`}>
          {onJump ? <button type="button" className="issue-link" onClick={() => onJump(issue.field)}><span><b>{labelFor(issue.field)}</b> — {issue.message}</span><ArrowRight size={14} /></button> : <span><b>{labelFor(issue.field)}</b> — {issue.message}</span>}
        </li>)}
      </ul>}
      {apiError?.requestId && <small className="ref">Kode {apiError.code} · Ref {apiError.requestId.slice(0, 8)}</small>}
    </div>
    <div className="banner-actions">
      {onRetry && <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}><RefreshCw size={14} />Coba lagi</button>}
      {onDismiss && <button type="button" className="icon-button" aria-label="Tutup pesan" onClick={onDismiss}><X size={16} /></button>}
    </div>
  </div>
}

export const Spinner = ({ size = 16 }: { size?: number }) => <Loader2 size={size} className="spin" aria-hidden />

export function Skeleton({ rows = 5, height = 52 }: { rows?: number; height?: number }) {
  return <div className="skeleton-list" aria-busy="true" aria-label="Memuat">
    {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height }} />)}
  </div>
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {action}
  </div>
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
}

export function Switch({ id, checked, onChange, label, description }: { id: string; checked: boolean; onChange: (value: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return <label className="switch-row" htmlFor={id}>
    <span className="switch"><input id={id} type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} /><span aria-hidden /></span>
    <span><span className="switch-label">{label}</span>{description && <small>{description}</small>}</span>
  </label>
}

/** Chip input: Enter or comma commits, Backspace on empty removes the last chip. */
export function TagInput({ id, value, onChange, max, invalid }: { id: string; value: string[]; onChange: (tags: string[]) => void; max: number; invalid?: boolean }) {
  const [text, setText] = useState('')
  const hintId = useId()
  function commit(raw = text) {
    const next = raw.split(',').map(t => t.trim()).filter(Boolean)
    if (next.length) onChange([...value, ...next])
    setText('')
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); commit() }
    else if (event.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1))
  }
  return <div className={`tag-input ${invalid ? 'invalid' : ''}`} onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
    {value.map((tag, i) => <span className="chip" key={`${tag}-${i}`}>{tag}<button type="button" aria-label={`Hapus tag ${tag}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><X size={12} /></button></span>)}
    <input id={id} value={text} aria-describedby={hintId} placeholder={value.length >= max ? '' : value.length ? 'Tambah tag…' : 'Ketik tag lalu Enter'} onChange={e => { if (e.target.value.endsWith(',')) commit(e.target.value); else setText(e.target.value) }} onKeyDown={onKey} onBlur={() => commit()} />
    <span id={hintId} className="sr-only">Tekan Enter atau koma untuk menambahkan tag.</span>
  </div>
}
