export function siteOrigin(): URL {
  const url = new URL(process.env.SITE_URL || 'http://127.0.0.1:4321');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('SITE_URL must be an HTTP(S) origin');
  return url;
}
export function indexable(): boolean {
  const url = siteOrigin();
  return process.env.ENVIRONMENT === 'production' && url.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
export function canonical(path: string): string {
  return new URL(path, siteOrigin()).href;
}
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
export function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
