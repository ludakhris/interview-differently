/**
 * Copy for the alternative homepage. Fictional learners, employers and events; cited
 * statistics only. Buyer copy is written forward: it describes the five pieces as one product,
 * with the unshipped pieces named as such where a reader would otherwise assume they run.
 */

/** The sample ledger in the hero: one morning in the loop, as the record sees it. */
export const LEDGER = [
  {
    t: '08:12',
    who: 'Maya',
    what: 'Lesson',
    detail: 'Password resets and MFA · 3 min',
    kind: 'learn',
  },
  {
    t: '08:16',
    who: 'Maya',
    what: 'Exercise',
    detail: 'Caller verification · passed, 86%',
    kind: 'practice',
  },
  {
    t: '08:16',
    who: 'Record',
    what: 'Verified skill',
    detail: 'Caller verification',
    kind: 'prove',
  },
  {
    t: '08:17',
    who: 'Plan',
    what: 'Gap found',
    detail: 'DNS basics added to Maya’s path',
    kind: 'gap',
  },
  {
    t: '09:40',
    who: 'Theo',
    what: 'Simulation',
    detail: 'The Monday-morning queue · in progress',
    kind: 'practice',
  },
  {
    t: '11:05',
    who: 'Employer',
    what: 'Profile viewed',
    detail: 'Harbor Logistics · 4 verified skills (Talent Match, coming soon)',
    kind: 'match',
  },
] as const

/** Three things a buyer gets, stated before the story starts. */
export const STRIP = [
  { k: 'EVERY COHORT', v: 'reported once, in the measures funders already use' },
  { k: 'OUTCOMES', v: 'by provider, side by side, from one record' },
  { k: 'VERIFIED SKILLS', v: 'with the work sample an employer can open' },
]

export interface StoryStep {
  key: string
  stage: 'start' | 'learn' | 'practice' | 'prove' | 'gap' | 'hired'
  label: string
  title: string
  body: string
}

/** Maya's path, one card per move. Illustrative. */
export const STORY: StoryStep[] = [
  {
    key: 'start',
    stage: 'start',
    label: 'Week 1 · Day 1',
    title: 'The pretest tells the plan what she already has.',
    body: 'Maya scores 80%. Her path starts at the gap, not at page one. Theo scores 34% and gets the whole route. Same cohort, two plans.',
  },
  {
    key: 'learn',
    stage: 'learn',
    label: 'Week 1 · 8:12 am',
    title: 'A three-minute lesson on one skill.',
    body: 'Between shifts, on her phone. An instructor or an industry creator, one idea, then straight into an exercise. No forty-minute lecture to sit through first.',
  },
  {
    key: 'practice',
    stage: 'practice',
    label: 'Week 1 · 8:14 am',
    title: 'Real work, alongside an AI agent.',
    body: 'A help desk ticket lands. The agent drafts a fix. Maya’s job is to verify the caller, catch what the agent got wrong and decide. That is the job now, so that is the exercise.',
  },
  {
    key: 'prove',
    stage: 'prove',
    label: 'Week 1 · 8:16 am',
    title: 'Scored against the program’s pass mark. A skill is verified.',
    body: 'Scored by AI against the rubric the program set, with the attempt and the work sample saved for an instructor or an employer to open. Not a quiz score: evidence.',
  },
  {
    key: 'gap',
    stage: 'gap',
    label: 'Week 1 · 8:17 am',
    title: 'The miss adds the next lesson, not a retake.',
    body: 'Her weakest rubric row was the DNS lookup. Her plan grows by one short lesson on DNS basics, then the exercise again. Learn once, deeply. Learn often, as the work changes.',
  },
  {
    key: 'hired',
    stage: 'hired',
    label: 'Week 12 · Talent Match, coming soon',
    title: 'An employer searches by verified skill and finds her.',
    body: 'Maya chose which employers can see her profile. One opens her caller-verification work sample and books an interview, and the interview is logged in the same record her program reports from.',
  },
]

export interface Persona {
  key: string
  tab: string
  headline: string
  lead: string
  metricLabel: string
  metric: string
  metricNote: string
  points: string[]
  cta: string
}

