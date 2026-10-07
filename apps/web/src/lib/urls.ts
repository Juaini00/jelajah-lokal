export function safeLink(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function safeImage(value: unknown): string | undefined {
  const link = safeLink(value);
  if (!link) return undefined;
  const url = new URL(link);
  return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && !url.port ? url.href : undefined;
}

export function guideUrl(slug: string): string {
  return `/panduan/${encodeURIComponent(slug)}`;
}
export function listingUrl(category: string, page = 1): string {
  const query = new URLSearchParams();
  if (category) query.set('kategori', category);
  query.set('page', String(page));
  return `/panduan?${query}`;
}
export function displayDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
