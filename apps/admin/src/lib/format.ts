const absolute = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const relative = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' })
const steps: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity]]

export const formatDate = (value: string | null | undefined) => (value ? absolute.format(new Date(value)) : '—')

export function timeAgo(value: string | number | null | undefined, now = Date.now()) {
  if (value === null || value === undefined) return '—'
  let delta = (new Date(value).getTime() - now) / 1000
  if (Math.abs(delta) < 45) return 'baru saja'
  for (const [unit, size] of steps) {
    if (Math.abs(delta) < size) return relative.format(Math.round(delta), unit)
    delta /= size
  }
  return absolute.format(new Date(value))
}

/** Cloudinary delivery transform so grids load small, format-negotiated thumbnails instead of originals. */
export function thumb(url: string, width: number, height?: number) {
  const marker = '/image/upload/'
  if (!url.includes(marker)) return url
  const size = height ? `c_fill,g_auto,w_${width},h_${height}` : `c_limit,w_${width}`
  return url.replace(marker, `${marker}${size},f_auto,q_auto,dpr_2.0/`)
}

export const formatBytes = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
