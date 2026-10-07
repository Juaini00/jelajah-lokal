import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: {
    // Served by FastAPI at /admin/; emitted inside apps/api so the FastAPI Cloud deploy includes it.
    outDir: '../api/admin_dist',
    emptyOutDir: true,
  },
})
