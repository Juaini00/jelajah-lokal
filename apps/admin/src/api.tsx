import { useEffect, useState } from 'react'
import type { Api } from './types'

export class ApiError extends Error {
  code: string; requestId: string; retryable: boolean; status: number
  constructor(status: number, code: string, message: string, requestId = '', retryable = false) {
    super(message); this.status = status; this.code = code; this.requestId = requestId; this.retryable = retryable
  }
}
const guidance: Record<string, string> = {
  AUTH_REQUIRED: 'Sesi berakhir. Masuk kembali; isian Anda tetap dipertahankan di halaman ini.',
  FORBIDDEN: 'Anda tidak memiliki izin untuk tindakan ini. Pilih artikel yang dapat Anda kelola.',
  ARTICLE_NOT_FOUND: 'Artikel tidak ditemukan atau tidak lagi dapat diakses.',
  ARTICLE_CHANGED: 'Draft berubah. Tidak ada penimpaan. Muat versi terbaru dan bandingkan sebelum menyimpan ulang.',
  AI_BUSY: 'Ada proses AI aktif. Tunggu lalu periksa penggunaan lagi; tidak ada antrean otomatis.',
  IDEMPOTENCY_CONFLICT: 'Permintaan ini sudah digunakan dengan data berbeda. Mulai tindakan baru secara sengaja.',
  INPUT_TOO_LONG: 'Input melebihi batas bantuan AI. Pendekkan artikel atau isi metadata secara manual.',
  INPUT_TOO_SHORT: 'Artikel belum memiliki 100 kata bermakna. Lengkapi draft atau isi metadata manual.',
  INVALID_AI_OUTPUT: 'Usulan Gemini tidak valid. Draft tetap utuh. Isi manual atau mulai permintaan baru.',
  DAILY_QUOTA_EXCEEDED: 'Kuota aplikasi hari ini habis. Tunggu reset UTC atau isi metadata manual.',
  PROVIDER_RATE_LIMITED: 'Gemini membatasi permintaan. Batas provider berbeda dari kuota aplikasi. Coba nanti secara manual.',
  AI_NOT_CONFIGURED: 'Bantuan AI dinonaktifkan atau belum siap. Penulisan dan penerbitan manual tetap tersedia.',
  QUOTA_STORE_UNAVAILABLE: 'Penggunaan tidak dapat diperiksa. Proses AI gagal aman; gunakan metadata manual.',
  AI_PROVIDER_ERROR: 'Gemini belum dapat merespons. Tidak ada metadata yang diterapkan.',
  AI_TIMEOUT: 'Proses melewati batas waktu. Draft tetap utuh. Permintaan baru dapat memakai kuota lagi.',
  NETWORK_ERROR: 'Koneksi terputus. Hasil tindakan belum dapat dipastikan. Jangan langsung mengulang publikasi; muat keadaan server terlebih dahulu.',
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null
  const e = error instanceof ApiError ? error : new ApiError(0, 'CLIENT_ERROR', error instanceof Error ? error.message : 'Tindakan gagal.')
  return <div className="notice error" role="alert"><strong>{guidance[e.code] || e.message}</strong>{guidance[e.code] && <p>{e.message}</p>}<small>{e.code}{e.requestId ? ` · Referensi ${e.requestId}` : ''}</small></div>
}
export function createApi(csrf: () => string | undefined, onExpired: () => void): Api {
  return async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const headers = new Headers(options.headers)
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    if (csrf()) headers.set('X-CSRF-Token', csrf()!)
    let response: Response
    try { response = await fetch(`/api/admin${path}`, { ...options, headers, credentials: 'same-origin', cache: 'no-store' }) }
    catch { throw new ApiError(0, 'NETWORK_ERROR', 'Server belum dapat dihubungi. Periksa koneksi lalu muat ulang keadaan tersimpan.', '', true) }
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      if (response.status === 401 && path !== '/login') onExpired()
      throw new ApiError(response.status, payload?.error?.code || 'SERVICE_ERROR', payload?.error?.message || 'Layanan belum dapat merespons.', payload?.error?.requestId, payload?.error?.retryable)
    }
    return payload as T
  }
}
export function useCollection<T>(api: Api, path: string) {
  const [data, setData] = useState<T[]>([])
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  async function reload() {
    setLoading(true); setError(null)
    try { setData((await api<{ data: T[] }>(path)).data) } catch (e) { setError(e) } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [api, path])
  return { data, setData, error, loading, reload }
}
