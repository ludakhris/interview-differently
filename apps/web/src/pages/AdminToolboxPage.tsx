import { Link } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { useRole } from '@/hooks/useRole'

// The admin index, laid out like Learn Differently's Admin toolbox: one tile per tool, each with
// a small illustrated icon. Institution admins see their tools; platform tools need a full admin
// (the API enforces both).

const ICON = { viewBox: '0 0 48 48', 'aria-hidden': true } as const

/** A red toolbox with a yellow latch, for the page heading (the same mark Learn Differently uses). */
function ToolboxIcon() {
  return (
    <svg {...ICON} width={44} height={44}>
      <path
        d="M17 14v-3a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"
        fill="none"
        stroke="#3b4252"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="5" y="14" width="38" height="26" rx="5" fill="#ef5b5b" />
      <path d="M5 24h38v-5a5 5 0 0 0-5-5H10a5 5 0 0 0-5 5z" fill="#ff8a8a" />
      <rect x="5" y="24" width="38" height="3" fill="#c93f3f" />
      <rect x="19" y="21" width="10" height="9" rx="2.5" fill="#ffc53d" stroke="#e0a100" />
      <circle cx="24" cy="25.5" r="1.5" fill="#3b4252" />
    </svg>
  )
}

/** A stack of blue database discs: the SQL datasets. */
function DatasetsIcon() {
  return (
    <svg {...ICON} width={40} height={40}>
      <ellipse cx="24" cy="12" rx="14" ry="5" fill="#2563eb" />
      <path
        d="M10 12v9c0 2.8 6.3 5 14 5s14-2.2 14-5v-9c0 2.8-6.3 5-14 5s-14-2.2-14-5z"
        fill="#1d4fd8"
      />
      <path
        d="M10 21v9c0 2.8 6.3 5 14 5s14-2.2 14-5v-9c0 2.8-6.3 5-14 5s-14-2.2-14-5z"
        fill="#2563eb"
      />
      <path
        d="M10 30v6c0 2.8 6.3 5 14 5s14-2.2 14-5v-6c0 2.8-6.3 5-14 5s-14-2.2-14-5z"
        fill="#1d4fd8"
      />
      <circle cx="33" cy="21" r="1.6" fill="#9fc2ff" />
      <circle cx="33" cy="30" r="1.6" fill="#9fc2ff" />
    </svg>
  )
}

