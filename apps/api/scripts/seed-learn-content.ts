/**
 * Sample quiz questions and lesson text for the demo courses. Fictional
 * training content, written to look right in a demo, not to certify anyone.
 * Each course has four questions; the pre and post assessments use all four and
 * the knowledge checks use two each.
 */
export interface Question {
  prompt: string
  options: string[]
  correctIndex: number
}

// The right answer is written first; `rotate` moves it so it is not always "A".
const q = (prompt: string, right: string, ...wrong: string[]): [string, string[]] => [
  prompt,
  [right, ...wrong],
]

const BANKS: Record<string, [string, string[]][]> = {
  'harbor-point': [
    q(
      'Which two identifiers confirm a patient’s identity?',
      'Full name and date of birth',
      'Room number and insurer',
      'First name and phone area code',
      'Appointment time and provider'
    ),
    q(
      'A normal resting pulse for an adult is about:',
      '60 to 100 beats a minute',
      '20 to 40 beats a minute',
      '120 to 160 beats a minute',
      '180 to 200 beats a minute'
    ),
    q(
      'Before taking a blood pressure reading you should:',
      'Let the patient sit quietly for a few minutes',
      'Ask them to talk through their history',
      'Take it while they are standing',
      'Have them hold their breath'
    ),
    q(
      'A patient reports a symptom. In the chart you write:',
      'What the patient said, in their own words',
      'Your guess at the diagnosis',
      'Nothing, if you are unsure',
      'A summary for the next patient'
    ),
  ],
  tidewater: [
    q(
      'Before moving a resident you should first:',
      'Explain what you are about to do',
      'Lift quickly to save time',
      'Wait for a visitor to help',
      'Skip the gait belt'
    ),
    q(
      'The best way to stop infection spreading between residents:',
      'Wash hands before and after care',
      'Wear the same gloves all shift',
      'Share equipment without cleaning it',
      'Skip gowns on a quiet day'
    ),
    q(
      'A resident refuses a bath. You should:',
      'Respect it, ask why, and report it',
      'Insist so the schedule holds',
      'Leave and say nothing',
      'Bathe them while they sleep'
    ),
    q(
      'A gait belt helps you:',
      'Assist transfers and walking safely',
      'Measure blood pressure',
      'Feed a resident',
      'Lock a wheelchair'
    ),
  ],
  'lantern-hill': [
    q(
      'A user cannot load websites but can print to the office printer. Most likely cause:',
      'An internet or DNS problem',
      'Low printer toner',
      'Monitor brightness',
      'The keyboard layout'
    ),
    q(
      'The best first step in troubleshooting is to:',
      'Gather information and reproduce the problem',
      'Reinstall the operating system',
      'Replace the hardware',
      'Escalate immediately'
    ),
    q(
      'A caller asks for a password reset. First:',
      'Verify who they are',
      'Reset it right away',
      'Ask them to email the old password',
      'Tell them to try next week'
    ),
    q(
      'Multi-factor authentication protects an account by requiring:',
      'A second proof of identity',
      'A longer password only',
      'A password change every week',
      'A bigger monitor'
    ),
  ],
  'cedar-mill': [
    q(
      'Before working on a circuit you should:',
      'Lock out and tag out the power',
      'Assume it is off',
      'Test it with a damp hand',
      'Cut the wires first'
    ),
    q('Ohm’s law relates voltage, current and:', 'Resistance', 'Weight', 'Color', 'Length of day'),
    q(
      'Which protects your eyes on the job?',
      'Safety glasses rated for the task',
      'Sunglasses',
      'Earbuds',
      'A cap'
    ),
    q(
      'A 20-amp circuit needs wire rated at least:',
      '12 gauge copper',
      '18 gauge copper',
      '24 gauge copper',
      'An extension cord'
    ),
  ],
  'open-road': [
    q(
      'A pre-trip inspection covers:',
      'Brakes, tires, lights and coupling',
      'Only the radio',
      'The paint color',
      'The seat covers'
    ),
    q(
      'Hours-of-service rules exist to:',
      'Reduce fatigue-related crashes',
      'Raise fuel prices',
      'Limit bad weather',
      'Control radio use'
    ),
    q(
      'Following distance in a loaded truck should be:',
      'Several seconds, more at higher speeds',
      'One car length',
      'Bumper to bumper',
      'Whatever feels fine'
    ),
    q(
      'If brakes begin to fade on a long downhill, you should have:',
      'Dropped to a lower gear before the grade',
      'Turned off the engine',
      'Shifted into neutral',
      'Pumped the horn'
    ),
  ],
  bayline: [
    q(
      'Before operating a forklift you must:',
      'Be trained and certified, and inspect it',
      'Let a friend ride the forks',
      'Skip the horn',
      'Carry loads high for visibility'
    ),
    q(
      'Scanning each item as you pick an order helps:',
      'Keep inventory counts accurate',
      'Slow the line down',
      'Hide mistakes',
      'Avoid reading labels'
    ),
    q(
      'A damaged pallet should be:',
      'Reported and taken out of use',
      'Stacked anyway',
      'Painted over',
      'Hidden at the back'
    ),
    q(
      'Safe lifting means:',
      'Bend your knees and keep the load close',
      'Bend at the waist',
      'Always lift alone',
      'Twist while carrying'
    ),
  ],
  'marsh-creek': [
    q(
      'The food-temperature “danger zone” is roughly:',
      '41 to 135 °F',
      '0 to 30 °F',
      '150 to 200 °F',
      'Below freezing'
    ),
    q(
      'To prevent cross-contamination:',
      'Use separate boards for raw meat and produce',
      'Rinse the board with cold water',
      'Use one towel for everything',
      'Store raw chicken above ready foods'
    ),
    q(
      'Food cost percent is:',
      'Food cost divided by food sales',
      'Sales divided by labor',
      'Labor times hours',
      'Rent divided by days'
    ),
    q(
      'A guest mentions a severe allergy. You should:',
      'Take it seriously and confirm ingredients with the kitchen',
      'Say it is probably fine',
      'Offer a coupon',
      'Skip it to keep service moving'
    ),
  ],
  ridgeline: [
    q(
      'Before running a CNC program for the first time:',
      'Dry-run it and check the offsets',
      'Run it at maximum feed',
      'Remove the guards',
      'Skip the setup sheet'
    ),
    q('A micrometer is used to:', 'Take precise measurements', 'Cut metal', 'Weld', 'Lubricate'),
    q(
      'Around rotating machinery you should wear:',
      'Safety glasses, no loose sleeves or jewelry',
      'Loose sleeves',
      'Rings',
      'Headphones only'
    ),
    q(
      'A tolerance of ±0.005 in means the part may vary by:',
      'Up to five thousandths of an inch either way',
      'Five inches',
      'Half an inch',
      'Nothing at all'
    ),
  ],
}

