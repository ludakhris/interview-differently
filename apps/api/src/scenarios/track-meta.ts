export const TRACK_META: Record<string, {
  label: string
  description: string
  color: string
  icon: string
}> = {
  operations: {
    label: 'Incident Response',
    description: 'A critical, customer-impacting issue surfaces. Monitors are alerting across payment processing and authentication. Your SLA breach window is 13 minutes. You\'re the on-call engineer. What\'s your first move?',
    color: '#1a6b3c',
    icon: 'AlertTriangle',
  },
  business: {
    label: 'Business Case',
    description: 'You\'re evaluating whether to launch a new print magazine. Each decision unlocks a new constraint — distribution costs, content overhead, a marketing spend that eliminates your margin entirely. Getting the numbers right is the floor. Questioning your own conclusion is the ceiling.',
    color: '#d4830a',
    icon: 'BarChart3',
  },
  risk: {
    label: 'Risk & Compliance',
    description: 'During a routine review, you discover employee passwords stored in plain text in a shared internal document. No incident has occurred. No one flagged it. The scenario doesn\'t tell you what to do — it asks you. Who do you notify first, and how?',
    color: '#7b3fa0',
    icon: 'Scale',
  },
  'customer-success': {
    label: 'Customer Success',
    description: 'Navigate complex customer relationships and retention challenges.',
    color: '#0a7bbf',
    icon: 'Users',
  },
  general: {
    label: 'General',
    description: 'General workplace decision-making scenarios.',
    color: '#4a5568',
    icon: 'Briefcase',
  },
}
