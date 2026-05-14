export const STORAGE_KEYS = {
  PROJECTS: 'diq_v3_projects',
  PATTERNS: 'diq_v3_patterns',
}

export const TRUST_CONFIG = {
  verified_fact:     { cls: 'trust-verified',   icon: 'ti-check',    label: 'Verified fact' },
  user_provided:     { cls: 'trust-user',        icon: 'ti-upload',   label: 'User-provided' },
  inferred_strategy: { cls: 'trust-inferred',    icon: 'ti-sparkles', label: 'Inferred' },
  hypothesis:        { cls: 'trust-hypothesis',  icon: 'ti-flask',    label: 'Hypothesis' },
}

export function getTrust(type) {
  return TRUST_CONFIG[type] || TRUST_CONFIG['inferred_strategy']
}

export function confPct(conf) {
  if (conf === 'high')   return { pct: 85, color: 'var(--accent)' }
  if (conf === 'medium') return { pct: 55, color: 'var(--a3)' }
  if (conf === 'low')    return { pct: 25, color: 'var(--muted2)' }
  return { pct: 50, color: 'var(--a3)' }
}

export const TABS = [
  { id: 'setup',      icon: 'ti-settings',     label: 'Setup' },
  { id: 'model',      icon: 'ti-sitemap',       label: 'Operating model' },
  { id: 'personas',   icon: 'ti-users',         label: 'Personas' },
  { id: 'opps',       icon: 'ti-bulb',          label: 'Opportunities' },
  { id: 'delivery',   icon: 'ti-route',         label: 'Delivery model' },
  { id: 'governance', icon: 'ti-shield-check',  label: 'Governance' },
  { id: 'evidence',   icon: 'ti-list-check',    label: 'Evidence map' },
  { id: 'artifacts',  icon: 'ti-package',       label: 'Artifacts' },
  { id: 'narrative',  icon: 'ti-notes',         label: 'Narrative' },
]

export const FOCUS_OPTIONS = [
  { label: 'Operating model', icon: 'ti-chart-pie' },
  { label: 'Buyer personas',  icon: 'ti-users' },
  { label: 'Pain & triggers', icon: 'ti-alert-triangle' },
  { label: 'Growth levers',   icon: 'ti-trending-up' },
  { label: 'Delivery model',  icon: 'ti-route' },
  { label: 'Governance/risk', icon: 'ti-shield' },
  { label: 'Revenue model',   icon: 'ti-coins' },
  { label: 'Tech signals',    icon: 'ti-cpu' },
]

export const PERSONA_ICONS = [
  'ti-user', 'ti-user-check', 'ti-user-cog', 'ti-user-star', 'ti-user-shield',
]

export const ANALYSIS_STAGES = [
  { l: 'Parsing domain context & evidence basis',    p: 10 },
  { l: 'Mapping operating model (L1)',               p: 22 },
  { l: 'Profiling buyer personas (L1)',              p: 35 },
  { l: 'Identifying opportunities & triggers (L1)', p: 48 },
  { l: 'Modeling delivery phases (L1)',              p: 60 },
  { l: 'Assessing governance surface (L1)',          p: 72 },
  { l: 'Extracting evidence claims (L2)',            p: 82 },
  { l: 'Generating portfolio artifact plan (L4)',    p: 90 },
  { l: 'Extracting cross-domain patterns (L3)',      p: 96 },
  { l: 'Composing executive narrative',              p: 100 },
]
