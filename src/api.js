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
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  const raw = data.content.map(c => c.text || '').join('')
  return extractJsonObject(raw) || raw.replace(/```json|```/g, '').trim()
}

/**
 * callClaudeWithSearch — pressure-test API call.
 *
 * Adds Anthropic's built-in web_search tool (server-executed, no separate key).
 * max_uses: 3 is enforced at the API level — hard cap, not a prompt instruction.
 *
 * Returns { text: string, rawSearchBlocks: array }
 *   text           — the JSON PressureTestResult Claude produced
 *   rawSearchBlocks — tool_result content blocks from the API response,
 *                     used to cross-validate citations against real retrieved evidence.
 *
 * If the tool type string is unsupported by the model, the API returns an HTTP error
 * which surfaces as retrieval_failed — no fake evidence is ever produced.
 */
export async function callClaudeWithSearch(prompt, maxTokens = 3500, maxSearches = 3, isPressureTest = false) {
  if (!hasApiKey()) {
    throw new Error('No API key configured. Set VITE_ANTHROPIC_API_KEY in .env.local')
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: maxSearches,
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.status.toString())
    throw new Error(`API error ${res.status}: ${errText}`)
  }
  const data = await res.json()
  return parseSearchResponse(data, isPressureTest)
}

/**
 * extractJsonObject — strips markdown fences (```json … ``` or ``` … ```)
 * then scans the text for the first bracket-balanced JSON object that passes
 * JSON.parse.  Trying each candidate in order means prose containing
 * incidental {…} pairs before the real JSON does not produce a false match.
 * Returns the raw JSON string, or null if nothing parseable is found.
 *
 * Exported so chunk-generation callers can extract JSON from no-search responses.
 */
