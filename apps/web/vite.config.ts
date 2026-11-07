import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'

// Interview Differently's checked-in release notes (docs/release-notes/interview-differently) are
// published at /release-notes/. The page shares Learn Differently's timeline script (one folder
// up, so ../release-notes.js) and links screenshots as ../../screenshots/<feature>/<file>; only
// those files are copied. docs/ stays the single source.
function publishReleaseNotes(): Plugin {
  return {
    name: 'publish-release-notes',
    apply: 'build',
    closeBundle() {
      const docs = path.resolve(__dirname, '../../docs')
      const src = path.resolve(docs, 'release-notes/interview-differently/index.html')
      const page = readFileSync(src, 'utf8')
      const out = path.resolve(__dirname, 'dist')
      mkdirSync(path.resolve(out, 'release-notes'), { recursive: true })
      copyFileSync(src, path.resolve(out, 'release-notes/index.html'))
      copyFileSync(
        path.resolve(docs, 'release-notes/release-notes.js'),
        path.resolve(out, 'release-notes.js')
      )
      for (const [, rel] of page.matchAll(
        /\.\.\/\.\.\/(screenshots\/[^"'\s)]+\.(?:png|jpe?g|webp|gif))/g
      )) {
        const from = path.resolve(docs, rel)
        if (!existsSync(from)) continue
        mkdirSync(path.dirname(path.resolve(out, rel)), { recursive: true })
        copyFileSync(from, path.resolve(out, rel))
      }
    },
  }
}

// Each build gets an id, baked into the bundle and emitted as /version.json so
// a tab that outlived a deploy can notice it is stale (see useNewBuildAvailable).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(36)

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    publishReleaseNotes(),
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