/** The same product, said five ways. Picked by the segmented control. */
export const PERSONAS: Persona[] = [
  {
    key: 'agency',
    tab: 'Workforce agency',
    headline: 'One system of record across every provider you fund.',
    lead: 'Every contractor you fund or mandate reports into the same measures with the same definitions. Providers sit side by side instead of arriving in a hundred formats.',
    metricLabel: 'What you see',
    metric: 'Every cohort',
    metricNote: 'enrollment, attendance, skill gains, credentials and exit records, by provider',
    points: [
      'Branded for your state, with every funded provider on one tenant',
      'Exit records export in the shape your wage-record match needs',
      'Eligible training provider list (ETPL) renewal data collected once, not re-requested each year',
    ],
    cta: 'Request a state briefing',
  },
  {
    key: 'provider',
    tab: 'Training provider',
    headline: 'Run the cohort you already teach. Keep the proof.',
    lead: 'Your curriculum, attendance, milestones and outcome exports in one place, with ready-made pathways and simulations when you want them.',
    metricLabel: 'What you stop doing',
    metric: 'Spreadsheets',
    metricNote: 'for attendance, pretest placement, gradebooks and the quarterly funder report',
    points: [
      'Attendance in a tap, with time-on-task for learners working on their own',
      'A pretest that places each learner, so strong students skip what they know',
      'Milestone due dates per module; who is behind shows up before the deadline',
      'Completion, skill gains and credentials ready for your provider-list renewal',
    ],
    cta: 'Book a cohort walkthrough',
  },
  {
    key: 'college',
    tab: 'College',
    headline: 'Job simulations next to the degree. Employers at the end of it.',
    lead: 'Pair credit and non-credit programs with practice of the actual job and a verified-skills profile graduates own.',
    metricLabel: 'What changes',
    metric: 'Proof',
    metricNote: 'a scored work sample for every skill, not a transcript line',
    points: [
      'Launch from the LMS you already run over LTI 1.3; scores pass back',
      'Micro-credentials tied to skills a learner has shown, not seat time',
      'Graduates reach partner employers without a second registration system',
    ],
    cta: 'Book a walkthrough',
  },
  {
    key: 'employer',
    tab: 'Employer',
    headline: 'Upskill the staff you have. Fast, and to proof.',
    lead: 'Short lessons on the skill a team needs this quarter, practice in simulations of their actual work, and a supervisor view of who is ready.',
    metricLabel: 'Time to first verified skill',
    metric: 'Week 1',
    metricNote: 'not the end of a course',
    points: [
      'Live instructor-led sessions with attendance when the contract calls for them',
      'Supervisors see progress and who has stalled',
      'Job matching is yours to switch on, never a default',
    ],
    cta: 'Ask for a course outline',
  },
  {
    key: 'learner',
    tab: 'Learner',
    headline: 'Learn between shifts. Show up with proof.',
    lead: 'Short lessons on your phone, real exercises, and a record of what you can do that you choose to share with employers.',
    metricLabel: 'A lesson takes',
    metric: '3 min',
    metricNote: 'then a real exercise, then a skill in your record',
    points: [
      'Already know it? Pass the exercise and move on',
      'Need longer? The next lesson covers the gap, and your instructor sees where you are',
      'Your program sees your progress. Employers see only what you share. Your work is never used to train AI',
    ],
    cta: 'Sign in with your program',
  },
]

/** The spec sheet: what the platform speaks, in the words an IT office uses. */
export const SPECS = [
  {
    k: 'LTI 1.3',
    v: 'Platform and tool. Launch from your LMS, or launch tools into a pathway here. Scores pass back both ways.',
  },
  {
    k: 'SCORM',
    v: 'SCORM 1.2 and 2004 packages play inside a pathway, including Rise and Storyline output.',
  },
  {
    k: 'Rosters',
    v: 'Learners join by cohort code or are added by email. Completions, attendance, skill gains and exit records export as CSV.',
  },
  {
    k: 'Sign-in',
    v: 'Google or a one-time email code today; your identity provider on the roadmap.',
  },
  {
    k: 'Data',
    v: 'You own it. Learner work is never used to train models. Learners choose which organizations see their profile.',
  },
  {
    k: 'Access',
    v: 'Captioned video lessons. Simulation and interview answers by voice or by typing.',
  },
]

/** World Economic Forum, Future of Jobs Report 2025. */
export const WHY = [
  { n: '39%', s: 'of workers’ core skills change by 2030' },
  { n: '59%', s: 'of the workforce needs reskilling by 2030' },
  { n: '63%', s: 'of employers call skills gaps their biggest barrier' },
]

/** Licensing models, no prices. */
export const BUY = [
  { k: 'Pathway seat', v: 'per learner, per pathway, for a term' },
  { k: 'Cohort', v: 'one flat fee a single grant line can cover' },
  { k: 'Site license', v: 'unlimited learners and pathways' },
  { k: 'State license', v: 'every funded provider on one state tenant' },
]

export const PILOT = [
  { t: 'Pick a pathway', b: 'One of the five shown, or bring your own curriculum.' },
  { t: 'Enroll a cohort', b: 'We onboard your learners, instructors and creators in weeks.' },
  {
    t: 'Connect employers',
    b: 'Your employer partners see each learner’s verified skills and work samples.',
  },
]
