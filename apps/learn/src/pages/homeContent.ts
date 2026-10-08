/** The five example pathways on the homepage. Scenarios, skills and roles are illustrative. */

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
