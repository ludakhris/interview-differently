/**
 * Copy for the homepage, kept out of the component so the page reads as layout.
 * Written to the administrator who buys and reports, not to the learner. Fictional learners;
 * funder definitions are the public WIOA ones.
 */

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
    title: 'Micro-Learning',
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

export type ManualIcon = 'sheet' | 'video' | 'quiz' | 'list' | 'pile'

/** The five components: the manual work each replaces, and what the app does instead. */
export const COMPONENTS: { name: string; icon: ManualIcon; manual: string; now: string }[] = [
  {
    name: 'Learner Management',
    icon: 'sheet',
    manual: 'The gradebook, the attendance sheet and the roster, kept by hand in three files',
    now: 'Attendance in a tap, progress logged as learners work, the report exported from one record',
  },
  {
    name: 'Micro Learning',
    icon: 'video',
    manual: 'Lecture recordings nobody finishes, with no way to know who watched',
    now: 'Three-minute lessons that end in an exercise; who watched and who passed is logged',
  },
  {
    name: 'Skill Simulator',
    icon: 'quiz',
    manual: 'A quiz that proves recall, graded and keyed in after class',
    now: 'A simulation of the job, scored on the spot, work sample saved to the record',
  },
  {
    name: 'Job Board Match',
    icon: 'list',
    manual: 'A job list learners search by title, and placements tracked by asking around',
    now: 'Roles matched to verified skills; the match lands on the record',
  },
  {
    name: 'Talent Match',
    icon: 'pile',
    manual: 'A resume pile employers search by keyword',
    now: 'Employers search by verified skill, work sample attached; the hire lands on the record',
  },
]

/** The measures programs are held to, shown under the hero with how each is met, and again by when. */
export const MEASURES = [
  {
    name: 'Measurable Skill Gains',
    when: 'Every scored exercise',
    how: 'Skill gains documented instantly, from the first exercise. AI adapts each learning plan, accelerating ready learners and adding lessons where gaps remain.',
  },
  {
    name: 'Program Completion',
    when: 'Every module',
    how: 'Each learner’s progress in real time, with participation and support needs visible, so who is at risk shows before the end date.',
  },
  {
    name: 'Credential Attainment',
    when: 'Readiness, then the credential',
    how: 'See who is ready for the exam and who can do the job, then track credentials earned for reporting and verification.',
  },
]

/** The tiles under the hero: the main measures plus Employment Outcomes, each with how it is met. */
export const HERO_MEASURES = [
  ...MEASURES,
  {
    name: 'Employment Outcomes',
    how: 'Replace spreadsheets with automated, real-time outcome dashboards and reports that connect training to employment results.',
  },
]

/** Two more a grant agreement asks for, by when each is captured. */
export const MEASURES_MORE = [
  { name: 'Enrollment Target Fulfillment', when: 'On enrollment, day 1' },
  { name: 'Employment Outcomes', when: 'At the job offer' },
]

export const PROVENANCE =
  'Pull it the day of the grant meeting, or quickly during an audit. Every number traces back to a learner’s record.'

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
