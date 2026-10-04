import { renameSync } from 'node:fs'
import { resolve } from 'node:path'
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

export default defineConfig({
  plugins: [react(), renameHomeEntry()],
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        delaware: resolve(__dirname, 'delaware.html'),
      },
    },
  },
})
