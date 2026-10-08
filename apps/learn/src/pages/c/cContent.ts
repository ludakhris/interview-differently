/**
 * Copy for Design C: Design B's buyer-first content in Design A's visual system, shorter.
 * Written to the administrator who buys and reports, not to the learner. Fictional learners;
 * funder definitions are the public WIOA ones.
 */

/** The three anchors beside "Training that behaves like the job." */
export const ANCHORS = [
  {
    k: 'MEASURABLE SKILLS GAINED',
    v: 'Every exercise is scored against the program’s pass mark, so skill gains show up in week one, not at the final exam.',
  },
  {
    k: 'OUTCOMES ALREADY TRACKED',
    v: 'Completion, credentials and skill gains land in one record while learners work. Nothing is re-entered.',
  },
  {
    k: 'REPORT ONCE',
    v: 'Exports in the terms your funders use: Measurable Skill Gains, Credential Attainment, Program Completion.',
  },
]

/** Two learners, one start, one endpoint, different routes. Illustrative. */
export const PACE = [
  {
    name: 'Maya',
    score: '80%',
    weeks: 6,
    note: 'Three skills to verify. Skips what the assessment showed she already has. Job-ready by week six.',
  },
  {
    name: 'Theo',
    score: '34%',
    weeks: 10,
    note: 'The whole route, with a lesson added at each of two gaps. Same outcome by week ten.',
  },
]

/** The loop in three moves, for the team reading it. */
export const LOOP = [
  {
    key: 'learn',
    title: 'Learn',
    body: 'A three-minute lesson on one skill, then straight into an exercise. Learners do it on a phone between shifts; your instructors see who did.',
  },
  {
    key: 'practice',
    title: 'Practice',
    body: 'Real work alongside an AI agent: a ticket lands, the agent drafts a fix, the learner verifies the caller and decides. That is the job now, so that is the exercise.',
  },
  {
    key: 'prove',
    title: 'Prove',
    body: 'Scored against the pass mark your program set, with the work sample saved. A pass is a verified skill on the record. A miss sends the loop around again.',
  },
]

/** The model most programs still run, in three lines, and what changes. */
export const TRADITIONAL = [
  {
    from: 'One pace for the whole cohort',
    to: 'Each learner placed by a skills assessment modeled on the job',
  },
  { from: 'Grades at the finish line', to: 'Skill gains documented from the first exercise' },
  {
    from: 'Four spreadsheets and a quarterly scramble',
    to: 'One record, exported once in your funders’ terms',
  },
]

export interface Persona {
  key: string
  tab: string
  headline: string
  lead: string
  stops: string
  points: string[]
  cta: string
}

/** The same product from each buyer's seat. "What your team stops doing" is the hook. */
export const PERSONAS: Persona[] = [
  {
    key: 'provider',
    tab: 'Training provider',
    headline: 'Run the cohorts you already teach. Lose the spreadsheets.',
    lead: 'Attendance, placement, milestones, the gradebook and the funder report in one place, with ready-made pathways and simulations when you want them.',
    stops: 'Four spreadsheets, and the quarterly scramble to reconcile them.',
    points: [
      'A skills assessment modeled on the job places each learner: strong students skip what they know, others get the full route',
      'Attendance in a tap, with time-on-task for learners working on their own',
      'Measurable Skill Gains, credential attainment and completion ready for your provider-list renewal',
    ],
    cta: 'Book a cohort walkthrough',
  },
  {
    key: 'agency',
    tab: 'Workforce agency',
    headline: 'One system of record across every provider you fund.',
    lead: 'Every contractor you fund or mandate reports into the same measures with the same definitions. Providers sit side by side instead of arriving in a hundred formats.',
    stops: 'Reconciling a different spreadsheet from every provider, every quarter.',
    points: [
      'Branded for your state, with every funded provider on one tenant',
      'MSG, credential attainment and completion defined once, reported the same way by everyone',
      'Exit records export in the shape your wage-record match needs',
    ],
    cta: 'Request a state briefing',
  },
  {
    key: 'college',
    tab: 'College',
    headline: 'Job simulations next to the degree. Employers at the end of it.',
    lead: 'Pair credit and non-credit programs with practice of the actual job and a verified-skills profile graduates own.',
    stops:
      'A second registration system for non-credit learners, and evidence assembled by hand each quarter.',
    points: [
      'Launch from the LMS you already run over LTI 1.3; scores pass back',
      'Micro-credentials tied to skills a learner has shown, not seat time',
      'Graduates reach partner employers without re-registering anywhere',
    ],
    cta: 'Book a walkthrough',
  },
  {
    key: 'employer',
    tab: 'Employer',
    headline: 'Upskill the staff you have. Fast, and to proof.',
    lead: 'Short lessons on the skill a team needs this quarter, practice in simulations of their actual work, and a supervisor view of who is ready.',
    stops: 'Training spend with no measurable improvement to show for it.',
    points: [
      'First verified skill in week one, not at the end of a course',
      'Live instructor-led sessions with attendance when the contract calls for them',
      'Supervisors see progress and who has stalled; job matching is yours to switch on, never a default',
    ],
    cta: 'Ask for a course outline',
  },
  {
    key: 'learner',
    tab: 'Learner',
    headline: 'Learn between shifts. Show up with proof.',
    lead: 'Short lessons on your phone, real exercises, and a record of what you can do that you choose to share with employers.',
    stops: 'Sitting through four weeks of what you already know.',
    points: [
      'Already know it? Pass the exercise and move on',
      'Need longer? The next lesson covers the gap, and your instructor sees where you are',
      'Your program sees your progress. Employers see only what you share. Your work is never used to train AI',
    ],
    cta: 'Sign in with your program',
  },
]

