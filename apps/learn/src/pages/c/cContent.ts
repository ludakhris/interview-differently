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

/** The measures programs are held to. Readers know the terms; say only how each is tracked. */
export const MEASURES = [
  {
    name: 'Measurable Skill Gains',
    abbr: 'MSG',
    how: 'Every scored exercise and simulation is documented progress, on the record the day it happens.',
  },
  {
    name: 'Credential Attainment Rate',
    abbr: 'CAR',
    how: 'The credential each program leads to is on the record; attainment exports with the cohort.',
  },
  {
    name: 'Program Completion Rate',
    abbr: 'PCR',
    how: 'Tracked per module and per learner, so who is at risk shows before the end date.',
  },
]

/** Two more a grant agreement asks for. Placement arrives with Talent Match; say so. */
export const MEASURES_MORE = [
  {
    name: 'Enrollment Target Fulfillment',
    abbr: '% ENROLLED',
    how: 'Put the contracted target on the cohort; the rate is on the dashboard every day of the grant.',
  },
  {
    name: 'Initial Job Placement',
    abbr: 'DAY-1 EMPLOYMENT',
    how: 'Offers and start dates land on the record from Talent Match: a count, not a survey.',
    soon: 'With Talent Match',
  },
]

export const PROVENANCE =
  'Employment and earnings after exit still come from your state’s wage-record match; the platform hands it the exit file.'

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
