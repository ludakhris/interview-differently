import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Spark's lesson player. The LMS embeds /lesson in a frame with a signed link (GitHub issue #90).
// It has no site of its own: the Learn Differently build copies dist/ to /spark/ on its site, so the build
// uses that base. The dev server stays at the root (http://localhost:5175/lesson), the API's default address.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/spark/' : '/',
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  preview: { port: 5175 },
}))
