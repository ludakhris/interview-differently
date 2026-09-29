import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Each build gets an id, baked into the bundle and emitted as /version.json so
// a tab that outlived a deploy can notice it is stale (see useNewBuildAvailable).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(36)

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ id: BUILD_ID }),
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  // PGlite loads its WASM relative to its own module URL — pre-bundling breaks that.
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
})