/** A clipboard with a green tick: question banks and assessments. */
function AssessmentsIcon() {
  return (
    <svg {...ICON} width={40} height={40}>
      <rect x="9" y="8" width="30" height="34" rx="4" fill="#ffc53d" />
      <rect x="13" y="13" width="22" height="25" rx="2" fill="#fff" />
      <rect x="18" y="5" width="12" height="7" rx="2.5" fill="#3b4252" />
      <path
        d="M17 22l3 3 6-6"
        fill="none"
        stroke="#1f8a55"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M17 31h14" stroke="#c9cfdb" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

/** A columned building: institutions and their cohorts. */
function InstitutionsIcon() {
  return (
    <svg {...ICON} width={40} height={40}>
      <path d="M24 5 6 14h36z" fill="#7c5cff" />
      <rect x="8" y="14" width="32" height="4" fill="#5b3fd9" />
      <rect x="11" y="20" width="5" height="15" rx="1" fill="#a78bfa" />
      <rect x="21.5" y="20" width="5" height="15" rx="1" fill="#a78bfa" />
      <rect x="32" y="20" width="5" height="15" rx="1" fill="#a78bfa" />
      <rect x="6" y="36" width="36" height="5" rx="1.5" fill="#5b3fd9" />
    </svg>
  )
}

/** A rising bar chart: platform usage. */
function UsageIcon() {
  return (
    <svg {...ICON} width={40} height={40}>
      <rect x="6" y="6" width="36" height="36" rx="6" fill="#14b8a6" />
      <rect x="12" y="26" width="5" height="10" rx="1.5" fill="#fff" />
      <rect x="21.5" y="19" width="5" height="17" rx="1.5" fill="#fff" />
      <rect x="31" y="12" width="5" height="24" rx="1.5" fill="#ffc53d" />
    </svg>
  )
}

/** A plug meeting a socket: platforms connected over LTI. */
function PlatformsIcon() {
  return (
    <svg {...ICON} width={40} height={40}>
      <path d="M15 4v8m10-8v8" stroke="#3b4252" strokeWidth="3" strokeLinecap="round" />
      <rect x="9" y="12" width="22" height="13" rx="4" fill="#ff7a59" />
      <path d="M9 18h22v3a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4z" fill="#e0573a" />
      <path
        d="M20 25v6a5 5 0 0 0 5 5h6"
        fill="none"
        stroke="#3b4252"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="31" y="30" width="10" height="12" rx="3" fill="#2563eb" />
    </svg>
  )
}

const TOOLS = [
  {
    path: '/admin/datasets',
    name: 'SQL datasets',
    desc: 'Postgres setup scripts students can query in the SQL Sandbox, assigned to cohorts.',
    icon: <DatasetsIcon />,
    bg: 'bg-[#e6efff]',
    fullAdmin: false,
  },
  {
    path: '/admin/assessments',
    name: 'Assessments',
    desc: 'Question banks imported from markdown, for pre- and post-assessments.',
    icon: <AssessmentsIcon />,
    bg: 'bg-[#fff3cf]',
    fullAdmin: false,
  },
  {
    path: '/admin/institutions',
    name: 'Institutions & cohorts',
    desc: 'Group students into institutions and cohorts. Powers the analytics dashboards.',
    icon: <InstitutionsIcon />,
    bg: 'bg-[#ece6ff]',
    fullAdmin: false,
  },
  {
    path: '/admin/usage',
    name: 'Usage',
    desc: 'Who is active, how often they come back, and which tools they use.',
    icon: <UsageIcon />,
    bg: 'bg-[#dcf5f1]',
    fullAdmin: true,
  },
  {
    path: '/admin/platforms',
    name: 'Platforms',
    desc: 'The learning systems that launch Interview Differently, and approving new ones.',
    icon: <PlatformsIcon />,
    bg: 'bg-[#ffe7df]',
    fullAdmin: true,
  },
]

export function AdminToolboxPage() {
  const { isAdmin } = useRole()
  return (
    <div className="min-h-screen bg-surface">
      <Nav />
      <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-center gap-4 mb-8">
          <span className="inline-flex flex-none items-center justify-center w-[64px] h-[64px] rounded-[18px] bg-[#fff0c2]">
            <ToolboxIcon />
          </span>
          <div>
            <h1 className="font-display font-extrabold text-[30px] tracking-[-0.03em] text-fg leading-tight">
              Admin toolbox
            </h1>
            <p className="text-[16px] text-slate-light">Tools for running Interview Differently.</p>
          </div>
        </div>
        <ul className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(17em,1fr))]">
          {TOOLS.filter((t) => isAdmin || !t.fullAdmin).map((t) => (
            <li key={t.path}>
              <Link
                to={t.path}
                className="group flex flex-col items-start gap-2 h-full p-6 rounded-[14px] border border-border bg-surface-alt text-fg hover:border-primary hover:shadow-card focus-visible:border-primary transition-[border-color,box-shadow]"
              >
                <span
                  className={`inline-flex items-center justify-center w-[56px] h-[56px] rounded-[14px] mb-2 transition-transform group-hover:-rotate-6 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:transform-none ${t.bg}`}
                >
                  {t.icon}
                </span>
                <span className="font-display font-bold text-[18px] leading-tight">{t.name}</span>
                <span className="flex-1 text-[14px] leading-normal text-slate-light">{t.desc}</span>
                <span className="mt-2 text-[14px] font-bold text-primary">Open tool →</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

/** "← Admin toolbox": the way back from each admin tool, above its kicker. */
export function AdminCrumb() {
  return (
    <Link
      to="/admin"
      className="inline-block mb-3 text-[13px] font-semibold text-primary hover:text-accent transition-colors"
    >
      ← Admin toolbox
    </Link>
  )
}
