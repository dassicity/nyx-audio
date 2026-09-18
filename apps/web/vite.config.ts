import { execSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The commit this bundle was built from.
 *
 * Deployment compares this against HEAD to decide whether the served client is
 * stale — asking the running thing what it is, rather than inferring it from
 * what a particular run happened to pull. Inference is what let a pre-Import
 * bundle report "serving the Nyx client" after a deploy that changed nothing.
 */
function commit(): string {
  if (process.env.NYX_COMMIT) return process.env.NYX_COMMIT
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    return 'unknown'
  }
}

const COMMIT = commit()

export default defineConfig(({ mode }) => {
  // loadEnv with an empty prefix reads .env.local's NYX_* values. Reading
  // process.env alone meant the documented .env.local never took effect.
  const env = loadEnv(mode, process.cwd(), '')
  const server = env.NYX_SERVER ?? 'http://nyx.local'

  return {
  plugins: [
    react(),
    {
      name: 'nyx-version',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ commit: COMMIT, built: new Date().toISOString() }) + '\n',
        })
      },
    },
  ],
  define: { __NYX_COMMIT__: JSON.stringify(COMMIT) },
  server: {
    host: true,
    // Dev talks to the real Pi. One origin in production (Caddy), so the
    // client only ever calls relative paths — this proxy makes that true in
    // development too, and keeps credentials off the query string of a
    // cross-origin request.
    proxy: {
      '/rest': { target: server, changeOrigin: true },
      // nyx-api. Defaults to the same server; NYX_API points it at a local
      // uvicorn when working on the API itself.
      '/api': { target: env.NYX_API ?? server, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
  }
})
