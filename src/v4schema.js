// DomainIQ v4 — shared schema constants
// v3 storage keys in constants.js remain untouched

export const V4_STORAGE_KEYS = {
  SESSIONS:        'diq_v4_sessions',
  PATTERNS:        'diq_v4_patterns',
  POLICY:          'diq_v4_generation_policy',
  METHOD_LEARNING: 'diq_v4_method_learning', // reserved — not yet implemented
}

export const NODE_TYPES = {
  finding:     { label: 'Finding',     icon: 'ti-search',         cls: 'node-finding' },
  assumption:  { label: 'Assumption',  icon: 'ti-flask',          cls: 'node-assumption' },
  hypothesis:  { label: 'Hypothesis',  icon: 'ti-bulb',           cls: 'node-hypothesis' },
  risk:        { label: 'Risk',        icon: 'ti-alert-triangle', cls: 'node-risk' },
  opportunity: { label: 'Opportunity', icon: 'ti-sparkles',       cls: 'node-opportunity' },
  constraint:  { label: 'Constraint',  icon: 'ti-lock',           cls: 'node-constraint' },
}

export const NODE_STATUS_CONFIG = {
  pending:      { label: 'Pending',      cls: 'ns-pending',    icon: 'ti-circle' },
  accepted:     { label: 'Accepted',     cls: 'ns-accepted',   icon: 'ti-check' },
  challenged:   { label: 'Challenged',   cls: 'ns-challenged', icon: 'ti-alert-triangle' },
  rejected:     { label: 'Rejected',     cls: 'ns-rejected',   icon: 'ti-x' },
  needs_review: { label: 'Needs review', cls: 'ns-review',     icon: 'ti-eye' },
}

export const CHALLENGE_PRESETS = [
  'Too broad',
  'Unsupported',
  'Wrong segment',
  'Overstated',
  'Needs evidence',
]

export const ENTITY_TYPES = {
  company:  { label: 'Company',           icon: 'ti-building',   hint: 'e.g. Finlytica, Salesforce' },
  domain:   { label: 'Domain / Workflow', icon: 'ti-git-branch', hint: 'e.g. healthcare revenue cycle' },
  industry: { label: 'Industry',          icon: 'ti-world',      hint: 'e.g. community banking analytics' },
}

export const RESEARCH_OUTCOMES = [
  'Interview prep',
  'Product strategy',
  'Competitive intelligence',
  'Investment thesis',
  'Consulting engagement',
  'Workflow mastery',
  'Operational risk',
  'AI disruption analysis',
]

export const ROLE_LENSES = [
  'Product Manager',
  'Business Analyst',
  'Product Strategist',
  'Consultant / Advisor',
  'Operations Leader',
  'Investor / Due Diligence',
]

export const DEPTH_OPTIONS = [
  { value: 'orientation', label: 'Orientation', hint: 'Who/what/how, fast ramp' },
  { value: 'structural',  label: 'Structural',  hint: 'Incentives, constraints, processes' },
  { value: 'strategic',   label: 'Strategic',   hint: 'Positioning, opportunities, risks' },
  { value: 'frontier',    label: 'Frontier',    hint: 'Long-term direction, AI leverage' },
]

// Applied to every session at creation time and to every prompt call.
// Users may edit at session level; per-run overrides are layered on top at call time.
export const DEFAULT_GENERATION_POLICY = {
  tokenBudget:                 'low',
  verbosity:                   'standard',
  evidenceThreshold:           'medium',
  skepticismLevel:             'high',
  preserveAcceptedClaims:      true,
  avoidHypeLanguage:           true,
  avoidUnrequestedAbstraction: true,
  preferStructuredOutput:      true,
  requireAssumptions:          true,
  requireConfidence:           true,
  maxNewConceptsPerRun:        3,
  maxOutputWords:              900,
}
