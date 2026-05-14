/**
 * DomainIQ v3 — API layer
 *
 * To enable live AI analysis:
 *   Set the environment variable: VITE_ANTHROPIC_API_KEY=sk-ant-...
 *   in a .env.local file at the project root (gitignored).
 *
 * Without a key, the app runs entirely on mock/seed data.
 */

export const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

export function hasApiKey() {
  return API_KEY.startsWith('sk-ant-')
}

export async function callClaude(prompt, maxTokens = 3500) {
  if (!hasApiKey()) {
    throw new Error('No API key configured. Set VITE_ANTHROPIC_API_KEY in .env.local')
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  const raw = data.content.map(c => c.text || '').join('')
  return raw.replace(/```json|```/g, '').trim()
}

export function buildPrompt({ domain, lens, stage, context, role, background, focuses, existingPatterns }) {
  return `You are a rigorous domain analyst. Conduct a deep, evidence-typed analysis of: "${domain}" (${stage}).
Analyst lens: ${lens}. Focus areas: ${focuses.join(', ')}.
${context ? 'User-provided context (higher-trust than inference):\n' + context : ''}
${role ? 'Kumar positioning overlay — role targeting: ' + role : ''}
${background ? 'Kumar positioning overlay — background: ' + background : ''}
${existingPatterns ? 'Existing cross-domain patterns (for extraction reference): ' + existingPatterns : ''}

CRITICAL: Every claim must carry an evidence_type:
  "verified_fact"     — publicly established, unambiguous
  "user_provided"     — came from user context above
  "inferred_strategy" — logical inference from domain knowledge
  "hypothesis"        — speculative, needs validation

Return ONLY valid JSON, no markdown, no backticks. Schema:
{
  "domain": "${domain}",
  "industry": "<inferred industry>",
  "stage": "${stage}",
  "lens": "${lens}",
  "operating_model": {
    "value_proposition":  { "text": "...", "evidence_type": "inferred_strategy", "confidence": "medium" },
    "customers":          { "text": "...", "evidence_type": "inferred_strategy", "confidence": "medium" },
    "revenue_model":      { "text": "...", "evidence_type": "hypothesis",         "confidence": "low" },
    "key_capabilities":   { "text": "...", "evidence_type": "inferred_strategy", "confidence": "medium" },
    "key_processes":      { "text": "...", "evidence_type": "inferred_strategy", "confidence": "medium" },
    "technology_signals": { "text": "...", "evidence_type": "hypothesis",         "confidence": "low" },
    "ecosystem":          { "text": "...", "evidence_type": "inferred_strategy", "confidence": "medium" },
    "success_metrics":    { "text": "...", "evidence_type": "inferred_strategy", "confidence": "medium" }
  },
  "personas": [
    { "title": "...", "role": "...", "first_use_case": "...", "proof_needed": "...", "objections": "...", "buying_trigger": "...", "evidence_type": "inferred_strategy", "confidence": "medium", "kumar_overlay": "..." }
  ],
  "opportunities": [
    { "title": "...", "impact": "high|medium|low", "effort": "high|medium|low", "horizon": "now|next|later", "category": "...", "trigger": "...", "description": "...", "evidence_type": "inferred_strategy", "confidence": "medium" }
  ],
  "delivery_model": {
    "archetype": "...",
    "evidence_type": "inferred_strategy",
    "phases": [
      { "name": "...", "timing": "...", "description": "...", "outputs": ["..."] }
    ],
    "pm_ba_leverage": "...",
    "common_failure_modes": "..."
  },
  "governance": [
    { "area": "...", "risk_level": "high|medium|low", "description": "...", "icon": "ti-shield", "evidence_type": "inferred_strategy", "confidence": "medium" }
  ],
  "evidence_map": [
    { "claim": "...", "evidence_type": "inferred_strategy", "source": "AI domain analysis", "confidence": "medium", "used_in": ["Operating model"] }
  ],
  "artifacts": [
    { "title": "...", "why_credible": "...", "claims_it_proves": ["..."], "data_needed": "...", "interview_signal": "...", "kumar_fit": "..." }
  ],
  "kumar_overlay": {
    "applied": ${role || background ? 'true' : 'false'},
    "role_target": "${role || 'not specified'}",
    "positioning_notes": "...",
    "safe_language": "...",
    "avoid_claiming": "..."
  },
  "patterns": [
    { "title": "...", "category": "persona|delivery|governance|opportunity|operating_model", "insight": "...", "evidence_type": "inferred_strategy", "confidence": "medium", "counterexamples": "...", "domain_applicability": "broad|sector-specific|niche" }
  ],
  "narrative": "250-300 word sharp executive narrative. No bullets. Tight paragraphs. Distinguish established from inferred."
}`
}
