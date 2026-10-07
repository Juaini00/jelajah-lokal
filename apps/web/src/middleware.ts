import { defineMiddleware } from 'astro:middleware';
import { indexable } from './lib/server/seo';

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  if (!indexable() || response.status >= 400) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (response.status === 503) response.headers.set('Retry-After', '60');
  return response;
});
