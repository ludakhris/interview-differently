import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Sub-nav for the institution analytics pages.
 *
 * Renders a row of tab-like links — `Overview / Engagement / Heatmap` —
 * scoped to a single institution. Preserves the `?cohortId=...` filter
 * across tabs so picking a cohort on one page sticks when you switch
 * to another.
 *
 * Tabs that point at unbuilt pages render disabled (greyed out, no nav)
 * so the layout stays stable as those pages land. Pass `available` from
 * the parent — caller knows what's shipped.
 */
export type AnalyticsTab = 'overview' | 'engagement' | 'heatmap' | 'students'

const ALL_TABS: Array<{ key: AnalyticsTab; label: string; suffix: string }> = [
  { key: 'overview', label: 'Overview', suffix: '/analytics' },
  { key: 'engagement', label: 'Engagement', suffix: '/engagement' },
  { key: 'heatmap', label: 'Heatmap', suffix: '/heatmap' },
  { key: 'students', label: 'Students', suffix: '/students' },
]

export interface AnalyticsTabsProps {
  institutionId: string
  active: AnalyticsTab
  /** Tabs whose pages exist. Others render disabled. */
  available: AnalyticsTab[]
}

export function AnalyticsTabs({ institutionId, active, available }: AnalyticsTabsProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const search = useMemo(() => {
    // Preserve only ?cohortId= across tabs. Other params (sort, anonymise) are page-specific.
    const params = new URLSearchParams(location.search)
    const cohortId = params.get('cohortId')
    return cohortId ? `?cohortId=${encodeURIComponent(cohortId)}` : ''
  }, [location.search])

  return (
    <div className="border-b border-white/10 mb-6">
      <nav className="flex items-center gap-1" aria-label="Analytics sections">
        {ALL_TABS.map((tab) => {
          const isActive = tab.key === active
          const isDisabled = !available.includes(tab.key)
          const className = `px-4 py-2.5 text-[13px] font-semibold transition-colors border-b-2 -mb-px ${
            isActive
              ? 'text-[#f5f3ee] border-green'
              : isDisabled
                ? 'text-white/20 border-transparent cursor-not-allowed'
                : 'text-slate-mid hover:text-[#f5f3ee] border-transparent'
          }`
          if (isDisabled) {
            return (
              <span key={tab.key} className={className} title="Coming soon">
                {tab.label}
              </span>
            )
          }
          return (
            <button
              key={tab.key}
              onClick={() => navigate(`/admin/institutions/${institutionId}${tab.suffix}${search}`)}
              className={className}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
