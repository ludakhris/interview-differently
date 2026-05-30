import { yamlToScenario } from './yamlScenario'

import ops001Yaml from './scenarios/ops-001.yaml?raw'
import ops001ImmersiveYaml from './scenarios/ops-001-immersive.yaml?raw'
import biz001Yaml from './scenarios/biz-001.yaml?raw'
import bizCase001Yaml from './scenarios/biz-case-001.yaml?raw'
import bizCase002Yaml from './scenarios/biz-case-002.yaml?raw'
import bizCase003Yaml from './scenarios/biz-case-003.yaml?raw'
import bizCase004Yaml from './scenarios/biz-case-004.yaml?raw'
import bizCase005Yaml from './scenarios/biz-case-005.yaml?raw'
import bizCase006Yaml from './scenarios/biz-case-006.yaml?raw'
import risk001Yaml from './scenarios/risk-001.yaml?raw'
import ops002Yaml from './scenarios/ops-002.yaml?raw'

export const scenarios = [
  yamlToScenario(ops001Yaml),
  yamlToScenario(ops001ImmersiveYaml),
  yamlToScenario(biz001Yaml),
  yamlToScenario(bizCase001Yaml),
  yamlToScenario(bizCase002Yaml),
  yamlToScenario(bizCase003Yaml),
  yamlToScenario(bizCase004Yaml),
  yamlToScenario(bizCase005Yaml),
  yamlToScenario(bizCase006Yaml),
  yamlToScenario(risk001Yaml),
  yamlToScenario(ops002Yaml),
]

// Rotating palette — tracks are assigned colors in definition order.
// Add new tracks and their color will be picked automatically.
const TRACK_PALETTE = ['#1a6b3c', '#d4830a', '#7b3fa0', '#1a5a8a', '#8a3a1a', '#1a7a7a']

export const trackMeta: Record<
  string,
  { label: string; description: string; color: string; icon: string }
> = Object.fromEntries(
  (
    [
      [
        'operations',
        {
          label: 'Incident Response',
          description:
            "A critical, customer-impacting issue surfaces. Monitors are alerting across payment processing and authentication. Your SLA breach window is 13 minutes. You're the on-call engineer. What's your first move?",
          icon: 'AlertTriangle',
        },
      ],
      [
        'business',
        {
          label: 'Business Decisions',
          description:
            "You're evaluating whether to launch a new print magazine. Each decision unlocks a new constraint — distribution costs, content overhead, a marketing spend that eliminates your margin entirely. Getting the numbers right is the floor. Questioning your own conclusion is the ceiling.",
          icon: 'BarChart3',
        },
      ],
      [
        'business case',
        {
          label: 'Business Cases',
          description:
            "Real consulting-style case interviews. A client walks in with a profitability drop, a market-entry question, an acquisition target, or a pricing puzzle — and a stack of exhibits. Read the data, structure your hypotheses, run the math, and defend a recommendation. Modeled on top-tier strategy consulting interview patterns.",
          icon: 'Briefcase',
        },
      ],
      [
        'risk',
        {
          label: 'Risk & Compliance',
          description:
            "During a routine review, you discover employee passwords stored in plain text in a shared internal document. No incident has occurred. No one flagged it. The scenario doesn't tell you what to do — it asks you. Who do you notify first, and how?",
          icon: 'Scale',
        },
      ],
    ] as [string, { label: string; description: string; icon: string }][]
  ).map(([key, meta], i) => [
    key,
    { ...meta, color: TRACK_PALETTE[i % TRACK_PALETTE.length] },
  ])
)
