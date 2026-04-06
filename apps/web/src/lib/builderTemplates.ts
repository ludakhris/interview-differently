export const RUBRIC_TEMPLATES: Record<string, { name: string; description: string }[]> = {
  operations: [
    { name: 'Prioritization Logic', description: 'Does the candidate identify the highest-impact issue first?' },
    { name: 'Stakeholder Communication', description: 'Does the candidate communicate to the right people at the right time?' },
    { name: 'Root Cause Reasoning', description: 'Does the candidate think systematically about underlying causes?' },
    { name: 'Confidence Under Pressure', description: 'Does the candidate act decisively without overclaiming certainty?' },
  ],
  business: [
    { name: 'Quantitative Accuracy', description: 'Does the candidate use numbers correctly and identify missing data?' },
    { name: 'Structured Reasoning', description: 'Does the candidate frame the problem before jumping to conclusions?' },
    { name: 'Challenging Assumptions', description: 'Does the candidate identify and question baked-in assumptions?' },
    { name: 'Communication Clarity', description: 'Does the candidate communicate findings clearly to non-technical stakeholders?' },
  ],
  risk: [
    { name: 'Escalation Path', description: 'Does the candidate notify the right stakeholders in the right order?' },
    { name: 'Risk Calibration', description: 'Does the candidate accurately assess severity?' },
    { name: 'Regulatory Awareness', description: 'Does the candidate recognise regulatory implications?' },
    { name: 'Communication Clarity', description: 'Does the candidate communicate technical risk clearly?' },
  ],
  'customer-success': [
    { name: 'Empathy', description: 'Does the candidate demonstrate genuine understanding of customer concerns?' },
    { name: 'Problem Resolution', description: 'Does the candidate identify and address root causes effectively?' },
    { name: 'Escalation Judgment', description: 'Does the candidate know when and how to escalate?' },
    { name: 'Communication', description: 'Is communication clear, professional, and appropriately toned?' },
  ],
  general: [
    { name: 'Critical Thinking', description: 'Does the candidate analyse situations before acting?' },
    { name: 'Prioritization', description: 'Does the candidate focus on the highest-impact action first?' },
    { name: 'Communication', description: 'Does the candidate communicate effectively under pressure?' },
    { name: 'Composure', description: 'Does the candidate remain calm and structured in ambiguous situations?' },
  ],
  custom: [],
}

export const TRACK_LABELS: Record<string, string> = {
  operations: 'Operations / Incident Response',
  business: 'Business / Strategy',
  risk: 'Risk & Compliance',
  'customer-success': 'Customer Success',
  general: 'General Judgment',
  custom: 'Custom',
}
