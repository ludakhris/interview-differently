/**
 * Copy for the public homepage, kept out of the component so the page reads as layout.
 * Everything here is public-facing: fictional learners and employers, cited statistics only.
 */

/** Where today's training loses people: four handoffs between disconnected tools. */
export const BREAKS = [
  {
    title: 'Engagement',
    body: 'Long courses lose learners well before the finish line.',
  },
  {
    title: 'Practice',
    body: 'Learners rarely get to try the real work before day one.',
  },
  {
    title: 'Proof',
    body: 'A certificate shows someone finished, not what they can do.',
  },
  {
    title: 'Placement',
    body: 'Employers can’t see verified skills, so strong candidates get missed.',
  },
]

/** Two illustrative learners who start a traditional course from the same seat. */
export const SAME_START = [
  {
    name: 'Maya',
    score: '80%',
    tone: 'sky',
    body: 'already knows most of the material. She sits through four weeks of it anyway, waiting for the twenty percent she came for.',
  },
  {
    name: 'Theo',
    score: '34%',
    tone: 'orange',
    body: 'needs nearly all of it. Same seat, same pace. By week three he is behind, and nobody sees it until the final exam.',
  },
] as const

/** The three moves a learner repeats with every lesson. */
export const LOOP = [
  {
    key: 'learn',
    title: 'Learn',
    body: 'A short lesson on one skill, from an instructor or an industry creator.',
  },
  {
    key: 'practice',
    title: 'Practice',
    body: 'A real-world exercise or job simulation, often alongside an AI agent.',
  },
  {
    key: 'prove',
    title: 'Prove',
    body: 'The attempt is scored. Pass, and a verified skill lands in the record.',
  },
]

/** An illustrative learner. Maya, the skills and the weeks are made up. */
export const JOURNEY = [
  { week: 'Week 1', skill: 'Password and MFA support' },
  { week: 'Week 3', skill: 'Ticket triage' },
  { week: 'Week 5', skill: 'Phishing response' },
  { week: 'Week 8', skill: 'Directing an AI help desk agent' },
  { week: 'Week 12', skill: 'Hired as an IT support apprentice', hired: true },
]

/** Traditional training against this model, one row per shift (deck slide 4). */
export const SHIFTS = [
  { from: 'Long courses', to: 'Short lessons, on demand' },
  { from: 'Same pace for all, ready or not', to: 'Each learner advances on mastery' },
  {
    from: 'Gaps surface at the final exam',
    to: 'Learners see and close their exact gaps in real time',
  },
  { from: 'Theory and class projects', to: 'Real-world exercises in every lesson' },
  { from: 'No real-world experience', to: 'Job simulations alongside AI agents' },
  {
    from: 'A certificate at the end',
    to: 'Verified skills from the first exercise',
    highlight: true,
  },
  { from: 'Job searches by title', to: 'Matched on the skills employers seek' },
]

export interface Pathway {
  id: string
  sector: string
  title: string
  simulationTitle: string
  simulation: string
  lessons: string[]
  skills: string[]
  roles: string[]
}

