import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { confirm } from '../ui/feedback'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())

/** Each registered guard reports whether leaving now would discard unsaved work. */
const guards = new Set<{ current: boolean }>()
const blocked = () => [...guards].some(guard => guard.current)
const askToLeave = () => confirm({
  title: 'Tinggalkan perubahan yang belum disimpan?',
  message: 'Perubahan pada halaman ini akan hilang. Simpan terlebih dahulu jika ingin mempertahankannya.',
  confirmLabel: 'Tinggalkan halaman',
  cancelLabel: 'Tetap di sini',
  tone: 'danger',
})
/** Resolve true when nothing is unsaved or the editor agrees to discard it (e.g. before signing out). */
export const mayLeave = async () => !blocked() || askToLeave()

const appPath = () => window.location.pathname.slice(BASE.length) || '/'
let lastHref = window.location.href

export async function navigate(to: string, options: { replace?: boolean; force?: boolean } = {}) {
  if (!options.force && blocked() && !(await askToLeave())) return false
  window.history[options.replace ? 'replaceState' : 'pushState'](null, '', BASE + to)
  lastHref = window.location.href
  window.scrollTo({ top: 0 })
  notify()
  return true
}

window.addEventListener('popstate', () => {
  if (!blocked()) { lastHref = window.location.href; notify(); return }
  // Undo the browser's move until the editor confirms, then replay it.
  const target = window.location.href
  window.history.pushState(null, '', lastHref)
  void askToLeave().then(leave => {
    if (!leave) return
    window.history.pushState(null, '', target)
    lastHref = target
    notify()
  })
})

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function useLocation() {
  const path = useSyncExternalStore(subscribe, appPath)
  const search = useSyncExternalStore(subscribe, () => window.location.search)
  return { path, search: new URLSearchParams(search) }
}

/** Guard in-app navigation, back/forward and tab close while `active`. */
export function useLeaveGuard(active: boolean) {
  const guard = useRef(active)
  useLayoutEffect(() => { guard.current = active }, [active])
  useEffect(() => {
    guards.add(guard)
    return () => { guards.delete(guard) }
  }, [])
  useEffect(() => {
    if (!active) return
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [active])
}

export function Link({ to, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void navigate(to)
  }
  return <a href={BASE + to} onClick={follow} {...props} />
}