/** Moves the right answer (written first) to a different slot for each question. */
function rotate(options: string[], shift: number): { options: string[]; correctIndex: number } {
  const n = options.length
  const correctIndex = shift % n
  const out = new Array<string>(n)
  out[correctIndex] = options[0]
  const rest = options.slice(1)
  let r = 0
  for (let i = 0; i < n; i++) if (i !== correctIndex) out[i] = rest[r++]
  return { options: out, correctIndex }
}

export function questionsFor(key: string): Question[] {
  return (BANKS[key] ?? BANKS['harbor-point']).map(([prompt, options], i) => ({
    prompt,
    ...rotate(options, i + 1),
  }))
}

export function lessonBody(title: string, program: string): string {
  return [
    `${title}`,
    '',
    `This is sample content for the ${program} demonstration course.`,
    '',
    'In a real course, a lesson like this is short: one skill, a worked example from the job, and an exercise to try.',
    '',
    'Key points',
    '- Know why the step matters before you learn how to do it.',
    '- Practice on a realistic task, then check your work.',
    '- Ask for help early. Your instructor is there for it.',
  ].join('\n')
}

/** Three practice-interview questions that fit most entry-level roles. */
export function interviewQuestions(program: string): string[] {
  return [
    `Tell me why you want to work as a ${program}, and what you have done to prepare.`,
    'Describe a time you helped someone or solved a problem under pressure. What did you do, and what happened?',
    'What would you do if you noticed a coworker making a mistake that could affect safety or quality?',
  ]
}

const OUTCOMES: Record<string, string[]> = {
  'harbor-point': [
    'Take and record vital signs accurately',
    'Prepare patients and rooms for an exam',
    'Chart visits and update records clearly',
    'Follow infection-control and patient-safety steps',
    'Communicate calmly with patients and the care team',
  ],
  tidewater: [
    'Assist residents with moving, bathing and meals safely',
    'Follow infection-prevention steps every time',
    'Document care and report changes promptly',
    'Treat every resident with dignity',
  ],
  'lantern-hill': [
    'Diagnose common hardware and network problems',
    'Walk users through fixes in plain language',
    'Verify identity before resetting an account',
    'Document tickets and escalate when needed',
  ],
  'cedar-mill': [
    'Work safely around electrical systems',
    'Read basic electrical drawings',
    'Use hand and power tools correctly',
    'Work as part of a crew',
  ],
  'open-road': [
    'Complete a thorough pre-trip inspection',
    'Operate a commercial vehicle safely',
    'Follow hours-of-service rules',
    'Plan routes and handle loads',
  ],
  bayline: [
    'Receive, store and pick orders accurately',
    'Use scanners and inventory systems',
    'Operate equipment safely',
    'Meet safety and shipping standards',
  ],
  'marsh-creek': [
    'Apply food-safety rules in a working kitchen',
    'Cost a menu and control waste',
    'Schedule and lead a small team',
    'Handle guest and allergy requests',
  ],
  ridgeline: [
    'Set up and run CNC machines safely',
    'Read blueprints and measure to tolerance',
    'Inspect parts for quality',
    'Work with a production team',
  ],
}

const ROLES: Record<string, string[]> = {
  'harbor-point': ['Medical assistant', 'Clinical assistant', 'Patient care technician'],
  tidewater: ['Certified nursing assistant', 'Home health aide', 'Patient care assistant'],
  'lantern-hill': ['Help desk technician', 'IT support specialist', 'Desktop support technician'],
  'cedar-mill': ["Electrician's apprentice", 'Electrical helper', 'Maintenance technician'],
  'open-road': ['Commercial truck driver', 'Local delivery driver', 'Regional driver'],
  bayline: ['Warehouse associate', 'Logistics technician', 'Forklift operator'],
  'marsh-creek': ['Kitchen supervisor', 'Shift manager', 'Food service manager trainee'],
  ridgeline: ['CNC machinist trainee', 'Machine operator', 'Quality inspector'],
}

export const outcomesFor = (key: string): string[] => OUTCOMES[key] ?? []
export const rolesFor = (key: string): string[] => ROLES[key] ?? []

/** What the course is for, written for the learner. */
export function summaryFor(key: string, program: string): string {
  const first = (ROLES[key] ?? [])[0]?.toLowerCase()
  return first
    ? `Hands-on training for entry-level ${first} roles. Learn the core skills, check your progress as you go, and finish with a practice interview, so you walk into the job interview ready. Sample content.`
    : `${program}. Sample content.`
}
