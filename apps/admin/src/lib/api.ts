import { useSyncExternalStore } from 'react'
import type { Session } from './types'

export interface FieldIssue { field: string; message: string }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string
  readonly retryable: boolean
  readonly fields: FieldIssue[]
  constructor(status: number, code: string, message: string, requestId = '', retryable = false, fields: FieldIssue[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.requestId = requestId
    this.retryable = retryable
    this.fields = fields
  }
}

export const isApiError = (error: unknown, code?: string): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code)

/* Session store: shared by the request layer (CSRF, expiry) and React (useSession). */
interface SessionState { session: Session | null; expired: boolean; checked: boolean }
let state: SessionState = { session: null, expired: false, checked: false }
const listeners = new Set<() => void>()
function setState(next: Partial<SessionState>) {
  state = { ...state, ...next }
  listeners.forEach(listener => listener())
}
export const sessionStore = {
  signedIn: (session: Session) => setState({ session, expired: false, checked: true }),
  signedOut: () => setState({ session: null, expired: false, checked: true }),
  // Keep the principal so the shell (and any unsaved form) stays mounted under the re-login dialog.
  expire: () => { if (state.session) setState({ expired: true }) },
}
export const useSession = () => useSyncExternalStore(
  listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  () => state,
)

interface Envelope { error?: { code?: string; message?: string; requestId?: string; retryable?: boolean; fields?: FieldIssue[] } }

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')
  if (state.session) headers.set('X-CSRF-Token', state.session.csrfToken)
  let response: Response
  try {
    response = await fetch(`/api/admin${path}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'NETWORK_ERROR', 'Server tidak dapat dihubungi. Periksa koneksi Anda.', '', true)
  }
  const payload: (T & Envelope) | null = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error
    if (response.status === 401 && path !== '/login') sessionStore.expire()
    throw new ApiError(
      response.status,
      error?.code ?? 'SERVICE_ERROR',
      error?.message ?? `Layanan merespons ${response.status}.`,
      error?.requestId ?? response.headers.get('X-Request-Id') ?? '',
      error?.retryable ?? response.status >= 500,
      error?.fields ?? [],
    )
  }
  return payload as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => send<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) => send<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => send<T>(path, { method: 'DELETE' }),
}

export async function login(username: string, password: string) {
  const { data } = await api.post<{ data: Session }>('/login', { username, password })
  sessionStore.signedIn(data)
  return data
}

/** Plain-language guidance per error code; the server message is shown underneath for detail. */
export const guidance: Record<string, string> = {
  AUTH_REQUIRED: 'Sesi Anda berakhir. Masuk kembali — isian di halaman ini tetap aman.',
  FORBIDDEN: 'Akun Anda tidak memiliki izin untuk tindakan ini.',
  ARTICLE_NOT_FOUND: 'Artikel tidak ditemukan atau sudah dihapus.',
  ARTICLE_CHANGED: 'Artikel ini sudah diubah di tempat lain. Tidak ada yang ditimpa.',
  PUBLISH_VALIDATION_FAILED: 'Artikel belum memenuhi syarat terbit.',
  INVALID_REQUEST: 'Beberapa isian belum valid.',
  SLUG_CONFLICT: 'Slug sudah dipakai. Gunakan slug lain.',
  PUBLISHED_SLUG_IMMUTABLE: 'Slug artikel yang sudah terbit tidak dapat diubah.',
  ARTICLE_PUBLISHED: 'Tarik artikel dari publik sebelum menghapusnya.',
  RELATION_REFERENCED: 'Data ini masih dipakai oleh artikel, jadi tidak dapat dihapus.',
  MEDIA_INVALID: 'Berkas harus JPEG, PNG, atau WebP yang valid, maksimal 5 MB.',
  MEDIA_PROVIDER_ERROR: 'Penyimpanan gambar sedang bermasalah. Coba lagi beberapa saat lagi.',
  AI_BUSY: 'Ada proses AI lain yang sedang berjalan. Tunggu sebentar lalu coba lagi.',
  IDEMPOTENCY_CONFLICT: 'Permintaan ini sudah dipakai dengan data berbeda. Mulai permintaan baru.',
  AI_REQUEST_EXPIRED: 'Hasil permintaan sebelumnya tidak diketahui. Mulai permintaan baru.',
  INPUT_TOO_LONG: 'Artikel terlalu panjang untuk bantuan AI. Isi metadata secara manual.',
  INPUT_TOO_SHORT: 'Artikel tersimpan belum mencapai 100 kata bermakna.',
  INVALID_AI_OUTPUT: 'Usulan AI tidak valid dan tidak diterapkan. Draft Anda tetap utuh.',
  DAILY_QUOTA_EXCEEDED: 'Kuota AI hari ini habis. Kuota direset pukul 07.00 WIB (00.00 UTC).',
  PROVIDER_RATE_LIMITED: 'Gemini sedang membatasi permintaan. Coba lagi nanti.',
  AI_NOT_CONFIGURED: 'Bantuan AI belum aktif. Penulisan dan penerbitan manual tetap tersedia.',
  QUOTA_STORE_UNAVAILABLE: 'Pemakaian AI tidak dapat diperiksa, jadi proses dihentikan dengan aman.',
  AI_PROVIDER_ERROR: 'Gemini belum dapat merespons. Tidak ada perubahan pada draft.',
  AI_TIMEOUT: 'Gemini terlalu lama merespons. Draft tetap utuh.',
  NETWORK_ERROR: 'Koneksi terputus. Hasil tindakan belum pasti — muat ulang data sebelum mencoba lagi.',
  SERVICE_UNAVAILABLE: 'Layanan sedang tidak tersedia. Coba lagi beberapa saat lagi.',
}

export function describeError(error: unknown) {
  if (error instanceof ApiError) return { title: guidance[error.code] ?? error.message, detail: guidance[error.code] && guidance[error.code] !== error.message ? error.message : '', error }
  return { title: error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga.', detail: '', error: null }
}
