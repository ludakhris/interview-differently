import React from 'react'
import ReactDOM from 'react-dom/client'
import { LessonPage } from './LessonPage'
import './spark.css'

// Micro Learning (Spark): the lesson player the LMS embeds (GitHub issue #90). Built, it lives under /spark/ on the
// Learn Differently site (BASE_URL; see vite.config.ts and apps/learn/vercel.json); in dev, at the root.
const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
const { pathname } = window.location
const path = pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname
const lesson = path === '/lesson' || path === '/lesson/'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {lesson ? (
      <LessonPage />
    ) : (
      <main className="sp-lesson">
        <p className="sp-notice">Spark lessons open from your course.</p>
      </main>
    )}
  </React.StrictMode>
)
