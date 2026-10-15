/**
 * The system cohort "Interview Differently Standalone" under the institution "Interview Differently" (see
 * docs/product-boundaries.md, "Every attempt belongs to a cohort"): where standalone work is recorded for a person
 * with no program. A migration makes both rows in every environment (20261018110000_standalone_cohort); the
 * Simulator only points at them, it never creates or edits them.
 */
export const STANDALONE_INSTITUTION_ID = 'interview-differently'
export const STANDALONE_COHORT_ID = 'interview-differently-standalone'