/** Five example pathways (deck slides 13 to 17). Scenarios are illustrative. */
export const PATHWAYS: Pathway[] = [
  {
    id: 'it-support',
    sector: 'Information technology',
    title: 'IT Support',
    simulationTitle: 'The Monday-morning queue',
    simulation:
      'Twenty tickets land at once. An AI agent drafts fixes and replies. The learner verifies each caller, catches a wrong fix, and escalates a phishing report to security.',
    lessons: ['Password resets and MFA', 'DNS basics', 'Ticket triage'],
    skills: ['Troubleshooting', 'Ticket triage', 'Security awareness', 'Customer care'],
    roles: ['Help desk technician', 'IT support specialist', 'Desktop support'],
  },
  {
    id: 'sre',
    sector: 'Software engineering',
    title: 'Site Reliability',
    simulationTitle: 'The 2 a.m. page',
    simulation:
      'Checkout latency spikes. An AI ops agent suggests rolling back the last release. The learner checks dashboards and the error budget, approves or overrides, then writes the incident update.',
    lessons: ['SLOs and error budgets', 'Alert triage', 'Blameless postmortems'],
    skills: ['Incident triage', 'Observability', 'Reviewing agent fixes', 'Incident comms'],
    roles: ['Junior SRE', 'DevOps engineer', 'Platform support engineer'],
  },
  {
    id: 'teller',
    sector: 'Banking',
    title: 'Bank Teller',
    simulationTitle: 'The rushed withdrawal',
    simulation:
      'An older customer wants a large cash withdrawal while on the phone with someone “from the bank.” An AI assistant flags the pattern. The learner spots the scam signs, talks with the customer calmly and follows policy.',
    lessons: ['Balancing your drawer', 'Scam red flags', 'Digital banking help'],
    skills: ['Cash accuracy', 'Scam recognition', 'Customer trust', 'Policy compliance'],
    roles: ['Bank teller', 'Universal banker', 'Member service representative'],
  },
  {
    id: 'fraud',
    sector: 'Financial services',
    title: 'Fraud Analyst',
    simulationTitle: 'The suspicious card claim',
    simulation:
      'A caller disputes three charges. An AI model scores the account as low risk, but the details don’t add up. The learner verifies identity, questions the score and documents a clear case decision.',
    lessons: ['Account takeover signs', 'Social engineering', 'Using AI risk scores'],
    skills: ['Fraud patterns', 'Caller verification', 'Judging AI scores', 'Case notes'],
    roles: ['Fraud analyst', 'Fraud prevention specialist', 'Risk operations agent'],
  },
  {
    id: 'accountant',
    sector: 'Finance and accounting',
    title: 'Staff Accountant',
    simulationTitle: 'Month-end close',
    simulation:
      'An AI agent auto-matches hundreds of transactions. The learner reviews the exceptions, catches a duplicate vendor payment, posts the adjusting entry and explains it to the controller.',
    lessons: ['Reconciliations', 'Accruals', 'Month-end close checklist'],
    skills: ['Reconciliation', 'Journal entries', 'Reviewing AI matches', 'Close discipline'],
    roles: ['Staff accountant', 'AP/AR specialist', 'Junior accountant'],
  },
]

/** How the platform fits the systems an institution already runs. */
export const STACK = [
  {
    label: 'LTI 1.3',
    title: 'Launch from your LMS, or launch tools into ours',
    body: 'Learn Differently is both an LTI platform and an LTI tool. Launch simulations and assessments from the LMS you already run, or launch tools into a pathway here. Scores pass back either way.',
  },
  {
    label: 'SCORM',
    title: 'Bring the content you already built',
    body: 'Upload SCORM packages, including Rise and Storyline output, and play them inside a pathway next to short lessons and simulations. Nothing has to be rebuilt.',
  },
  {
    label: 'SIS AND ROSTERS',
    title: 'Enrollment stays in your system of record',
    body: 'Import rosters by CSV. Export completions, skill gains and exit records back to your registration or case-management system.',
  },
  {
    label: 'SECURITY AND PRIVACY',
    title: 'You own the data. We never train on it.',
    body: 'SSO through your identity provider. FERPA school-official terms. Learner work is never used to train models and is deleted on your schedule. Learners choose who sees their profile.',
    dark: true,
  },
  {
    label: 'ACCESSIBILITY',
    title: 'Captioned lessons. Spoken or typed answers.',
    body: 'Recorded lessons are captioned. Learners answer simulation and interview prompts by voice or by typing.',
  },
  {
    label: 'ONE LEARNER RECORD',
    title: 'Five tools, one record, no re-registration',
    body: 'A learner signs in once. Lessons, exercises, verified skills and matches all land in the same record, so no one re-enters data between tools.',
  },
]

