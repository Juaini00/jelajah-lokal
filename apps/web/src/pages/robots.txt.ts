import type { APIRoute } from 'astro';
import { canonical, indexable } from '../lib/server/seo';

export const GET: APIRoute = async () => {
  const body = indexable()
    ? `User-agent: *\nAllow: /\nSitemap: ${canonical('/sitemap.xml')}\n`
    : `User-agent: *\nDisallow: /\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
