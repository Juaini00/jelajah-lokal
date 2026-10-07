import type { APIRoute } from 'astro';
import { sitemapEntries } from '../lib/server/api';
import { canonical, xml } from '../lib/server/seo';

export const GET: APIRoute = async () => {
  const staticPaths = ['/', '/panduan', '/tentang'];
  let entries: { slug: string; updatedAt: string }[] = [];
  try {
    entries = (await sitemapEntries()).data;
  } catch {
    entries = [];
  }
  const urls = [
    ...staticPaths.map(path => `<url><loc>${xml(canonical(path))}</loc></url>`),
    ...entries.map(entry => `<url><loc>${xml(canonical(`/panduan/${entry.slug}`))}</loc><lastmod>${xml(entry.updatedAt)}</lastmod></url>`),
  ].join('');
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
