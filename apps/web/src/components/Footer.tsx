import { useNavigate } from 'react-router-dom'

export function Footer() {
  const navigate = useNavigate()
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/5 mt-16">
      <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between flex-wrap gap-4">
        <p className="text-[11px] text-white/30">
          © {year} Interview Differently
        </p>
        <button
          onClick={() => navigate('/request-scenario')}
          className="text-[12px] font-medium text-slate-mid hover:text-[#f5f3ee] transition-colors"
        >
          Request a custom scenario →
        </button>
      </div>
    </footer>
  )
}
