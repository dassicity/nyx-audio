import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Dev talks to the real Pi. One origin in production (Caddy), so the
    // client only ever calls relative paths — this proxy makes that true in
    // development too, and keeps credentials off the query string of a
    // cross-origin request.
    proxy: {
      '/rest': {
        target: process.env.NYX_SERVER ?? 'http://nyx.local',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
})
