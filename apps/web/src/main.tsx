import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import App from './App'
import './index.css'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY || PUBLISHABLE_KEY === 'pk_test_replace_me') {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — add it to apps/web/.env.local')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <BrowserRouter>
        <App />
        <Analytics />
        <SpeedInsights />
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>
)