export type ManualIcon = 'sheet' | 'video' | 'quiz' | 'list' | 'pile'

/** The five components, each tied to the manual work it replaces. */
export const COMPONENTS: { name: string; icon: ManualIcon; manual: string; now: string }[] = [
  {
    name: 'Learning Management',
    icon: 'sheet',
    manual: 'The gradebook, the attendance sheet and the roster, kept by hand in three files',
    now: 'One record per learner that the report is built from',
  },
  {
    name: 'Micro Learning',
    icon: 'video',
    manual: 'Lecture recordings nobody finishes, with no way to know who watched',
    now: 'Three-minute lessons that end in an exercise your instructors can see',
  },
  {
    name: 'Skill Simulator',
    icon: 'quiz',
    manual: 'A quiz that proves recall, graded and keyed in after class',
    now: 'A simulation of the job, scored on the spot, work sample saved',
  },
  {
    name: 'Job Board Match',
    icon: 'list',
    manual: 'A job list learners search by title, and placements tracked by asking around',
    now: 'Roles matched to verified skills, and the match on the record',
  },
  {
    name: 'Talent Match',
    icon: 'pile',
    manual: 'A resume pile employers search by keyword',
    now: 'Candidates searched by verified skill, with the work sample attached',
  },
]

/** The measures funders ask for, with the definitions programs are held to. */
export const MEASURES = [
  {
    name: 'Measurable Skill Gains',
    abbr: 'MSG',
    def: 'The share of participants who show documented academic, technical, occupational or other progress toward a credential or employment during the program year.',
    how: 'Every scored exercise and simulation is documented progress. The gain is on the record the day it happens.',
  },
  {
    name: 'Credential Attainment Rate',
    abbr: 'CAR',
    def: 'The share of participants who earn a recognized postsecondary credential, an industry-valued certificate or a secondary school diploma.',
    how: 'The credential each program leads to is on the record, and attainment exports with the cohort.',
  },
  {
    name: 'Program Completion Rate',
    abbr: 'PCR',
    def: 'The share of enrolled individuals who finish all required modules of the curriculum.',
    how: 'Completion is tracked per module and per learner, so who is at risk shows before the end date, not after.',
  },
]

/** Two more a grant agreement asks for. Placement arrives with Talent Match; say so. */
export const MEASURES_MORE = [
  {
    name: 'Enrollment Target Fulfillment',
    abbr: '% ENROLLED',
    def: 'Grant agreements set a number to serve (“the grantee will enroll 100 participants”). The metric: actual enrolled ÷ target enrollment contracted.',
    how: 'Enrollment is counted the moment someone joins by cohort code or is added by email. Put the contracted target on the cohort and the rate is on the dashboard every day of the grant, not at the close-out.',
  },
  {
    name: 'Initial Job Placement',
    abbr: 'DAY-1 EMPLOYMENT',
    def: 'A job offer secured, or work started, on the first official day after completing a training program, apprenticeship, or pre-release and reentry track.',
    how: 'Offers and start dates land on the learner’s record from Talent Match, so day-one employment is a count on the cohort, not a survey after the fact.',
    soon: 'With Talent Match',
  },
]

export const PROVENANCE =
  'Skill gains, credentials and completion come from the platform. Employment and earnings after exit come from your state’s wage-record match; the exit file exports in the shape it needs.'

export const WALKTHROUGH = [
  {
    t: 'Bring a cohort',
    b: 'Your curriculum or one of the pathways shown. We load it before the call.',
  },
  {
    t: 'Watch it run',
    b: 'Enrollment, a lesson, a scored simulation, the plan changing, the export.',
  },
  {
    t: 'Leave with the report',
    b: 'A sample outcomes export in your funders’ terms, from the cohort you brought.',
  },
]
