import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => new Response(JSON.stringify({ status: 'ok' }), {
  headers: { 'Content-Type': 'application/json' },
});
