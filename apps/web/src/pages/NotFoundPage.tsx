import { Link } from 'react-router-dom'
import { Nav } from '@/components/Nav'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Nav />
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-2">404</p>
        <h1 className="font-display font-extrabold text-[28px] text-[#f5f3ee] mb-3">
          We couldn’t find that page
        </h1>
        <p className="text-[14px] text-slate-light mb-6">
          The link may be broken or the page may have moved.
        </p>
        <Link
          to="/"
          className="px-5 py-2.5 rounded-lg bg-green hover:bg-green/90 text-white text-[14px] font-medium"
        >
          Back to home
        </Link>
      </main>
    </div>
  )
}
