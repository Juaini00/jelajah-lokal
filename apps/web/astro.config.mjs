// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

// Vercel sets VERCEL=1 during its builds; everywhere else (local, Docker) keep the standalone Node server.
const onVercel = process.env.VERCEL === '1';

export default defineConfig({
  output: 'server',
  adapter: onVercel ? vercel() : node({ mode: 'standalone' }),
  trailingSlash: 'never',
  server: { host: '127.0.0.1', port: 4321 },
});
