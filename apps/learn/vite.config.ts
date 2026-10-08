import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Link previews (iMessage, Slack, LinkedIn) read the raw HTML, so each site
// needs its own HTML file. vercel.json picks home.html or delaware.html by
// hostname. Vercel serves real files before applying rewrites, so the build
// must not emit an index.html: it would answer "/" on every host.
function renameHomeEntry(): Plugin {
  return {
    name: 'rename-home-entry',
    apply: 'build',
    closeBundle() {
      renameSync(resolve(__dirname, 'dist/index.html'), resolve(__dirname, 'dist/home.html'))
    },
  }
}

// The checked-in release notes (docs/release-notes) are published at /release-notes/. The page
// links its screenshots as ../screenshots/<feature>/<file>, so only those files are copied to
// dist/screenshots/. docs/ stays the single source; nothing is duplicated in the repo.
function publishReleaseNotes(): Plugin {
  return {
    name: 'publish-release-notes',
    apply: 'build',
    closeBundle() {
      const docs = resolve(__dirname, '../../docs')
      const page = readFileSync(resolve(docs, 'release-notes/index.html'), 'utf8')
      const out = resolve(__dirname, 'dist')
      mkdirSync(resolve(out, 'release-notes'), { recursive: true })
      copyFileSync(
        resolve(docs, 'release-notes/index.html'),
        resolve(out, 'release-notes/index.html')
      )
      for (const [, rel] of page.matchAll(
        /\.\.\/(screenshots\/[^"'\s)]+\.(?:png|jpe?g|webp|gif))/g
      )) {
        const from = resolve(docs, rel)
        if (!existsSync(from)) continue
        mkdirSync(dirname(resolve(out, rel)), { recursive: true })
        copyFileSync(from, resolve(out, rel))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), renameHomeEntry(), publishReleaseNotes()],
  server: {
    port: 5174,
    // SCORM packages load from this origin so they can find the player's API.
    // In production a Vercel rewrite sends /scorm/* to the file bucket instead.
    proxy: {
      '/scorm': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/scorm/, '/api/scorm-files'),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        delaware: resolve(__dirname, 'delaware.html'),
        notFound: resolve(__dirname, '404.html'),
      },
    },
  },
})