export function extractJsonObject(text) {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```/g, '')
  let searchFrom = 0
  while (searchFrom < cleaned.length) {
    const start = cleaned.indexOf('{', searchFrom)
    if (start === -1) return null
    // Bracket-match to the paired closing brace
    let depth = 0
    let end = -1
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) { end = i; break }
      }
    }
    if (end === -1) return null                    // unclosed object — give up
    const candidate = cleaned.slice(start, end + 1)
    try {
      JSON.parse(candidate)
      return candidate                             // valid JSON — use it
    } catch {
      searchFrom = start + 1                       // not JSON — try next '{'
    }
  }
  return null
}

/**
 * parseSearchResponse — extracts structured evidence and final JSON text
 * from an Anthropic response that may contain web_search tool content blocks.
 *
 * Content block types handled:
 *   "text"                   — Claude's prose preamble or final JSON output
 *   "tool_use"               — Claude's search query
 *   "tool_result"            — standard tool result wrapper
 *   "web_search_tool_result" — Anthropic's actual web_search block type (distinct from tool_result)
 *
 * JSON extraction: iterates text blocks in REVERSE (last block first — that is
 * where Claude always emits the final JSON).  For each block, markdown fences
 * (```json … ```) are stripped, then extractJsonObject scans for the first
 * bracket-balanced object that passes JSON.parse.  Fenced responses, responses
 * with trailing prose, and responses where prose precedes the JSON are all
 * handled correctly.  retrieval_failed is produced only when no text block
 * yields a parseable JSON object.
 *
 * If no JSON block is found at all, returns a synthetic retrieval_failed
 * PressureTestResult so the DiffView always renders and the user sees a clear
 * error state instead of a silent disappearance.
 *
 * Returns { text: string, rawSearchBlocks: RawSearchBlock[] }
 */
function parseSearchResponse(data, isPressureTest = false) {
  const blocks = data.content || []
  const rawSearchBlocks = []
  const textParts = []
  const pendingQueries = []

  for (const block of blocks) {
    if (block.type === 'tool_use' && block.name === 'web_search') {
      pendingQueries.push(block.input?.query || '')
    } else if (block.type === 'tool_result' || block.type === 'web_search_tool_result') {
      // Handle both standard tool_result and Anthropic's web_search_tool_result block type
      rawSearchBlocks.push({
        type: 'search_result',
        queries: [...pendingQueries],
        content: block.content || [],
      })
      pendingQueries.length = 0
    } else if (block.type === 'text') {
      textParts.push(block.text || '')
    }
  }

  // Find the last text block that contains a complete JSON object.
  // Uses bracket-matching so trailing prose after the closing '}' is stripped.
  // Earlier text blocks may be intro prose ("I'll search for…") and must not be included.
  let jsonText = ''
  for (let i = textParts.length - 1; i >= 0; i--) {
    const extracted = extractJsonObject(textParts[i])
    if (extracted) {
      jsonText = extracted
      break
    }
  }

  // If no JSON block was found, build a sentinel that distinguishes three cases:
  //
  //   assessment_truncated  — search ran (rawSearchBlocks exist) AND stop_reason=max_tokens
  //                           → SessionFlow will continue assessment in chunks automatically
  //   assessment_parse_failed — search ran but JSON was structurally invalid/absent
  //                           → SessionFlow will continue assessment in chunks automatically
  //   retrieval_failed      — no search evidence at all → real retrieval error, no chunks possible
  //
  // The truncated/parse-failed sentinels carry rawSearchBlocks so SessionFlow can
  // use the already-retrieved evidence without rerunning retrieval.
  if (!jsonText) {
    const hasEvidence = rawSearchBlocks.length > 0
    const preview = textParts.join(' ').trim().slice(0, 200) || '(empty response)'
    const emptyQD = {
      improvedPrecision: false, reducedOvergeneralization: false,
      improvedSegmentation: false, improvedOperationalPlausibility: false,
      reducedConfidenceAppropriately: false, preservedStrongOriginalReasoning: false,
      surfacedEvidenceGap: false, improvedDecisionUsefulness: false, notes: '',
    }
    const baseFields = {
      challengedNodeId: null,
      evidenceSummary: '', evidenceNeeded: '', confidenceChangeReason: '',
      qualityDelta: emptyQD,
      retrievedEvidence: [], inlineCitations: [], suggestedResearchQueries: [],
      revisedNode: null, updatedDownstream: [], preservedDownstreamIds: [],
    }

    // assessment_truncated / assessment_parse_failed sentinels are pressure-test-only.
    // Stage 2 and other callers fall through to the plain retrieval_failed sentinel
    // so classifyStage2Response never sees decision+challengedNodeId fields.
    if (isPressureTest && hasEvidence && data.stop_reason === 'max_tokens') {
      jsonText = JSON.stringify({
        ...baseFields,
        decision: 'assessment_truncated',
        rawSearchBlocks,
        stopReason: 'max_tokens',
        parseErrorReason: 'model_output_truncated',
        challengeAssessment: 'Assessment output was truncated before completing. Retrieval succeeded — continuing in chunks.',
      })
    } else if (isPressureTest && hasEvidence) {
      jsonText = JSON.stringify({
        ...baseFields,
        decision: 'assessment_parse_failed',
        rawSearchBlocks,
        stopReason: data.stop_reason || null,
        parseErrorReason: 'invalid_assessment_json',
        challengeAssessment: `Assessment response could not be parsed. Retrieval succeeded — continuing in chunks. Preview: "${preview}"`,
      })
    } else {
      jsonText = JSON.stringify({
        ...baseFields,
        decision: 'retrieval_failed',
        challengeAssessment: `The pressure test returned a response that could not be parsed as a valid assessment. Response preview: "${preview}"`,
      })
    }
  }

  return { text: jsonText, rawSearchBlocks, stopReason: data.stop_reason || null }
}

/**
 * callClaudeNoSearch — assessment chunk calls.
 *
 * Identical transport to callClaude but sends no tools array, so the model
 * cannot call web_search.  Used exclusively during chunked assessment generation
 * where the evidence bundle is passed inline in the prompt.
 *
 * Returns raw text (not JSON-extracted) so callers can use extractJsonObject
 * and handle chunk-specific parse failures individually.
 */
export async function callClaudeNoSearch(prompt, maxTokens = 2000) {
  if (!hasApiKey()) {
    throw new Error('No API key configured. Set VITE_ANTHROPIC_API_KEY in .env.local')
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.status.toString())
    throw new Error(`API error ${res.status}: ${errText}`)
  }
  const data = await res.json()
  return (data.content || []).map(c => c.text || '').join('')
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
