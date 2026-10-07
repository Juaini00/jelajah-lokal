import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

/* Dialog — native <dialog> modal: focus trap, Escape, inert background for free. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', variant = 'center', busy = false, dismissible = true }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'; variant?: 'center' | 'sheet'; busy?: boolean; dismissible?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const pressedBackdrop = useRef(false)
  const canClose = dismissible && !busy
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return <dialog
    ref={ref}
    className={`dialog dialog-${size} dialog-${variant}`}
    aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (canClose) onClose() }}
    // Close only when the press both starts and ends on the backdrop (a text-selection drag must not dismiss).
    onMouseDown={event => { pressedBackdrop.current = event.target === ref.current }}
    onClick={event => { if (pressedBackdrop.current && event.target === ref.current && canClose) onClose() }}
  >
    {open && <div className="dialog-frame">
      <header className="dialog-header">
        <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
        {dismissible && <button type="button" className="icon-button" aria-label="Tutup" disabled={busy} onClick={onClose}><X size={18} /></button>}
      </header>
      {children && <div className="dialog-body">{children}</div>}
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </div>}
  </dialog>
}

/* confirm() — promise-based replacement for window.confirm, rendered by <FeedbackHost/>. */
interface ConfirmRequest {
  title: string; message?: ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: 'danger' | 'primary'
  resolve: (value: boolean) => void
}
let pendingConfirm: ConfirmRequest | null = null

/* Toasts */
export interface Toast { id: number; tone: 'success' | 'error' | 'info'; title: string; detail?: string }
let toasts: Toast[] = []
let nextId = 1

const listeners = new Set<() => void>()
let version = 0
const emit = () => { version += 1; listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function confirm(request: Omit<ConfirmRequest, 'resolve'>) {
  pendingConfirm?.resolve(false)
  return new Promise<boolean>(resolve => { pendingConfirm = { ...request, resolve }; emit() })
}

function dismiss(id: number) { toasts = toasts.filter(t => t.id !== id); emit() }
function push(tone: Toast['tone'], title: string, detail?: string) {
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, tone, title, detail }]
  emit()
  window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000)
}
export const toast = {
  success: (title: string, detail?: string) => push('success', title, detail),
  error: (title: string, detail?: string) => push('error', title, detail),
  info: (title: string, detail?: string) => push('info', title, detail),
}

const toastIcon = { success: CheckCircle2, error: XCircle, info: Info }

export function FeedbackHost() {
  useSyncExternalStore(subscribe, () => version)
  const request = pendingConfirm
  const settle = (value: boolean) => { request?.resolve(value); pendingConfirm = null; emit() }
  return <>
    <Dialog open={!!request} onClose={() => settle(false)} size="sm" title={<span className="confirm-title">{request?.tone === 'danger' && <AlertTriangle size={20} />}{request?.title}</span>}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={() => settle(false)}>{request?.cancelLabel ?? 'Batal'}</button>
        <button type="button" className={`btn ${request?.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} autoFocus onClick={() => settle(true)}>{request?.confirmLabel ?? 'Lanjutkan'}</button>
      </>}>
      {request?.message && <div className="confirm-message">{request.message}</div>}
    </Dialog>
    <div className="toaster" role="region" aria-label="Notifikasi">
      {toasts.map(t => {
        const Icon = toastIcon[t.tone]
        return <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
          <Icon size={18} />
          <div><strong>{t.title}</strong>{t.detail && <p>{t.detail}</p>}</div>
          <button type="button" className="icon-button" aria-label="Tutup notifikasi" onClick={() => dismiss(t.id)}><X size={16} /></button>
        </div>
      })}
    </div>
  </>
}

/** Debounced "has the user been idle" helper for search inputs. */
export function useDebounced<T>(value: T, delay = 200) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}
