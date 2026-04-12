import { yamlToScenario } from './yamlScenario'

import ops001Yaml from './scenarios/ops-001.yaml?raw'
import ops001ImmersiveYaml from './scenarios/ops-001-immersive.yaml?raw'
import biz001Yaml from './scenarios/biz-001.yaml?raw'
import risk001Yaml from './scenarios/risk-001.yaml?raw'
import ops002Yaml from './scenarios/ops-002.yaml?raw'

export const scenarios = [
  yamlToScenario(ops001Yaml),
  yamlToScenario(ops001ImmersiveYaml),
  yamlToScenario(biz001Yaml),
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
          label: 'Business Case',
          description:
            "You're evaluating whether to launch a new print magazine. Each decision unlocks a new constraint — distribution costs, content overhead, a marketing spend that eliminates your margin entirely. Getting the numbers right is the floor. Questioning your own conclusion is the ceiling.",
          icon: 'BarChart3',
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
