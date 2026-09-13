import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
