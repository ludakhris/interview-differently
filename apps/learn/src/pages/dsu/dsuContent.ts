// Delaware State University Adult & Continuing Education demonstration site (#124).
// Links back to desu.edu and the office's contact details, as published on its page (October 2026).

export const DSU = {
  name: 'Delaware State University',
  office: 'Adult & Continuing Education',
  home: 'https://www.desu.edu/',
  ace: 'https://www.desu.edu/academics/adultcontinuing-education',
  priorLearning: 'https://www.desu.edu/academics/credit-prior-learning',
  courseGuide: 'https://www.desu.edu/sites/flagship/files/dsu_ace_course_guide-.pdf',
  logo: 'https://www.desu.edu/sites/all/themes/custom/dsu2016/images/dsu_logo.png',
  phone: '302-857-6820',
  email: 'aceworkforce@desu.edu',
  address: ['3931 Kirkwood Highway', 'Wilmington, DE 19808'],
  hours: '8:30 am – 4:30 pm',
}

/** The catalog's areas, in the course guide's order. Course.sector holds one of them. */
export const AREAS = ['Computer Technology', 'Healthcare', 'Professional and Business']

export const FUNDING_OPTIONS: { value: string; label: string }[] = [
  { value: 'wioa', label: 'Workforce Innovation and Opportunity Act (WIOA) funding' },
  { value: 'dvr', label: 'Division of Vocational Rehabilitation (DVR)' },
  { value: 'employer', label: 'My employer' },
  { value: 'self', label: 'I will pay myself' },
  { value: 'unsure', label: 'Not sure yet: help me find out' },
]

/** The education levels DSU's intake form asks about. */
export const EDUCATION_OPTIONS = [
  'High School/GED',
  'Associate Degree',
  "Bachelor's Degree",
  "Master's Degree",
  'Other',
]

export const usd = (dollars: number): string =>
  `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
