import type { Scenario } from '@id/types'

export const scenarios: Scenario[] = [
  {
    scenarioId: 'ops-001',
    title: 'Incident Response: Payment Degradation',
    track: 'operations',
    estimatedMinutes: 20,
    rubric: {
      dimensions: [
        {
          name: 'Prioritization Logic',
          description:
            'Does the candidate identify the highest-impact issue first and sequence their response correctly?',
        },
        {
          name: 'Stakeholder Communication',
          description:
            'Does the candidate communicate to the right people, at the right time, with the right level of detail?',
        },
        {
          name: 'Root Cause Reasoning',
          description:
            'Does the candidate think systematically about underlying causes rather than reacting to surface symptoms?',
        },
        {
          name: 'Confidence Under Pressure',
          description:
            'Does the candidate act decisively without overclaiming certainty or freezing in ambiguity?',
        },
      ],
    },
    nodes: [
      {
        nodeId: 'ops-001-n1',
        type: 'decision',
        narrative:
          "It's 2:47 PM on a Tuesday. You're three weeks into your role as a junior operations analyst at a fintech company. Your monitor lights up: payment API error rates have climbed to 14% in the last four minutes. Simultaneously, the auth service is showing elevated latency. The database connection pool shows a spike to 94% utilization. Your SLA breach window is 13 minutes away.",
        contextPanels: [
          { label: 'Payment API errors', value: '14.2%', type: 'alert' },
          { label: 'Auth latency', value: '+340ms', type: 'alert' },
          { label: 'DB connections', value: '94%', type: 'alert' },
          { label: 'SLA breach in', value: '13 min', type: 'metric' },
        ],
        choices: [
          {
            id: 'A',
            text: 'Immediately page your manager and the broader engineering team so everyone is aware.',
            nextNodeId: 'ops-001-n2a',
            qualitySignals: [
              { dimension: 'Prioritization Logic', quality: 'developing' },
              { dimension: 'Stakeholder Communication', quality: 'proficient' },
            ],
          },
          {
            id: 'B',
            text: 'Investigate the database connection spike first — it is likely the root cause of both the payment and auth issues.',
            nextNodeId: 'ops-001-n2b',
            qualitySignals: [
              { dimension: 'Prioritization Logic', quality: 'strong' },
              { dimension: 'Root Cause Reasoning', quality: 'strong' },
            ],
          },
          {
            id: 'C',
            text: 'Acknowledge the alert, post a brief status update to the incident channel, then begin investigating the payment API degradation as the highest-priority service.',
            nextNodeId: 'ops-001-n2c',
            qualitySignals: [
              { dimension: 'Prioritization Logic', quality: 'proficient' },
              { dimension: 'Stakeholder Communication', quality: 'strong' },
            ],
          },
          {
            id: 'D',
            text: 'Roll back the last deployment immediately — degraded services after a deployment is almost always a code issue.',
            nextNodeId: 'ops-001-n2d',
            qualitySignals: [
              { dimension: 'Prioritization Logic', quality: 'developing' },
              { dimension: 'Root Cause Reasoning', quality: 'developing' },
            ],
          },
        ],
      },
      {
        nodeId: 'ops-001-n2b',
        type: 'transition',
        narrative:
          'You pull the database metrics. The connection spike started 6 minutes ago — two minutes before the payment errors appeared. A query from the reporting service is holding long-running transactions open. This is almost certainly the cascade source.',
        nextNodeId: 'ops-001-n3',
      },
      {
        nodeId: 'ops-001-n2c',
        type: 'transition',
        narrative:
          'You post a quick status to #incidents and begin investigating. Your lead notices the update and thanks you for the heads-up. You have 10 minutes until SLA breach. The payment logs show errors originating from database timeouts.',
        nextNodeId: 'ops-001-n3',
      },
      {
        nodeId: 'ops-001-n2a',
        type: 'transition',
        narrative:
          'You page the team. Three engineers join the call. Everyone is waiting for someone to take point. Your manager asks: "What have you found so far?" You have not investigated yet. Six minutes have passed.',
        nextNodeId: 'ops-001-n3',
      },
      {
        nodeId: 'ops-001-n2d',
        type: 'transition',
        narrative:
          'You initiate a rollback. It takes four minutes to complete. When services come back up, the errors persist — the last deployment was not the cause. You now have nine minutes less and no closer to root cause.',
        nextNodeId: 'ops-001-n3',
      },
      {
        nodeId: 'ops-001-n3',
        type: 'decision',
        narrative:
          'Database investigation confirms it: the reporting service is running an unoptimized analytics query that holds connections open for 30+ seconds during peak load. You can kill the reporting service process now to immediately free connections, or you can throttle the query and monitor. Your manager has just joined the incident channel.',
        contextPanels: [
          { label: 'Root cause', value: 'Reporting query', type: 'info' },
          { label: 'Connection hold time', value: '30s avg', type: 'alert' },
          { label: 'SLA breach in', value: '7 min', type: 'metric' },
          { label: 'Manager', value: 'Online', type: 'info' },
        ],
        choices: [
          {
            id: 'A',
            text: 'Kill the reporting service process immediately to free database connections — fastest path to payment recovery.',
            nextNodeId: 'ops-001-n4a',
            qualitySignals: [
              { dimension: 'Confidence Under Pressure', quality: 'strong' },
              { dimension: 'Prioritization Logic', quality: 'strong' },
            ],
          },
          {
            id: 'B',
            text: 'Brief your manager first, then execute whichever action they recommend.',
            nextNodeId: 'ops-001-n4b',
            qualitySignals: [
              { dimension: 'Stakeholder Communication', quality: 'proficient' },
              { dimension: 'Confidence Under Pressure', quality: 'developing' },
            ],
          },
          {
            id: 'C',
            text: 'Throttle the reporting query at the database level and watch whether connection utilization drops within 90 seconds before taking further action.',
            nextNodeId: 'ops-001-n4c',
            qualitySignals: [
              { dimension: 'Root Cause Reasoning', quality: 'strong' },
              { dimension: 'Confidence Under Pressure', quality: 'proficient' },
            ],
          },
          {
            id: 'D',
            text: 'Document the root cause fully before taking action so the post-mortem write-up is accurate.',
            nextNodeId: 'ops-001-n4d',
            qualitySignals: [
              { dimension: 'Prioritization Logic', quality: 'developing' },
              { dimension: 'Confidence Under Pressure', quality: 'developing' },
            ],
          },
        ],
      },
      {
        nodeId: 'ops-001-n4a',
        type: 'feedback',
        narrative: 'resolved',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'ops-001-n4b',
        type: 'feedback',
        narrative: 'escalated',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'ops-001-n4c',
        type: 'feedback',
        narrative: 'throttled',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'ops-001-n4d',
        type: 'feedback',
        narrative: 'documented',
        contextPanels: [],
        choices: [],
      },
    ],
  },
  {
    scenarioId: 'biz-001',
    title: 'Business Case: New Magazine Launch',
    track: 'business',
    estimatedMinutes: 20,
    rubric: {
      dimensions: [
        {
          name: 'Quantitative Accuracy',
          description: 'Does the candidate use numbers correctly and identify when data is missing or unreliable?',
        },
        {
          name: 'Structured Reasoning',
          description:
            'Does the candidate frame the problem before jumping to conclusions and organize their analysis logically?',
        },
        {
          name: 'Challenging Assumptions',
          description:
            'Does the candidate identify and question the assumptions baked into the request?',
        },
        {
          name: 'Communication Clarity',
          description:
            'Does the candidate communicate findings in a way that is clear and actionable for a non-technical audience?',
        },
      ],
    },
    nodes: [
      {
        nodeId: 'biz-001-n1',
        type: 'decision',
        narrative:
          "You are a strategy analyst at a media and publishing company. You report to the VP of Business Development. It's Monday morning and she drops a brief into your inbox: leadership wants a recommendation by Friday on whether to launch a new lifestyle magazine targeting women aged 25-40. She has attached three slides. Slide 1: the category grew 4% last year. Slide 2: your company has printing capacity. Slide 3: a competitor launched in this category two years ago. She says: 'I need to know if this is worth pursuing.'",
        contextPanels: [
          { label: 'Category growth', value: '+4% YoY', type: 'info' },
          { label: 'Printing capacity', value: 'Available', type: 'info' },
          { label: 'Competitor entrants', value: '1 (2yr ago)', type: 'info' },
          { label: 'Deadline', value: 'Friday', type: 'metric' },
        ],
        choices: [
          {
            id: 'A',
            text: "Start building a financial model immediately — revenue projections and cost structure will tell you whether this is worth pursuing.",
            nextNodeId: 'biz-001-n2a',
            qualitySignals: [
              { dimension: 'Structured Reasoning', quality: 'developing' },
              { dimension: 'Quantitative Accuracy', quality: 'proficient' },
            ],
          },
          {
            id: 'B',
            text: 'Request a meeting with the VP to clarify what "worth pursuing" means — does she want a go/no-go or a prioritized list of risks?',
            nextNodeId: 'biz-001-n2b',
            qualitySignals: [
              { dimension: 'Structured Reasoning', quality: 'strong' },
              { dimension: 'Challenging Assumptions', quality: 'strong' },
            ],
          },
          {
            id: 'C',
            text: "Write a one-page framework first — define the evaluation criteria before gathering any data so your research is directed.",
            nextNodeId: 'biz-001-n2c',
            qualitySignals: [
              { dimension: 'Structured Reasoning', quality: 'strong' },
              { dimension: 'Quantitative Accuracy', quality: 'proficient' },
            ],
          },
          {
            id: 'D',
            text: "Research what the competitor who launched two years ago has done — their trajectory is the most relevant market signal you have.",
            nextNodeId: 'biz-001-n2d',
            qualitySignals: [
              { dimension: 'Structured Reasoning', quality: 'proficient' },
              { dimension: 'Challenging Assumptions', quality: 'proficient' },
            ],
          },
        ],
      },
      {
        nodeId: 'biz-001-n2b',
        type: 'transition',
        narrative:
          'Your VP appreciates the question. She says leadership has already directionally decided to launch — what they actually need is a risk assessment and a recommendation on launch timing. The framing of your entire analysis just changed.',
        nextNodeId: 'biz-001-n3',
      },
      {
        nodeId: 'biz-001-n2c',
        type: 'transition',
        narrative:
          'Your framework identifies five evaluation criteria: market size, competitive intensity, customer acquisition cost, content differentiation, and break-even timeline. You now know exactly what data you need and what you can deprioritize.',
        nextNodeId: 'biz-001-n3',
      },
      {
        nodeId: 'biz-001-n2a',
        type: 'transition',
        narrative:
          "You build a model, but you realize halfway through that you're missing subscriber acquisition cost, average revenue per user, and churn rate assumptions. You've spent six hours on inputs you'll have to guess at.",
        nextNodeId: 'biz-001-n3',
      },
      {
        nodeId: 'biz-001-n2d',
        type: 'transition',
        narrative:
          "The competitor data is useful but hard to interpret in isolation. You find their circulation numbers but can't determine profitability or whether their model is comparable to yours.",
        nextNodeId: 'biz-001-n3',
      },
      {
        nodeId: 'biz-001-n3',
        type: 'decision',
        narrative:
          "It's Wednesday. You have your analysis draft. The core finding: the market is real but the economics depend entirely on digital-physical bundling — standalone print doesn't pencil out. You need to present to your VP tomorrow. How do you frame the recommendation?",
        contextPanels: [
          { label: 'Print-only IRR', value: 'Negative', type: 'alert' },
          { label: 'Bundled IRR', value: '+18% (est.)', type: 'info' },
          { label: 'Key dependency', value: 'Digital strategy', type: 'metric' },
          { label: 'Presentation', value: 'Tomorrow', type: 'metric' },
        ],
        choices: [
          {
            id: 'A',
            text: 'Lead with the negative finding on print — "We recommend against launch" — then show the bundled scenario as a conditional path.',
            nextNodeId: 'biz-001-n4a',
            qualitySignals: [
              { dimension: 'Communication Clarity', quality: 'strong' },
              { dimension: 'Challenging Assumptions', quality: 'strong' },
            ],
          },
          {
            id: 'B',
            text: 'Present both scenarios without a recommendation and let leadership decide — you don\'t have enough information to commit.',
            nextNodeId: 'biz-001-n4b',
            qualitySignals: [
              { dimension: 'Communication Clarity', quality: 'developing' },
              { dimension: 'Structured Reasoning', quality: 'developing' },
            ],
          },
          {
            id: 'C',
            text: 'Lead with the bundled opportunity — frame it as "launch if we pair it with digital" with a clear set of conditions leadership needs to meet.',
            nextNodeId: 'biz-001-n4c',
            qualitySignals: [
              { dimension: 'Communication Clarity', quality: 'strong' },
              { dimension: 'Structured Reasoning', quality: 'strong' },
            ],
          },
          {
            id: 'D',
            text: 'Ask your VP how she wants you to frame it before you structure the presentation.',
            nextNodeId: 'biz-001-n4d',
            qualitySignals: [
              { dimension: 'Communication Clarity', quality: 'proficient' },
              { dimension: 'Challenging Assumptions', quality: 'proficient' },
            ],
          },
        ],
      },
      {
        nodeId: 'biz-001-n4a',
        type: 'feedback',
        narrative: 'direct',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'biz-001-n4b',
        type: 'feedback',
        narrative: 'hedged',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'biz-001-n4c',
        type: 'feedback',
        narrative: 'opportunity',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'biz-001-n4d',
        type: 'feedback',
        narrative: 'deferred',
        contextPanels: [],
        choices: [],
      },
    ],
  },
  {
    scenarioId: 'risk-001',
    title: 'Risk and Compliance: Password Storage Breach',
    track: 'risk',
    estimatedMinutes: 20,
    rubric: {
      dimensions: [
        {
          name: 'Escalation Path',
          description:
            'Does the candidate notify the right stakeholders in the right order given the risk severity?',
        },
        {
          name: 'Risk Calibration',
          description:
            'Does the candidate accurately assess severity — neither overstating nor understating the risk?',
        },
        {
          name: 'Regulatory Awareness',
          description:
            'Does the candidate recognize potential regulatory implications and factor them into their response?',
        },
        {
          name: 'Communication Clarity',
          description:
            'Does the candidate communicate technical risk clearly to a non-technical audience without creating panic?',
        },
      ],
    },
    nodes: [
      {
        nodeId: 'risk-001-n1',
        type: 'decision',
        narrative:
          "You are a new analyst at a financial services firm, three months in. During a routine process review, you discover that employee login passwords are stored in plain text in a shared internal document accessible across the organization. No one has flagged it. There is no evidence of misuse. No incident has occurred. You found it by accident.",
        contextPanels: [
          { label: 'Data exposed', value: 'Employee passwords', type: 'alert' },
          { label: 'Access scope', value: 'Org-wide', type: 'alert' },
          { label: 'Known incidents', value: 'None', type: 'info' },
          { label: 'Regulatory regime', value: 'SOX / GLBA', type: 'metric' },
        ],
        choices: [
          {
            id: 'A',
            text: 'Report it immediately to your direct manager and document that you did — this is above your authorization level to act on alone.',
            nextNodeId: 'risk-001-n2a',
            qualitySignals: [
              { dimension: 'Escalation Path', quality: 'strong' },
              { dimension: 'Risk Calibration', quality: 'proficient' },
            ],
          },
          {
            id: 'B',
            text: "Delete the document yourself — eliminating the exposure is the fastest way to reduce risk.",
            nextNodeId: 'risk-001-n2b',
            qualitySignals: [
              { dimension: 'Escalation Path', quality: 'developing' },
              { dimension: 'Regulatory Awareness', quality: 'developing' },
            ],
          },
          {
            id: 'C',
            text: "Investigate further first — confirm the scope of access and whether any external parties could have reached the document before escalating.",
            nextNodeId: 'risk-001-n2c',
            qualitySignals: [
              { dimension: 'Risk Calibration', quality: 'strong' },
              { dimension: 'Escalation Path', quality: 'proficient' },
            ],
          },
          {
            id: 'D',
            text: "Email the entire security team directly, CC the CTO, and describe the finding in detail.",
            nextNodeId: 'risk-001-n2d',
            qualitySignals: [
              { dimension: 'Escalation Path', quality: 'developing' },
              { dimension: 'Communication Clarity', quality: 'developing' },
            ],
          },
        ],
      },
      {
        nodeId: 'risk-001-n2a',
        type: 'transition',
        narrative:
          'Your manager thanks you and immediately escalates to the security team lead. Within an hour, the document is locked. Your manager asks you to write a brief incident summary for the compliance record. This will go into the audit trail.',
        nextNodeId: 'risk-001-n3',
      },
      {
        nodeId: 'risk-001-n2c',
        type: 'transition',
        narrative:
          'Your investigation shows the document has been accessible for at least 14 months and was last edited by the IT team. No external sharing links were ever generated. You now have better scope data, but you spent two hours before escalating.',
        nextNodeId: 'risk-001-n3',
      },
      {
        nodeId: 'risk-001-n2b',
        type: 'transition',
        narrative:
          "You delete the document. The next day, security discovers it in the audit log and asks who removed a shared credential store without authorization. You are called into a meeting with your manager and the security lead.",
        nextNodeId: 'risk-001-n3',
      },
      {
        nodeId: 'risk-001-n2d',
        type: 'transition',
        narrative:
          'The CTO replies all and asks why they weren\'t informed through the proper channel. The security lead is frustrated that the finding was shared over email before a containment plan was in place. Your manager calls you to debrief.',
        nextNodeId: 'risk-001-n3',
      },
      {
        nodeId: 'risk-001-n3',
        type: 'decision',
        narrative:
          'You have been asked to write the compliance incident summary. The security team has confirmed: no external breach occurred, exposure was internal only, and the root cause was a legacy IT onboarding document that was never decommissioned. How do you characterize the severity in your written summary?',
        contextPanels: [
          { label: 'External breach', value: 'None confirmed', type: 'info' },
          { label: 'Exposure scope', value: 'Internal only', type: 'info' },
          { label: 'Root cause', value: 'Legacy document', type: 'info' },
          { label: 'Regulatory flag', value: 'Required', type: 'alert' },
        ],
        choices: [
          {
            id: 'A',
            text: 'Characterize as high severity — any credential exposure in a regulated financial institution requires conservative classification regardless of confirmed impact.',
            nextNodeId: 'risk-001-n4a',
            qualitySignals: [
              { dimension: 'Risk Calibration', quality: 'strong' },
              { dimension: 'Regulatory Awareness', quality: 'strong' },
            ],
          },
          {
            id: 'B',
            text: 'Characterize as low severity — no breach occurred, exposure was internal, and the document has been remediated.',
            nextNodeId: 'risk-001-n4b',
            qualitySignals: [
              { dimension: 'Risk Calibration', quality: 'developing' },
              { dimension: 'Regulatory Awareness', quality: 'developing' },
            ],
          },
          {
            id: 'C',
            text: 'Characterize as medium severity — acknowledge the exposure and gap in controls, note the absence of confirmed impact, and flag for review by legal and compliance.',
            nextNodeId: 'risk-001-n4c',
            qualitySignals: [
              { dimension: 'Risk Calibration', quality: 'strong' },
              { dimension: 'Communication Clarity', quality: 'strong' },
            ],
          },
          {
            id: 'D',
            text: "Ask legal to classify it for you — they should own the severity call on anything with regulatory implications.",
            nextNodeId: 'risk-001-n4d',
            qualitySignals: [
              { dimension: 'Escalation Path', quality: 'proficient' },
              { dimension: 'Risk Calibration', quality: 'proficient' },
            ],
          },
        ],
      },
      {
        nodeId: 'risk-001-n4a',
        type: 'feedback',
        narrative: 'conservative',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'risk-001-n4b',
        type: 'feedback',
        narrative: 'minimized',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'risk-001-n4c',
        type: 'feedback',
        narrative: 'calibrated',
        contextPanels: [],
        choices: [],
      },
      {
        nodeId: 'risk-001-n4d',
        type: 'feedback',
        narrative: 'delegated',
        contextPanels: [],
        choices: [],
      },
    ],
  },
]

export const trackMeta: Record<
  string,
  { label: string; description: string; color: string; icon: string }
> = {
  operations: {
    label: 'Incident Response',
    description: 'Triage live system failures, prioritize under pressure, communicate with stakeholders.',
    color: '#1a6b3c',
    icon: '⚡',
  },
  business: {
    label: 'Business Case',
    description: 'Structure ambiguous problems, build analytical frameworks, present clear recommendations.',
    color: '#d4830a',
    icon: '📊',
  },
  risk: {
    label: 'Risk and Compliance',
    description: 'Identify control failures, calibrate severity, escalate through the correct channels.',
    color: '#7b3fa0',
    icon: '🔒',
  },
}