/** World Economic Forum, Future of Jobs Report 2025 (over 1,000 employers surveyed). */
export const WHY_NOW = [
  {
    figure: '39%',
    claim: 'of workers’ core skills are expected to change by 2030',
    tone: 'orange',
  },
  {
    figure: '59%',
    claim: 'of the global workforce will need upskilling or reskilling by 2030',
    tone: 'white',
  },
  {
    figure: '63%',
    claim: 'of employers call skills gaps the biggest barrier to transforming their business',
    tone: 'sky',
  },
] as const

/** The US funding rules training is now paid against (kept short on purpose). */
export const RULES = {
  figure: '70/70',
  label: 'WORKFORCE PELL · JULY 2026',
  body: 'Training is paid on outcomes now. Short programs qualify for Workforce Pell only with 70% completion and 70% of completers employed after exit, and WIOA programs report six indicators every quarter. Those numbers come out of the record here, not out of a spreadsheet.',
}

/** What is tracked for every cohort, in the measures funders already use. */
export const TRACKED = [
  { outcome: 'Engagement', how: 'Lesson views, streaks and completion' },
  { outcome: 'Skill gains', how: 'Exercise and simulation scores over time' },
  { outcome: 'Credentials', how: 'Verified skills and badges earned' },
  { outcome: 'Placement', how: 'Matches, interviews and hires' },
  { outcome: 'Employer demand', how: 'Active employers and open roles' },
]

export const AUDIENCES = [
  {
    title: 'Workforce agencies and boards',
    body: 'Upskill job seekers and incumbent workers at scale, with placement data that maps to the outcomes your funders track. Branded for your state, with every approved provider under one roof.',
    cta: 'For agencies',
  },
  {
    title: 'Training providers',
    body: 'Run the cohorts you already teach: your curriculum, attendance, milestones and outcome exports in one place, with ready-made pathways and simulations when you want them. Renew your provider listing with the data already collected.',
    cta: 'For providers',
  },
  {
    title: 'Colleges and continuing education',
    body: 'Pair degree and non-credit programs with job simulations and micro-credentials, and connect graduates straight to employers without a second registration system.',
    cta: 'For colleges',
  },
  {
    title: 'CTE programs and schools',
    body: 'Give students hands-on practice in real-world scenarios and a direct line to apprenticeships and first jobs.',
    cta: 'For CTE',
  },
  {
    title: 'Employers and public-sector HR',
    body: 'Upskill the staff you already have, fast: short lessons on the skill a team needs this quarter, practice in simulations of their actual work, and a supervisor view of who is ready. Live instructor-led sessions with attendance when the contract calls for them. Job matching is yours to switch on, never a default.',
    cta: 'For employers',
  },
]

/** Licensing models. Prices are quoted per partner. */
export const LICENSING = [
  {
    label: 'PER SEAT, PER PATHWAY',
    name: 'Pathway seat',
    body: 'One seat unlocks one skills pathway, such as IT Support, for a set term.',
    best: 'Training schools and CTE programs',
  },
  {
    label: 'FIXED BUDGET',
    name: 'Cohort',
    body: 'A flat fee for one cohort on one pathway. Easy to fund with a grant.',
    best: 'Pilots and grant-funded programs',
  },
  {
    label: 'UNLIMITED SCALE',
    name: 'Site license',
    body: 'Unlimited learners across every pathway, with a dedicated success team.',
    best: 'Universities and large providers',
  },
  {
    label: 'STATEWIDE',
    name: 'State license',
    body: 'Every provider you fund on one state-branded tenant, reporting into one set of measures and definitions.',
    best: 'State workforce agencies and boards',
  },
]

export const PILOT_STEPS = [
  {
    title: 'Pick a pathway',
    body: 'Choose a high-demand track, such as IT support, data or advanced manufacturing.',
  },
  {
    title: 'Enroll a cohort',
    body: 'We onboard your learners, instructors and creators in weeks.',
  },
  {
    title: 'Connect employers',
    body: 'Your employer partners see each learner’s verified skills and work samples. Talent Match search joins pilots when it ships.',
  },
]
