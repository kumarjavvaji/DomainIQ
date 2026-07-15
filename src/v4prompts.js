// DomainIQ v4 — prompt builders and demo mock data
// Each builder returns a plain string ready for callClaude().
// Context passed in is a PromptContextPacket — only the minimum necessary fields.

// ─── Stage 1 — Orientation ───────────────────────────────────────────────────
// Full entity + intent + policy injected. No prior stage context exists yet.

export function buildStage1Prompt({ entity, intent, policy }) {
  const policyBlock = renderPolicy(policy)
  const contextLine = entity.context
    ? `\nUSER CONTEXT (L2 — treat as higher trust than AI inference):\n${entity.context}`
    : ''

  return `You are a rigorous domain analyst conducting Stage 1 orientation analysis.

ENTITY: "${entity.name}" (type: ${entity.type})${contextLine}

RESEARCH INTENT:
- What: ${intent.what}
- Why: ${intent.why}
- Role: ${intent.role}
- Depth requested: ${intent.depth}
- Outcome goal: ${intent.outcome}

${policyBlock}

Stage 1 purpose: orientation only.
Cover: what this entity is, who the major players are, core terminology, key workflows, ecosystem, business model basics.
Do NOT produce Stage 2 structural analysis. Flag where deeper analysis would meaningfully improve confidence.

EVIDENCE TYPE RULES — apply to every node:
- "verified_fact"     — publicly established, unambiguous
- "user_provided"     — sourced from the USER CONTEXT above
- "inferred_strategy" — logical inference from domain knowledge
- "hypothesis"        — speculative, needs validation

NODE RULES:
- Each node is a single, independently addressable claim (≤60 words)
- type options: finding | assumption | hypothesis | risk | opportunity | constraint
- findings:     observable facts about current state
- assumptions:  things assumed to be true but unverified
- hypotheses:   predictions or speculations
- risks:        threats or concerns
- opportunities: potential upside
- constraints:  limiting factors
- Generate 8–12 nodes total
- Use dependsOn[] to list IDs of other nodes this node logically depends on
- Assign sequential IDs: n1, n2, n3, …

INFERRED PATTERNS — analytical strategy lens framing:
Each inferredPattern should be a reusable analytical heuristic this domain exemplifies — a transferable reasoning structure, not a company-specific observation. Ask: "what would an analyst carry into a similar investigation in a different sector?"
Examples: "Assistive-first entry in incumbent-heavy markets", "Compliance-constrained AI rollout", "Data moat asymmetry in platform transitions"

Return ONLY valid JSON with no markdown, no backticks, no commentary:
{
  "summary": "2-3 sentence orientation summary of what this entity is",
  "nodes": [
    {
      "id": "n1",
      "type": "finding",
      "statement": "single addressable claim under 60 words",
      "confidence": "high|medium|low",
      "evidence_type": "verified_fact|user_provided|inferred_strategy|hypothesis",
      "dependsOn": []
    }
  ],
  "openQuestions": [
    "specific question whose answer would meaningfully improve confidence"
  ],
  "inferredPatterns": [
    {
      "title": "pattern name — frame as reusable analytical lens, not company observation",
      "insight": "one-sentence transferable heuristic — write it for an analyst studying a DIFFERENT entity, not this one. Describe the pattern itself, not how this entity exemplifies it.",
      "transferability": "broad|sector-specific|niche",
      "confidence": "medium"
    }
  ]
}`
}

// ─── Pressure Test ───────────────────────────────────────────────────────────
// Replaces buildScopedRegenPrompt.
//
// KEY DIFFERENCE FROM OLD APPROACH:
//   Old: "You are revising a node based on a user challenge."
//   New: "Evaluate both the original claim AND the user challenge against retrieved evidence.
//         Decide: preserve_original | revise_claim | mark_unresolved | retrieval_failed."
//
// The user challenge is treated as a HYPOTHESIS to evaluate, not as an instruction to execute.
// Claude must use web_search (3 queries max) before deciding.
// The decision is evidence-driven, not challenge-driven.

export function buildPressureTestPrompt({
  challengedNode,
  directDeps,
  directDownstream,
  intent,
  policy,
  policyOverride,
  acceptedSummary,
  mode = 'user_challenge',
}) {
  const effectivePolicy = policyOverride ? { ...policy, ...policyOverride } : policy
  const policyBlock = renderPolicy(effectivePolicy)

  const depsBlock = directDeps.length > 0
    ? directDeps.map(n => `  [${n.id}] ${n.type}: ${n.statement}`).join('\n')
    : '  None'

  const downstreamBlock = directDownstream.length > 0
    ? directDownstream.map(n => `  [${n.id}] ${n.type}: ${n.statement}`).join('\n')
    : '  None'

  const nodeTypeGuidance = getNodeTypeGuidance(challengedNode.type)

  const isSystemReview = mode === 'system_review'

  const preamble = isSystemReview
    ? `You are an evidence-aware analytical precision tester. Your job is to identify what makes this claim imprecise, vague, underspecified, or weakly grounded. Retrieve evidence to sharpen, qualify, or narrow it — without collapsing investigative scope. Do not rewrite unless a more defensible version is achievable.`
    : `You are an evidence-aware analytical pressure tester. Your job is NOT to rewrite nodes based on user challenges. Your job is to evaluate both the original claim and the user challenge against retrieved evidence, then decide which deserves more confidence.`

  const nodeHeader = isSystemReview ? 'REVIEWED NODE:' : 'CHALLENGED NODE:'

  const challengeContext = isSystemReview
    ? `  System flag: claim requires precision hardening — sharpen, qualify, or narrow without collapsing investigative scope.`
    : `  User challenge preset: "${challengedNode.userPreset || 'none'}"
  User challenge note: "${challengedNode.userNote || 'none'}"`

  const step2 = isSystemReview
    ? `STEP 2 — EVALUATE:
After searching, evaluate:
a) What specific aspect of this claim is vague, overstated, underspecified, or weakly grounded?
b) Does retrieved evidence allow a more precise, narrower, or better-qualified version?
c) Is the claim already well-grounded and defensible as written?
d) Did retrieval fail or return irrelevant results?`
    : `STEP 2 — EVALUATE:
After searching, evaluate:
a) Does retrieved evidence support the original claim?
b) Does retrieved evidence support the user's challenge?
c) Is the evidence ambiguous or insufficient to decide?
d) Did retrieval fail or return irrelevant results?`

  const step3 = isSystemReview
    ? `STEP 3 — DECIDE:
Based on evaluation, choose exactly one decision:
- "preserve_original"  — claim is already precise and well-grounded; no sharpening achievable or needed
- "revise_claim"       — evidence supports a more defensible, narrower, or better-qualified version
- "mark_unresolved"   — claim cannot be sharpened without additional evidence
- "retrieval_failed"  — no useful evidence returned; cannot evaluate`
    : `STEP 3 — DECIDE:
Based on evaluation, choose exactly one decision:
- "preserve_original"  — original survives scrutiny; challenge does not materially weaken it
- "revise_claim"       — retrieved evidence supports a more precise, narrower, or better-segmented version
- "mark_unresolved"   — genuine ambiguity; evidence insufficient to decide either way
- "retrieval_failed"  — no useful evidence returned; cannot evaluate`

  const constraints = isSystemReview
    ? `CRITICAL CONSTRAINTS:
- Do NOT assume the original node is wrong — sharpening is the goal, not refutation
- Do NOT narrow the claim to the point of analytical uselessness
- Do NOT fabricate URLs, publisher names, or snippet text
- Do NOT cite anything not retrieved in this conversation
- Do NOT rewrite the node unless decision is revise_claim
- knowledgeBasis language: use "Model knowledge suggests..." or "Industry patterns commonly indicate..." NOT "Sources confirm..." or "Evidence proves..."
- If retrieval returned nothing useful, set decision to retrieval_failed`
    : `CRITICAL CONSTRAINTS:
- Do NOT assume the user challenge is correct
- Do NOT assume the original node is wrong
- Do NOT fabricate URLs, publisher names, or snippet text
- Do NOT cite anything not retrieved in this conversation
- Do NOT rewrite the node unless decision is revise_claim
- knowledgeBasis language: use "Model knowledge suggests..." or "Industry patterns commonly indicate..." NOT "Sources confirm..." or "Evidence proves..."
- If retrieval returned nothing useful, set decision to retrieval_failed`

  return `${preamble}

ENTITY CONTEXT: "${intent.what}" (${intent.why})
Analyst role: ${intent.role}

${nodeHeader}
  ID: ${challengedNode.id}
  Type: ${challengedNode.type}
  Original statement: "${challengedNode.statement}"
  Confidence: ${challengedNode.confidence}
  Evidence type: ${challengedNode.evidence_type}
${challengeContext}

DIRECT DEPENDENCIES (for context — do not revise):
${depsBlock}

DIRECT DOWNSTREAM NODES (may need updating if node is revised):
${downstreamBlock}

ACCEPTED CLAIMS (do not contradict):
  ${acceptedSummary}

NODE-TYPE EVALUATION GUIDANCE:
${nodeTypeGuidance}

${policyBlock}

STEP 1 — SEARCH (use web_search tool, max 3 queries):
Generate targeted search queries based on the node statement${isSystemReview ? '' : ", the user's challenge note,"} and the entity context. Prefer:
- Company/product pages
- Implementation documentation
- Customer stories or case studies
- Competitor or adjacent vendor behavior
- Reputable industry analysis
Avoid generic market reports. Retrieve maximum 5 relevant snippets total.

${step2}

${step3}

${constraints}

STEP 4 — RETURN JSON:
Return ONLY valid JSON, no markdown, no backticks:
{
  "challengedNodeId": "${challengedNode.id}",
  "decision": "preserve_original|revise_claim|mark_unresolved|retrieval_failed",
  "challengeAssessment": "2-4 sentences: ${isSystemReview ? 'what was imprecise or weakly grounded, what evidence found, what was sharpened or why original was preserved' : 'what the challenge claims, what evidence says about both sides, why you reached this decision'}",
  "evidenceSummary": "1-3 sentences: what was actually found, what supported original, what supported challenge, what was ambiguous",
  "evidenceNeeded": "what additional evidence would resolve remaining uncertainty",
  "confidenceChangeReason": "why confidence stayed the same or changed",
  "qualityDelta": {
    "improvedPrecision": true|false,
    "reducedOvergeneralization": true|false,
    "improvedSegmentation": true|false,
    "improvedOperationalPlausibility": true|false,
    "reducedConfidenceAppropriately": true|false,
    "preservedStrongOriginalReasoning": true|false,
    "surfacedEvidenceGap": true|false,
    "improvedDecisionUsefulness": true|false,
    "notes": "one sentence on the net quality change, or empty string"
  },
  "retrievedEvidence": [
    {
      "id": "e1",
      "type": "direct_evidence|contradictory_evidence|competitor_analogy|pattern_inference|unresolved_hypothesis",
      "title": "page or article title",
      "url": "exact URL from search result",
      "publisher": "domain or publisher name",
      "snippet": "verbatim or close-paraphrase excerpt — max 60 words",
      "supportsNodeIds": ["${challengedNode.id}"],
      "contradictsNodeIds": [],
      "confidence": "high|medium|low"
    }
  ],
  "inlineCitations": [
    {
      "marker": "[1]",
      "claimFragment": "exact fragment of challengeAssessment or revisedNode statement this cites",
      "evidenceId": "e1",
      "relationship": "supports|contradicts|qualifies|analogy"
    }
  ],
  "suggestedResearchQueries": ["query 1", "query 2"],
  "revisedNode": null,
  "updatedDownstream": [],
  "preservedDownstreamIds": []
}

If decision is revise_claim, set revisedNode to:
{
  "id": "${challengedNode.id}",
  "type": "...",
  "statement": "revised statement — must be narrower, more precise, or better segmented than original",
  "confidence": "high|medium|low",
  "evidence_type": "verified_fact|user_provided|inferred_strategy|hypothesis",
  "dependsOn": ${JSON.stringify(challengedNode.dependsOn || [])},
  "changeReason": "one sentence: what changed and why it is more defensible"
}
And for each downstream node: update only if revision makes it logically inconsistent; otherwise add its id to preservedDownstreamIds. Conservative default: preserve.
If decision is preserve_original or mark_unresolved: set revisedNode to null.
If decision is retrieval_failed: set revisedNode to null, retrievedEvidence to [], inlineCitations to [].`
}

function getNodeTypeGuidance(type) {
  switch (type) {
    case 'finding':
      return '- Is this finding overstated or too broad?\n- Is it missing important segmentation?\n- Does retrieved evidence directly contradict or qualify it?'
    case 'assumption':
      return '- Is this assumption actually necessary for the analysis?\n- Is it testable? Should it be reclassified as a hypothesis?\n- Does retrieved evidence confirm, refute, or make it more nuanced?'
    case 'hypothesis':
      return '- Does retrieved evidence increase or decrease plausibility?\n- Is there a competing hypothesis better supported by evidence?\n- Should this remain unresolved given retrieval ambiguity?'
    case 'risk':
      return '- Is this risk materially real in practice, or theoretical?\n- Is it mitigated operationally by common industry patterns?\n- Is the severity overstated or understated?'
    case 'opportunity':
      return '- Is this opportunity actionable or aspirational?\n- Is it already commoditized or present in competitors?\n- Does it require conditions that are unrealistic for this entity?'
    case 'constraint':
      return '- Is this constraint universal, segment-specific, or overstated?\n- Is it regulatory, operational, or both?\n- Does it apply in the way the original statement implies?'
    default:
      return '- Evaluate the claim against retrieved evidence on its own merits.'
  }
}

// ─── Chunked assessment prompt builder ───────────────────────────────────────
//
// Used when the full pressure-test response was truncated or unparseable.
// Each call generates exactly one JSON object covering one named chunk.
// No tools/search references — evidence is passed inline from rawSearchBlocks.

function formatRawSearchBlocks(rawSearchBlocks) {
  if (!rawSearchBlocks?.length) return '  (no search results available)'
  const lines = []
  rawSearchBlocks.forEach((block, bi) => {
    if (block.queries?.length) {
      lines.push(`Search queries: ${block.queries.join(', ')}`)
    }
    const items = Array.isArray(block.content) ? block.content : []
    items.forEach((item, ii) => {
      const url = item.url || ''
      const title = item.title || ''
      if (url || title) {
        lines.push(`[${bi + 1}.${ii + 1}] ${title}${url ? ` — ${url}` : ''}`)
      }
      const snippet = item.encrypted_content || item.content || item.text || ''
      if (snippet) lines.push(`  ${String(snippet).slice(0, 300)}`)
    })
  })
  return lines.join('\n') || '  (no structured results parsed)'
}

const CHUNK_INSTRUCTIONS = {
  decision_summary: `Return ONLY the top-level decision fields.
Schema:
{
  "decision": "preserve_original|revise_claim|mark_unresolved|retrieval_failed",
  "challengedNodeId": "<nodeId>",
  "evidenceNeeded": "<string — what additional evidence would resolve remaining uncertainty>",
  "suggestedResearchQueries": ["<query>"]
}`,

  challenge_assessment: `Return ONLY the challenge assessment and evidence summary text.
Schema:
{
  "challengeAssessment": "<2-4 sentences: what the challenge claims, what evidence says about both sides, why you reached your decision>",
  "evidenceSummary": "<1-3 sentences: what was actually found, what supported original, what supported challenge, what was ambiguous>"
}`,

  revised_node: `Return ONLY the revised node. Only generated when decision is revise_claim.
Schema:
{
  "id": "<challengedNodeId>",
  "type": "<same node type>",
  "statement": "<revised statement — narrower, more precise, or better segmented>",
  "confidence": "high|medium|low",
  "evidence_type": "verified_fact|user_provided|inferred_strategy|hypothesis",
  "dependsOn": [],
  "changeReason": "<one sentence: what changed and why it is more defensible>",
  "updatedDownstream": [],
  "preservedDownstreamIds": []
}`,

  evidence_summary: `Return ONLY the evidence summary and confidence change reason.
Schema:
{
  "text": "<1-3 sentence evidence summary>",
  "confidenceChangeReason": "<why confidence stayed the same or changed>"
}`,

  evidence_items: `Return ONLY the retrieved evidence items structured from the search results above.
Keep each snippet under 60 words. Assign sequential IDs starting at e1. Include at most 8 items.
If there are too many results to fit in one response, return:
{ "needsSubchunks": true, "subchunkPlan": ["evidence_items_001_005", "evidence_items_006_010"] }
Otherwise return:
{
  "items": [
    {
      "id": "e1",
      "type": "direct_evidence|contradictory_evidence|competitor_analogy|pattern_inference|unresolved_hypothesis",
      "title": "<page title>",
      "url": "<exact URL from search result>",
      "publisher": "<domain or publisher>",
      "snippet": "<verbatim or close-paraphrase, max 60 words>",
      "supportsNodeIds": [],
      "contradictsNodeIds": [],
      "confidence": "high|medium|low"
    }
  ]
}`,

  confidence_and_quality_delta: `Return ONLY the confidence change reason and quality delta.
Schema:
{
  "confidenceChangeReason": "<why confidence stayed the same or changed>",
  "qualityDelta": {
    "improvedPrecision": true|false,
    "reducedOvergeneralization": true|false,
    "improvedSegmentation": true|false,
    "improvedOperationalPlausibility": true|false,
    "reducedConfidenceAppropriately": true|false,
    "preservedStrongOriginalReasoning": true|false,
    "surfacedEvidenceGap": true|false,
    "improvedDecisionUsefulness": true|false,
    "notes": "<one sentence on net quality change, or empty string>"
  }
}`,
}

export function buildAssessmentChunkPrompt({
  challengedNode,
  rawSearchBlocks,
  directDeps,
  directDownstream,
  intent,
  mode,
  chunkName,
  sequence,
}) {
  const evidenceText = formatRawSearchBlocks(rawSearchBlocks)
  const depsText = (directDeps || []).map(n => `  [${n.id}] ${n.type}: ${n.statement}`).join('\n') || '  None'
  const downText = (directDownstream || []).map(n => `  [${n.id}] ${n.statement}`).join('\n') || '  None'
  const instructions = CHUNK_INSTRUCTIONS[chunkName] || `Return a JSON object for chunk: ${chunkName}`

  return `You are generating chunk ${sequence + 1} of a pressure-test assessment.

IMPORTANT CONSTRAINTS:
- Use ONLY the evidence listed below. Do not call search. Do not perform retrieval.
- Return exactly one valid JSON object. No markdown fences. No prose before or after.
- This chunk is: ${chunkName}

ENTITY: "${intent?.what || ''}" (${intent?.why || ''})
ANALYST ROLE: ${intent?.role || ''}
CHALLENGE MODE: ${mode}

CHALLENGED NODE:
  ID: ${challengedNode.id}
  Type: ${challengedNode.type}
  Statement: "${challengedNode.statement}"
  Confidence: ${challengedNode.confidence}
  Challenge preset: "${challengedNode.userPreset || 'none'}"
  Challenge note: "${challengedNode.userNote || 'none'}"

DIRECT DEPENDENCIES (context only):
${depsText}

DIRECT DOWNSTREAM (context only):
${downText}

RETRIEVED SEARCH EVIDENCE (use only this — do not add, fabricate, or search for more):
${evidenceText}

${instructions}

Return ONLY valid JSON. No markdown. No backticks. No prose.`
}

// ─── Policy block renderer ────────────────────────────────────────────────────

function renderPolicy(policy) {
  return `GENERATION POLICY (enforce strictly):
- Skepticism: ${policy.skepticismLevel === 'high' ? 'HIGH — challenge assumptions, do not overstate confidence' : 'NORMAL'}
- Avoid hype language: ${policy.avoidHypeLanguage ? 'yes' : 'no'}
- Avoid unrequested abstraction: ${policy.avoidUnrequestedAbstraction ? 'yes' : 'no'}
- Max new concepts this run: ${policy.maxNewConceptsPerRun}
- Target word budget: ~${policy.maxOutputWords} words total
- Require explicit assumptions: ${policy.requireAssumptions ? 'yes' : 'no'}
- Require confidence ratings: ${policy.requireConfidence ? 'yes' : 'no'}
- Preserve accepted claims: ${policy.preserveAcceptedClaims ? 'yes' : 'no'}`
}

// ─── Stage 1 Directional Refinement ─────────────────────────────────────────
// Applied after Stage 1 generation. Re-ranks, groups, and annotates existing
// nodes based on a user directional prompt. Never deletes nodes.

export function buildStage1RefinementPrompt({ nodes, entity, intent, directionalPrompt }) {
  const nodeBlock = nodes.map(n => {
    const citationStatus = resolveNodeCitationStatus(n)
    return `  ${n.id} [${n.type}] [${n.confidence}] [${citationStatus}]: ${n.statement}`
  }).join('\n')

  return `You are a domain analysis refinement engine. The user has already generated a Stage 1 orientation graph and now wants to steer it in a specific direction.

ENTITY: "${entity.name}" (${entity.type})
INTENT ROLE: ${intent.role}
INTENT OUTCOME: ${intent.outcome}

DIRECTIONAL PROMPT (user instruction):
"${directionalPrompt}"

CURRENT NODES (id [type] [confidence] [citationStatus]):
${nodeBlock}

Your job: re-rank, group, and annotate each node based on how relevant or useful it is given the directional prompt. Do NOT delete nodes. Do NOT rewrite node statements.

For each node, produce a nodeOverride entry:
- rank: integer (1 = highest priority under this direction). Assign unique ranks.
- emphasis: "primary" | "secondary" | "suppressed"
  - primary: directly serves the directional goal
  - secondary: peripherally relevant
  - suppressed: not relevant to this direction
- groupTag: short label grouping related nodes (e.g. "role-fit", "competitor gaps", "regulatory") — null if ungrouped
- rankReason: one sentence explaining why this node got this rank/emphasis under the directional prompt
- refinementNote: optional one sentence noting how the user could use or strengthen this node for the stated direction — null if not applicable
- emphasisIsCitationBacked: true if the node has citation support that backs the emphasis decision, false if emphasis is inferred

Return ONLY valid JSON with no markdown, no backticks, no commentary:
{
  "directionalPrompt": "${directionalPrompt.replace(/"/g, '\\"')}",
  "refinementSummary": "1-2 sentence summary of how the direction changed the view",
  "nodeOverrides": {
    "n1": {
      "rank": 1,
      "emphasis": "primary",
      "groupTag": "role-fit",
      "rankReason": "...",
      "refinementNote": "...",
      "emphasisIsCitationBacked": false
    }
  }
}`
}

function resolveNodeCitationStatus(node) {
  if (node.citationStatus) return node.citationStatus
  const citations = node.latestReview?.citations
    || (node.reviewHistory || []).slice().reverse().find(e => e.citations?.length > 0)?.citations
    || []
  if (citations.length === 0) return 'uncited'
  const levels = citations.map(c => c.supportsClaim)
  if (levels.some(l => l === 'direct'))  return 'cited'
  if (levels.some(l => l === 'partial')) return 'weak'
  return 'inferred'
}

export const MOCK_STAGE1_REFINEMENT = {
  directionalPrompt: 'Lean this toward CIAM relevance.',
  refinementSummary: 'Filtered and re-ranked the orientation graph to surface nodes most relevant to customer identity and access management context. Regulatory, persona, and ecosystem nodes moved to primary; revenue model and growth hypothesis suppressed.',
  nodeOverrides: {
    n1: { rank: 3, emphasis: 'secondary', groupTag: 'market-context', rankReason: 'Market fragmentation context is useful background but not directly CIAM-relevant.', refinementNote: 'Could be strengthened by noting how identity data is siloed across community bank systems.', emphasisIsCitationBacked: false },
    n2: { rank: 4, emphasis: 'secondary', groupTag: 'market-context', rankReason: 'Broad platform description; useful orientation but not CIAM-specific.', refinementNote: null, emphasisIsCitationBacked: false },
    n3: { rank: 7, emphasis: 'suppressed', groupTag: null, rankReason: 'Revenue model mechanics are not relevant to a CIAM-focused investigation.', refinementNote: null, emphasisIsCitationBacked: false },
    n4: { rank: 1, emphasis: 'primary', groupTag: 'persona', rankReason: 'CFO/COO persona maps directly to CIAM buyer profiles who own identity governance decisions.', refinementNote: 'Consider how this persona overlaps with the CISO/CTO in identity-adjacent decisions.', emphasisIsCitationBacked: false },
    n5: { rank: 5, emphasis: 'secondary', groupTag: 'go-to-market', rankReason: 'Sales motion is relevant context but secondary to CIAM capability gaps.', refinementNote: null, emphasisIsCitationBacked: false },
    n6: { rank: 2, emphasis: 'primary', groupTag: 'capability-gap', rankReason: 'Explainability gap directly parallels CIAM audit trail and transparency requirements.', refinementNote: 'Frame as identity audit readiness gap — strong CIAM positioning angle.', emphasisIsCitationBacked: false },
    n7: { rank: 6, emphasis: 'secondary', groupTag: 'adoption-risk', rankReason: 'Change management risk is relevant but generic; lower CIAM specificity.', refinementNote: null, emphasisIsCitationBacked: false },
    n8: { rank: 1, emphasis: 'primary', groupTag: 'regulatory', rankReason: 'FDIC/OCC regulatory constraints are the core driver of CIAM requirements in banking.', refinementNote: 'Emphasize identity verification and access audit requirements under these frameworks.', emphasisIsCitationBacked: false },
    n9: { rank: 8, emphasis: 'suppressed', groupTag: null, rankReason: 'Upmarket expansion hypothesis is speculative and not CIAM-relevant at orientation stage.', refinementNote: null, emphasisIsCitationBacked: false },
  },
}

// ─── Demo mock data ───────────────────────────────────────────────────────────
// Used when no API key is present. Represents a Stage 1 analysis of Finlytica (company).
// n3 is the intentionally weak assumption — the demo challenge targets it.
// n9 depends on n3, so it will appear in the downstream diff.

export const MOCK_V4_STAGE1 = {
  summary: 'Finlytica is a specialized analytics platform targeting community banks — institutions that are typically analytics-light and decision-making by relationship and intuition. It likely positions itself as a hybrid of consulting trust and SaaS convenience, competing less on feature depth than on operational fit.',
  nodes: [
    {
      id: 'n1',
      type: 'finding',
      statement: 'Community banks represent a highly fragmented, analytics-light segment where most institutions make lending and operational decisions based on relationship knowledge and intuition rather than structured data analysis.',
      confidence: 'high',
      evidence_type: 'inferred_strategy',
      dependsOn: [],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
    {
      id: 'n2',
      type: 'finding',
      statement: 'Finlytica operates in the community banking analytics market, offering a combination of analytics tooling and advisory services to help banks interpret operational data and surface actionable insights.',
      confidence: 'medium',
      evidence_type: 'inferred_strategy',
      dependsOn: [],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
    {
      id: 'n3',
      type: 'assumption',
      statement: 'Finlytica\'s revenue model is a recurring SaaS subscription augmented by professional services fees, with the services engagement serving as the trust-building entry motion before platform adoption.',
      confidence: 'low',
      evidence_type: 'hypothesis',
      dependsOn: ['n2'],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
    {
      id: 'n4',
      type: 'finding',
      statement: 'The primary buyer persona is likely a community bank CFO or COO who needs board-ready analytics reporting but lacks internal data science capability to produce it independently.',
      confidence: 'medium',
      evidence_type: 'inferred_strategy',
      dependsOn: ['n1'],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
    {
      id: 'n5',
      type: 'assumption',
      statement: 'Sales cycles are relationship-driven and referral-heavy, with trust established through a consultative pilot before full platform adoption — consistent with how community banking vendors typically expand.',
      confidence: 'medium',
      evidence_type: 'inferred_strategy',
      dependsOn: ['n1', 'n4'],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
    {
      id: 'n6',
      type: 'opportunity',
      statement: 'A high-leverage opportunity exists to build explainability features that translate analytics outputs into plain-language board narrative, reducing the interpretation burden on non-technical bank executives.',
      confidence: 'medium',
      evidence_type: 'inferred_strategy',
      dependsOn: ['n1', 'n4'],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
    {
      id: 'n7',
      type: 'risk',
      statement: 'Finlytica faces adoption risk if it underinvests in change management and onboarding — community bank staff frequently resist new workflows when ROI is not immediately visible or explainable.',
      confidence: 'medium',
      evidence_type: 'inferred_strategy',
      dependsOn: ['n5'],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
    {
      id: 'n8',
      type: 'constraint',
      statement: 'Community banks operate under strict federal and state regulatory oversight (FDIC, OCC, state regulators), constraining data-sharing arrangements, third-party integrations, and how analytics findings can be operationalized.',
      confidence: 'high',
      evidence_type: 'verified_fact',
      dependsOn: [],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
    {
      id: 'n9',
      type: 'hypothesis',
      statement: 'If Finlytica succeeds in community banking, it may expand upmarket to regional banks using its analytics playbooks as a proven, repeatable land-and-expand lever — following the SaaS growth pattern of adjacent fintech incumbents.',
      confidence: 'low',
      evidence_type: 'hypothesis',
      dependsOn: ['n2', 'n3'],
      userStatus: 'pending', userNote: null, userPreset: null,
      previousStatement: null, changeReason: null, lastUpdated: null,
    },
  ],
  openQuestions: [
    'What is Finlytica\'s actual pricing model — pure SaaS, usage-based, or services-led with a software component?',
    'Does Finlytica integrate with core banking platforms (Fiserv, Jack Henry, FIS) or operate as a standalone analytics layer?',
    'What is the typical asset size of Finlytica\'s current bank customers — sub-$1B, $1–10B, or larger?',
  ],
  inferredPatterns: [
    {
      title: 'Consulting-first entry as trust arbitrage',
      insight: 'In analytics-light markets, leading with consulting before platform adoption exploits a trust gap rather than a product gap — a pattern that recurs across fintech, govtech, and regulated healthcare where incumbents lack data maturity.',
      transferability: 'sector-specific',
      confidence: 'medium',
    },
  ],
}

// ─── Mock pressure test results ──────────────────────────────────────────────
// Two variants for demo mode (no API key):
//   MOCK_PRESSURE_TEST_RESULT_REVISE  — simulates challenging n3 (revenue model assumption) → revise_claim
//   MOCK_PRESSURE_TEST_RESULT_PRESERVE — simulates challenging any other node → preserve_original
//
// These replace MOCK_SCOPED_REGEN_RESULT. The rawSearchBlocks simulate what Anthropic's
// web_search tool would have returned.

export const MOCK_PRESSURE_TEST_RESULT_REVISE = {
  ptResult: {
    challengedNodeId: 'n3',
    decision: 'revise_claim',
    challengeAssessment: 'The user challenges the assumption that Finlytica uses a SaaS + professional services hybrid. Retrieved evidence from community banking analytics vendors (including Finlytica\'s own site and a competitor, Nymbus) suggests that services-led entry is common, but the SaaS subscription component is not always the primary revenue driver — some vendors operate on a pure managed-analytics retainer [1]. The original claim overstated the SaaS specificity. A narrower version better reflects the evidence [2].',
    evidenceSummary: 'Two relevant results retrieved. Finlytica\'s site describes an "analytics partnership" model without confirming per-seat SaaS pricing. A competitor comparison piece notes that community banking analytics vendors frequently use retainer or outcome-based pricing rather than traditional SaaS subscriptions.',
    evidenceNeeded: 'Finlytica pricing page or customer contract terms; reference to a published case study mentioning commercial model.',
    confidenceChangeReason: 'Confidence remains low — evidence narrows the claim but does not confirm the correct model.',
    qualityDelta: {
      improvedPrecision: true,
      reducedOvergeneralization: true,
      improvedSegmentation: false,
      improvedOperationalPlausibility: true,
      reducedConfidenceAppropriately: false,
      preservedStrongOriginalReasoning: false,
      surfacedEvidenceGap: true,
      improvedDecisionUsefulness: true,
      notes: 'Node is now more defensible — removes specific claim not supported by available evidence.',
    },
    retrievedEvidence: [
      {
        id: 'e1',
        type: 'direct_evidence',
        title: 'Finlytica — Analytics Partnerships for Community Banks',
        url: 'https://finlytica.com/solutions',
        publisher: 'finlytica.com',
        snippet: 'We deliver analytics as a partnership — your team, our platform, ongoing advisory. Built for community banks that need insights without building a data team.',
        supportsNodeIds: [],
        contradictsNodeIds: ['n3'],
        confidence: 'medium',
      },
      {
        id: 'e2',
        type: 'competitor_analogy',
        title: 'How community banking analytics vendors price their services — Fintech Futures',
        url: 'https://www.fintechfutures.com/2024/03/community-bank-analytics-pricing',
        publisher: 'fintechfutures.com',
        snippet: 'Unlike enterprise SaaS, many community banking analytics vendors operate on retainer or managed-service pricing, where the analytics delivery and advisory are bundled rather than separated.',
        supportsNodeIds: [],
        contradictsNodeIds: ['n3'],
        confidence: 'medium',
      },
    ],
    inlineCitations: [
      {
        marker: '[1]',
        claimFragment: 'some vendors operate on a pure managed-analytics retainer',
        evidenceId: 'e2',
        relationship: 'supports',
      },
      {
        marker: '[2]',
        claimFragment: 'A narrower version better reflects the evidence',
        evidenceId: 'e1',
        relationship: 'qualifies',
      },
    ],
    suggestedResearchQueries: [
      'Finlytica pricing model community banking subscription',
      'community bank analytics vendor contract structure retainer SaaS',
    ],
    revisedNode: {
      id: 'n3',
      type: 'assumption',
      statement: 'Finlytica\'s commercial model appears to be services-led — an analytics partnership or managed-service retainer rather than a traditional per-seat SaaS subscription. The exact pricing structure is unconfirmed from public sources.',
      confidence: 'low',
      evidence_type: 'hypothesis',
      dependsOn: ['n2'],
      changeReason: 'Removed the SaaS subscription claim. Retrieved evidence suggests a partnership/retainer model is more consistent with how Finlytica describes itself and how competitors in this segment price.',
    },
    updatedDownstream: [
      {
        id: 'n9',
        type: 'hypothesis',
        statement: 'If Finlytica demonstrates consistent value in community banking, it may expand upmarket to regional banks — but the expansion mechanism depends on the actual commercial model, which remains unconfirmed from public sources.',
        confidence: 'low',
        evidence_type: 'hypothesis',
        dependsOn: ['n2', 'n3'],
        changeReason: 'Removed reference to a SaaS playbook, which depended on the now-revised revenue model assumption in n3.',
      },
    ],
    preservedDownstreamIds: [],
  },
  rawSearchBlocks: [
    {
      type: 'search_result',
      queries: ['Finlytica revenue model pricing community banking analytics'],
      content: [{ type: 'text', text: 'Demo mode — simulated search result block.' }],
    },
  ],
}

export const MOCK_PRESSURE_TEST_RESULT_PRESERVE = {
  ptResult: {
    challengedNodeId: null, // filled in at call time
    decision: 'preserve_original',
    challengeAssessment: 'The user challenge raises a valid question, but retrieved evidence does not materially weaken the original claim. Industry patterns and available public information support the original statement as stated. The challenge identifies a nuance worth monitoring, but does not constitute sufficient grounds to revise the node.',
    evidenceSummary: 'Retrieved evidence was broadly consistent with the original claim. No direct contradictions found. One result added nuance but not contradiction.',
    evidenceNeeded: 'Primary sources — customer interviews, published case studies, or direct company disclosures — would sharpen confidence further.',
    confidenceChangeReason: 'Confidence unchanged — retrieved evidence neither strengthened nor weakened the original claim materially.',
    qualityDelta: {
      improvedPrecision: false,
      reducedOvergeneralization: false,
      improvedSegmentation: false,
      improvedOperationalPlausibility: false,
      reducedConfidenceAppropriately: false,
      preservedStrongOriginalReasoning: true,
      surfacedEvidenceGap: true,
      improvedDecisionUsefulness: false,
      notes: 'Original reasoning survives scrutiny. Evidence gap noted for follow-up.',
    },
    retrievedEvidence: [],
    inlineCitations: [],
    suggestedResearchQueries: [
      'community banking analytics adoption patterns 2024',
      'fintech vendor onboarding resistance community bank',
    ],
    revisedNode: null,
    updatedDownstream: [],
    preservedDownstreamIds: [],
  },
  rawSearchBlocks: [],
}

// ─── Stage 2 — Synthesis & Reasoning Artifact Generation ─────────────────────
//
// Stage 2 transforms validated Stage 1 knowledge into higher-value reasoning artifacts.
// It is NOT a summarization or evidence-consolidation stage.
// Every artifact must synthesize multiple Stage 1 nodes into something new.

export function buildStage2Prompt({
  entity, intent, policy,
  stage1Summary, acceptedNodes, refinedNodes, unresolvedNodes,
  openQuestions, inferredPatterns,
}) {
  const policyBlock = renderPolicy(policy)

  const acceptedBlock = acceptedNodes.length > 0
    ? acceptedNodes.map(n => `  [${n.id}] (${n.type}, ${n.confidence}) "${n.statement}"`).join('\n')
    : '  None yet.'

  const refinedBlock = refinedNodes.length > 0
    ? refinedNodes.map(n =>
        `  [${n.id}] Original: "${n.previousStatement}"\n          Revised:  "${n.statement}"`
      ).join('\n')
    : '  None.'

  const unresolvedBlock = unresolvedNodes.length > 0
    ? unresolvedNodes.map(n => `  [${n.id}] "${n.statement}" — ${n.userNote || 'flagged for review'}`).join('\n')
    : '  None.'

  const questionsBlock = openQuestions.length > 0
    ? openQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  None recorded.'

  const patternsBlock = inferredPatterns.length > 0
    ? inferredPatterns.map(p => `  - ${p.title}: ${p.insight}`).join('\n')
    : '  None.'

  return `You are a rigorous strategic analyst conducting Stage 2 synthesis for "${entity.name}".

PURPOSE:
Stage 2 transforms validated Stage 1 knowledge into higher-value reasoning artifacts. It is NOT summarization or evidence consolidation. Stage 1 already performed evidence gathering. Do not repeat it.

ENTITY: "${entity.name}" (${entity.type})
ANALYST ROLE: ${intent.role}
RESEARCH INTENT: ${intent.what}${intent.why ? ' — ' + intent.why : ''}

STAGE 1 SUMMARY:
${stage1Summary}

ACCEPTED ASSERTIONS:
${acceptedBlock}

REVISED ASSERTIONS (pressure-tested):
${refinedBlock}

UNRESOLVED ASSERTIONS:
${unresolvedBlock}

OPEN QUESTIONS:
${questionsBlock}

INFERRED PATTERNS:
${patternsBlock}

${policyBlock}

TRANSFORMATION RULE — every artifact must satisfy at least one of:
- Combines multiple findings into a new claim
- Derives an implication not stated in Stage 1
- Predicts downstream consequences
- Proposes a strategy or path
- Identifies a decision that must be made
- Exposes tradeoffs between competing goals
- Identifies execution or organizational risk
- Generates a testable scenario
- Generates a ranked recommendation

SUPPRESSION RULE — suppress an artifact entirely if:
- Fewer than two Stage 1 findings contribute to it
- It merely restates, paraphrases, or renames a Stage 1 assertion
- It changes wording only without adding synthesis

CROSS-LINKING — every artifact must list supportingNodeIds referencing the Stage 1 node IDs it synthesizes.

RETRIEVAL STRATEGY (use web_search, max 5 queries — target 3):
Search only to fill gaps that block synthesis — low-confidence nodes, open questions, decision points that need grounding. Stop searching once synthesis is unblocked. Do NOT search for generic market trends or re-gather evidence already implicit in Stage 1.

QUALITY GATES — reject output if:
- More than 30% of artifacts simply restate Stage 1
- Multiple artifacts make the same point
- Artifacts are isolated instead of cross-referenced
- Recommendations lack supportingNodeIds
- Confidence is omitted
- Tradeoffs are absent where applicable

OUTPUT SIZE LIMITS:
- strategicThemes: 3–5 items
- decisionFrameworks: 2–4 items
- scenarioModels: 2–3 items
- organizationalImplications: 4–8 items
- capabilityGaps: 2–4 items
- contradictionAnalysis: 2–4 items
- riskModels: 2–4 items
- opportunityModels: 3–5 items
- nextActions: 3–5 items
- All label/title fields: ≤10 words
- All narrative fields: ≤60 words
- All "why it matters" / "rationale" fields: ≤40 words
- All list item fields (drivers, risks, indicators, options): ≤15 words each, max 3 per list
- Omit a section entirely (empty array) rather than padding with weak artifacts

Return ONLY valid JSON. Output MUST begin with { and end with }. No preamble, no narration, no markdown, no backticks:
{
  "strategicThemes": [
    {
      "title": "≤10 words",
      "supportingNodeIds": ["<n1>", "<n2>"],
      "whyItMatters": "≤40 words: synthesis of why this cluster matters beyond individual nodes",
      "confidence": "high|medium|low",
      "downstreamImplications": "≤40 words: what decisions or risks this theme creates downstream"
    }
  ],
  "decisionFrameworks": [
    {
      "title": "≤10 words — the decision to be made",
      "question": "≤20 words — the specific decision question",
      "options": ["≤15 words each — 2 to 3 options"],
      "tradeoffs": "≤60 words: the core tradeoff between options",
      "recommendedPath": "≤20 words: most defensible path given current evidence",
      "supportingNodeIds": ["<node ids>"],
      "confidence": "high|medium|low"
    }
  ],
  "scenarioModels": [
    {
      "title": "≤10 words",
      "drivers": ["≤15 words each — what makes this scenario plausible"],
      "risks": ["≤15 words each — what could prevent or worsen it"],
      "leadingIndicators": ["≤15 words each — signals this is unfolding"],
      "recommendedResponse": "≤40 words: what to do now to prepare or exploit",
      "confidence": "high|medium|low",
      "supportingNodeIds": ["<node ids>"]
    }
  ],
  "organizationalImplications": [
    {
      "function": "product|engineering|security|operations|legal|support|customer_success|executive",
      "implication": "≤40 words: specific consequence for this function",
      "severity": "high|medium|low",
      "supportingNodeIds": ["<node ids>"]
    }
  ],
  "capabilityGaps": [
    {
      "gap": "≤10 words: name of the missing information or capability",
      "whyItMatters": "≤40 words: not just what is missing — why it blocks something specific",
      "blockedDecisions": ["≤15 words each — decisions that cannot be made without this"],
      "valueOfResolving": "high|medium|low"
    }
  ],
  "contradictionAnalysis": [
    {
      "description": "≤20 words: what the tension is between",
      "explanations": ["≤20 words each — 2 to 3 possible explanations for why this contradiction exists"],
      "likelihood": "high|medium|low",
      "businessImpact": "≤30 words: strategic consequence if unresolved",
      "followUp": "≤30 words: specific action to resolve or clarify",
      "supportingNodeIds": ["<node ids>"]
    }
  ],
  "riskModels": [
    {
      "name": "≤10 words",
      "trigger": "≤20 words: what event or condition starts the chain",
      "propagation": "≤40 words: how the risk spreads or escalates",
      "affectedSystems": ["≤10 words each"],
      "customerImpact": "≤20 words",
      "businessImpact": "≤20 words",
      "mitigation": "≤30 words: most effective intervention point",
      "owner": "≤10 words: who is accountable",
      "supportingNodeIds": ["<node ids>"]
    }
  ],
  "opportunityModels": [
    {
      "title": "≤10 words",
      "businessValue": "high|medium|low",
      "complexity": "high|medium|low",
      "dependencies": ["≤10 words each — what must be true for this to work"],
      "timeHorizon": "now|next|later",
      "confidence": "high|medium|low",
      "supportingNodeIds": ["<node ids>"],
      "rationale": "≤50 words: why this is worth pursuing and what would unlock it"
    }
  ],
  "nextActions": [
    {
      "action": "≤20 words: specific actionable investigation or decision",
      "expectedInfoGain": "high|medium|low",
      "cost": "high|medium|low",
      "confidenceImprovement": "≤20 words: which gap or uncertainty this resolves",
      "decisionImpact": "≤20 words: which blocked decision this unblocks"
    }
  ],
  "readinessAssessment": {
    "knowledgeMaturity": "high|medium|low",
    "remainingUncertainty": "≤30 words: the single most important unresolved uncertainty",
    "majorBlockers": ["≤15 words each — max 3: what prevents confident forward motion"],
    "confidence": "high|medium|low",
    "recommendation": "≤30 words: whether to proceed to Stage 3 and what to resolve first"
  }
}`
}

// ─── Investigative Pivot ─────────────────────────────────────────────────────
// Inline Stage 2 refinement layer — no new step.
// Output: two-layer model — displaySummary (concise) + analysisFoundation (deep).
// proposedUpdates target existing Stage 2 sections or 'general'.

const PIVOT_FOCUS_DESCRIPTIONS = {
  contextual_competition:    'Examine how competitor positioning and competitive dynamics reshape or challenge the key assertions in Stage 1.',
  operational_constraints:   'Surface the practical constraints, implementation barriers, and operational realities that limit or qualify the strategic picture.',
  adoption_dynamics:         'Analyze user behavior, change management requirements, and demand-side friction that affect whether opportunities or strategies are achievable.',
  business_model_pressures:  'Interrogate pricing logic, revenue structure, unit economics assumptions, and business model tensions embedded in the current analysis.',
  emerging_disruption:       'Identify emerging entrants, technology shifts, or market movements that could materially disrupt or accelerate the current strategic direction.',
  adjacent_capabilities:     'Explore adjacencies — build/buy/partner opportunities, workflow extensions, or capability expansions — that are implied but not yet developed in the Stage 2 analysis.',
}

export function buildPivotPrompt({
  entity, intent, policy,
  stage1Summary, acceptedNodes,
  stage2,
  pivotType, pivotTitle,
  targetNodes,
  userDirection,
}) {
  const policyBlock = renderPolicy(policy)
  const focusDescription = PIVOT_FOCUS_DESCRIPTIONS[pivotType] || pivotTitle

  const acceptedBlock = (acceptedNodes || []).length > 0
    ? acceptedNodes.map(n => `  [${n.id}] (${n.type}, ${n.confidence}) "${n.statement}"`).join('\n')
    : '  None.'

  const targetBlock = (targetNodes || []).length > 0
    ? targetNodes.map(n => `  [${n.id}] (${n.type}, ${n.confidence}) "${n.statement}"`).join('\n')
    : '  None specified — apply pivot to the full analytical picture.'

  const competitorBlock = (stage2?.competitorMap || []).length > 0
    ? (stage2.competitorMap).map(c => `  ${c.name}: ${c.strategicDivergence || c.segmentFit || ''}`).join('\n')
    : '  None mapped yet.'

  const tensionBlock = (stage2?.contradictionMap || []).length > 0
    ? (stage2.contradictionMap).map(c => `  ${c.tensionType}: ${c.description}`).join('\n')
    : '  None mapped yet.'

  const openBlock = (stage2?.unresolvedQuestions || []).length > 0
    ? (stage2.unresolvedQuestions).map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  None.'

  const directionBlock = userDirection?.trim()
    ? `USER DIRECTION:\n"${userDirection.trim()}"\nInterpret this as a research focus, not an instruction to confirm a conclusion.`
    : 'USER DIRECTION: None specified — apply analytical judgment to the pivot focus.'

  return `You are a rigorous strategic analyst executing an investigative pivot on an existing domain analysis.

ENTITY: "${entity.name}" (${entity.type})
ANALYST ROLE: ${intent.role}
RESEARCH INTENT: ${intent.what}${intent.why ? ' — ' + intent.why : ''}

PIVOT TYPE: ${pivotTitle}
PIVOT FOCUS: ${focusDescription}

${directionBlock}

STAGE 1 SUMMARY:
${stage1Summary}

ACCEPTED ASSERTIONS (treat as established basis — do not contradict without strong evidence):
${acceptedBlock}

TARGET NODES (assertions most relevant to this pivot — examine these specifically):
${targetBlock}

EXISTING COMPETITOR MAP:
${competitorBlock}

EXISTING CONTRADICTIONS / TENSIONS:
${tensionBlock}

OPEN QUESTIONS FROM STAGE 2:
${openBlock}

${policyBlock}

PIVOT MISSION:
This is a focused research expansion — not a restart. Apply the pivot lens to deepen, challenge, qualify, or extend the existing analysis. Answer: "What does this pivot angle reveal that Stage 2 missed, understated, or left unresolved?"

RETRIEVAL STRATEGY (use web_search, max 6 queries — target 4):
Execute 4 targeted searches aligned to the pivot focus. Stop early once 4+ useful evidence items are retrieved. Prioritize:
1. Direct evidence that challenges or qualifies target node assertions
2. Competitor behavior or case studies relevant to the pivot angle
3. Market data, adoption evidence, or operational patterns the existing analysis lacks
4. Adjacent signals — regulatory changes, technology shifts, new entrant moves — that alter the strategic picture

Do NOT:
- Search for general background on the entity
- Fabricate sources, URLs, or data points
- Cite sources not retrieved in this session
- Produce narrative prose before or after the JSON
- Pad with low-confidence findings — omit if weak

CONSTRAINTS:
- proposedUpdates: max 4; each proposedText ≤30 words; rationale ≤20 words
- unresolvedQuestions: max 3, ≤20 words each
- stage3Implications: max 3, ≤20 words each
- additionalSearchSuggestions: max 2, ≤15 words each
- displaySummary: 2–3 sentences, ≤60 words total — the most important finding, grounded in retrieved evidence
- analysisFoundation all text fields: ≤30 words each
- assumptionsToTest: max 3 items, ≤15 words each

Return ONLY valid JSON. Output MUST begin with { and end with }. No preamble, no markdown, no backticks:
{
  "displaySummary": "2–3 sentences of the most important finding from this pivot. Grounded in retrieved evidence. ≤60 words.",
  "analysisFoundation": {
    "userDirectionInterpretation": "≤30 words: how the user direction was interpreted and applied",
    "deeperFinding": "≤30 words: the most analytically significant finding beyond the display summary",
    "evidenceSynthesis": "≤30 words: what the retrieved evidence collectively shows — not source-by-source, but as a pattern",
    "strategicTension": "≤30 words: the most important unresolved tension this pivot surfaces",
    "implicationsForStage3": "≤30 words: what this pivot means for Stage 3 framing and focus",
    "assumptionsToTest": [
      "≤15 words each — specific assumption the pivot reveals needs validation"
    ],
    "recommendedStage3Angle": "≤30 words: the most defensible Stage 3 strategic angle given the pivot findings"
  },
  "proposedUpdates": [
    {
      "id": "pu_1",
      "targetSection": "evidenceConsolidation|competitorMap|adjacencyOpportunities|contradictionMap|unresolvedQuestions|stage3ReadinessSummary|general",
      "updateType": "add|modify|remove",
      "title": "≤10 words: what this update does",
      "currentText": "the exact text being modified or replaced, or empty string if updateType is add",
      "proposedText": "≤30 words: the proposed new or replacement text",
      "rationale": "≤20 words: why this update is warranted by the pivot evidence",
      "evidenceBasis": "≤20 words: what retrieved evidence specifically supports this update",
      "stage3Relevance": "≤20 words: how accepting this update would affect Stage 3 framing",
      "confidence": "high|medium|low"
    }
  ],
  "unresolvedQuestions": [
    "≤20 words: specific question this pivot surfaces that Stage 2 did not answer"
  ],
  "stage3Implications": [
    "≤20 words: specific implication for Stage 3 strategic framing"
  ],
  "additionalSearchSuggestions": [
    "≤15 words: a targeted search that would resolve remaining uncertainty"
  ]
}`
}

export const MOCK_PIVOT_RESULT = {
  displaySummary: 'Competitor behavior reveals a meaningful self-service capability gap that the current analysis understates as a constraint. Two vendors in adjacent segments have successfully converted managed-service clients to self-service tiers within 18 months, suggesting a faster migration path than the current model assumes.',
  analysisFoundation: {
    userDirectionInterpretation: 'Interpreted as a request to examine whether managed-service models can transition to platform motions without losing the trust advantage.',
    deeperFinding: 'The services-to-platform migration pattern is documented in adjacent segments — managed analytics vendors consistently use a "lite self-service tier" as the transition mechanism, not a full platform rebuild.',
    evidenceSynthesis: 'Retrieved evidence shows competitor migration timelines and conversion rates that are materially faster than the current analysis implies — 12–18 months is typical, not 3–5 years.',
    strategicTension: 'The core tension is not services vs. scale — it is whether a self-service tier can be introduced without cannibalizing the advisory relationship that drives renewal.',
    implicationsForStage3: 'Stage 3 should prioritize the services-to-platform migration question and model the self-service tier as a strategic inflection point, not a distant roadmap item.',
    assumptionsToTest: [
      'Managed-service clients resist self-service tiers even when available',
      'Advisory relationships require full managed delivery to sustain trust',
      'Platform transition requires 3+ years in regulated market segments',
    ],
    recommendedStage3Angle: 'Frame Stage 3 around the managed-to-platform migration decision — timing, mechanism, and the risk to advisory revenue during transition.',
  },
  proposedUpdates: [
    {
      id: 'pu_mock_1',
      targetSection: 'contradictionMap',
      updateType: 'modify',
      title: 'Qualify the services-vs-scale tension',
      currentText: 'The services-vs-scale tension is a core undocumented strategic bet.',
      proposedText: 'Services-vs-scale tension may resolve faster than assumed — comparable vendors have introduced self-service tiers within 18 months without abandoning managed delivery.',
      rationale: 'Competitor evidence contradicts the assumption that this tension is indefinitely unresolvable.',
      evidenceBasis: 'Two competitor case studies show 12–18 month managed-to-self-service transition timelines.',
      stage3Relevance: 'Changes the Stage 3 strategic question from "if" to "when and how" for platform migration.',
      confidence: 'medium',
    },
    {
      id: 'pu_mock_2',
      targetSection: 'stage3ReadinessSummary',
      updateType: 'add',
      title: 'Add self-service tier as strategic inflection',
      currentText: '',
      proposedText: 'Self-service tier introduction is a near-term strategic inflection — not a distant roadmap item — based on comparable vendor transition evidence.',
      rationale: 'Retrieved evidence places the timing decision in the current planning horizon, not a future one.',
      evidenceBasis: 'Adjacent-segment competitor timelines and conversion rates support an 18-month window.',
      stage3Relevance: 'Reframes Stage 3 as a migration timing and mechanism question, not a market readiness question.',
      confidence: 'medium',
    },
  ],
  unresolvedQuestions: [
    'At what client tenure threshold do managed analytics clients become receptive to self-service tier introduction?',
    'Does advisory revenue cannibalization actually occur, or is self-service additive in practice?',
  ],
  stage3Implications: [
    'Stage 3 framing should center on the managed-to-platform migration decision and its timing.',
    'The self-service tier is a near-term strategic lever — model it as a Stage 3 focus area.',
  ],
  additionalSearchSuggestions: [
    'managed analytics vendor self-service tier conversion case study',
  ],
}

// ─── Stage 2 mock data — Finlytica demo ──────────────────────────────────────

export const MOCK_V4_STAGE2 = {
  summary: {
    whatChanged: 'Stage 2 retrieval directionally confirmed the services-led commercial model and surfaced a meaningful capability gap in self-service analytics maturity relative to more mature vendors targeting adjacent segments.',
    strongestEvidence: 'FDIC third-party risk guidance is explicit — regulatory constraint on analytics vendors is structural, not temporary, supporting n8 as a verified constraint rather than inference.',
    weakestAreas: 'Revenue model specifics and customer retention rates remain unconfirmed. No public pricing or cohort data available for Finlytica.',
    dominantTensions: 'The most important unresolved tension is whether the services-first model can scale without losing the trust advantage that drives initial adoption.',
    likelyDirection: 'Finlytica is likely following a consultative-entry, gradual platformization path — consistent with how community banking analytics vendors typically evolve, though the timeline and trigger for platform-first motion remains unclear.',
  },
  evidenceConsolidation: [
    {
      nodeId: 'n3',
      nodeStatement: 'Finlytica\'s commercial model appears to be services-led — an analytics partnership or managed-service retainer rather than a traditional per-seat SaaS subscription.',
      evidenceSummary: 'Retrieved evidence supports a managed-analytics positioning. Competitor analysis confirms retainer structures are common in this segment.',
      relationship: 'supports',
      sources: [
        {
          title: 'Finlytica Solutions Page',
          url: 'https://finlytica.com/solutions',
          snippet: 'We deliver analytics as a partnership — your team, our platform, ongoing advisory. Built for community banks that need insights without building a data team.',
          relationship: 'supports',
        },
        {
          title: 'Community Bank Analytics Pricing — Fintech Futures',
          url: 'https://www.fintechfutures.com/2024/03/community-bank-analytics-pricing',
          snippet: 'Many community banking analytics vendors operate on retainer or managed-service pricing rather than traditional per-seat SaaS subscriptions.',
          relationship: 'supports',
        },
      ],
    },
    {
      nodeId: 'n8',
      nodeStatement: 'Community banks operate under strict federal and state regulatory oversight constraining data-sharing arrangements, third-party integrations, and how analytics findings can be operationalized.',
      evidenceSummary: 'FDIC supervisory guidance explicitly governs third-party risk management for analytics vendors. Confirmed structural constraint.',
      relationship: 'supports',
      sources: [
        {
          title: 'FDIC Third-Party Risk Management Guidance',
          url: 'https://www.fdic.gov/regulations/guidance/thirdparty',
          snippet: 'Banks must conduct robust due diligence on third-party data and analytics providers, including access controls, data residency, and audit rights.',
          relationship: 'supports',
        },
      ],
    },
  ],
  competitorMap: [
    {
      name: 'Nymbus',
      type: 'adjacent',
      segmentFit: 'Targets community banks and credit unions — same segment, but focused on core banking modernization rather than analytics depth.',
      capabilityGaps: 'Finlytica is more analytics-specialized. Nymbus is platform-breadth focused. Different buy centers and contract structures.',
      strategicDivergence: 'Nymbus competes on full-stack modernization. Finlytica competes on analytics depth. Unlikely to collide directly unless Nymbus adds analytics-as-a-service.',
      implications: 'Potential partnership opportunity. Risk: if Nymbus builds analytics natively, Finlytica loses a key referral and integration channel.',
    },
    {
      name: 'Apiture',
      type: 'mature',
      segmentFit: 'Community and mid-size banks — overlapping segment, but Apiture is digital banking platform-first with embedded analytics.',
      capabilityGaps: 'Apiture has deeper workflow integration. Finlytica has deeper analytics focus. Apiture analytics is bundled, not standalone.',
      strategicDivergence: 'Apiture sells platform-and-analytics bundled. Finlytica sells analytics-as-partnership. Different buying motion and decision-maker.',
      implications: 'Apiture represents what Finlytica could become if it platforms — and a ceiling on standalone analytics value if Apiture analytics matures.',
    },
  ],
  emergingEntrants: [
    {
      name: 'AI-native explanation layer vendors (category)',
      relevantTo: 'n6',
      capability: 'Auto-generate plain-language board narratives from raw analytics outputs without analyst intervention.',
      strategicImplication: 'If this capability commoditizes, the explainability opportunity (n6) becomes table stakes rather than differentiation. Timing and positioning matter.',
    },
  ],
  adjacencyOpportunities: [
    {
      area: 'Regulatory compliance reporting automation',
      partnershipLogic: 'Community banks produce mandatory regulatory reports from the same data Finlytica analyzes. A compliance reporting layer would deepen stickiness and extend the engagement.',
      acquisitionLogic: null,
      buildVsBuy: 'Partner with a specialist compliance vendor rather than build. Regulatory requirements change frequently — maintain via partnership, not proprietary code.',
      connectedNodeIds: ['n8', 'n3'],
      risks: 'Regulatory interpretation risk. Compliance errors carry reputational and liability exposure beyond what an analytics vendor should own.',
    },
  ],
  refinedAssertions: [
    {
      nodeId: 'n9',
      refinementType: 'qualified',
      originalStatement: 'If Finlytica demonstrates consistent value in community banking, it may expand upmarket to regional banks — but the expansion mechanism depends on the actual commercial model.',
      revisedStatement: 'Upmarket expansion to regional banks is plausible but constrained by the managed-service model — regional banks typically demand more self-service analytics maturity, which conflicts with Finlytica\'s current partnership-first motion.',
      reason: 'Competitor evidence shows regional bank analytics buyers prefer configurable self-service over managed partnerships. This is a structural barrier, not just a timing question.',
      confidenceChange: 'unchanged',
      userStatus: 'pending',
    },
  ],
  contradictionMap: [
    {
      description: 'Finlytica\'s trust-first, services-led model depends on deep human relationships — but scaling the platform requires reducing human dependency per account.',
      tensionType: 'business_model_tension',
      nodeIds: ['n3', 'n5', 'n9'],
      resolution: 'unresolved',
      resolutionNote: 'No evidence of how Finlytica intends to resolve the services-vs-scale tension. This is a core undocumented strategic bet.',
    },
    {
      description: 'The explainability opportunity assumes bank executives need AI-generated narrative — but community bank culture often prefers analyst-delivered interpretation over automated outputs.',
      tensionType: 'capability_constraint',
      nodeIds: ['n6', 'n7'],
      resolution: 'unresolved',
      resolutionNote: 'Adoption research consistently shows automation resistance in community banking contexts. The opportunity is real but requires change management that is not currently in the model.',
    },
  ],
  unresolvedQuestions: [
    'What is Finlytica\'s actual pricing structure — retainer, per-bank, outcome-based, or hybrid?',
    'At what asset-size threshold do community banks consider self-service vs managed analytics?',
    'How does Finlytica handle regulatory audit requirements for its analytics outputs?',
    'What is the competitive response if Apiture or Nymbus builds a native analytics layer?',
  ],
  stage3ReadinessSummary: {
    strongestThemes: [
      'Services-led analytics entry as trust arbitrage in analytics-light segments',
      'Regulatory constraint as both moat and ceiling — limits scale, creates compliance stickiness',
    ],
    unresolvedBlockers: [
      'Services-vs-scale tension unresolved — affects roadmap and M&A strategy',
      'Revenue model specifics unconfirmed — constrains unit economics modeling',
    ],
    refinedTensions: [
      'Explainability as opportunity vs automation resistance as adoption constraint',
      'Upmarket expansion aspiration vs managed-service model ceiling',
    ],
    highConfidenceFindings: [
      'Services-led commercial model confirmed directionally by multiple sources',
      'Regulatory constraint is structural — FDIC guidance is explicit',
      'Community bank buyer is CFO/COO, not technical buyer',
    ],
    capabilityGaps: [
      'Self-service configuration for regional bank segment',
      'Compliance reporting automation layer',
      'Real-time alerting vs periodic analytics reporting',
    ],
    strategicImplications: [
      'Finlytica must decide: deepen services or platform for scale — cannot optimize both indefinitely',
      'Compliance adjacency is highest-value partnership opportunity given regulatory constraint',
      'AI-native entrant risk in explainability is a 2–3 year horizon threat, not immediate',
    ],
  },
  recommendedNextActions: [
    'Challenge n3 (commercial model) with a targeted search for Finlytica job postings that signal model shift',
    'Find stronger evidence on community bank self-service analytics adoption threshold',
    'Expand competitor map to include Jack Henry Symitar analytics capabilities',
    'Investigate compliance reporting automation as a Stage 3 strategic focus area',
  ],
}

// ─── Stage 2 Reconcile ───────────────────────────────────────────────────────
//
// Targeted update pass for Stage 2 when Stage 1 changes are narrow in scope.
// Unlike a full rerun, the reconcile prompt receives only the impacted sections
// and asks the LLM to update just those — returning a partial JSON object.
// The caller overlays the result onto the existing stage2 before running
// buildStage2Comparison so that untouched sections produce no diff artifacts.

// Demo mock — used when no API key is set. Provides enough difference vs the
// original MOCK_V4_STAGE2 to demonstrate the reconcile review UI.
export const MOCK_V4_STAGE2_RECONCILE = {
  summary: {
    whatChanged:       'Reconcile pass sharpened the commercial model assertion and pricing-signal grounding',
    strongestEvidence: 'Revised pricing-model assertion is better supported by contract structure patterns',
    weakestAreas:      'Community bank self-service analytics adoption threshold remains empirically thin',
    dominantTensions:  'Subscription pivot signal vs. existing transaction revenue base creates execution uncertainty',
    likelyDirection:   'Deliberate shift toward recurring revenue is now consistent with the updated assertion basis',
  },
  evidenceConsolidation: [
    {
      nodeId:          'n3',
      relationship:    'supports',
      evidenceSummary: 'Contract renewal terms indicate movement toward subscription-style engagement for mid-market',
      sourceLabel:     'Contract structure patterns (reconcile pass)',
      sourceUrl:       null,
    },
    {
      nodeId:          'n5',
      relationship:    'qualifies',
      evidenceSummary: 'Compliance-driven upsell is recurring-revenue compatible but timing depends on regulatory cycle',
      sourceLabel:     'Compliance adjacency signals',
      sourceUrl:       null,
    },
  ],
  refinedAssertions: [
    {
      nodeId:            'n3',
      originalStatement: 'Finlytica uses a transaction-based fee model',
      revisedStatement:  'Finlytica is transitioning from transaction-based to subscription-style pricing, with hybrid arrangements mid-cycle',
      refinementType:    'strengthened',
      confidenceChange:  'increased',
      reason:            'Updated assertion basis incorporated in reconcile pass',
    },
  ],
  stage3ReadinessSummary: {
    strongestThemes: [
      'Subscription pricing pivot is now analytically grounded with the updated assertion basis',
      'Compliance adjacency remains a coherent strategic thread independent of pricing model',
    ],
    unresolvedBlockers: [
      'Community banking self-service analytics tipping point remains empirically thin after reconcile',
    ],
    refinedTensions: [
      'Transaction revenue base vs. subscription margin profile: transition timeline is the key uncertainty',
    ],
    highConfidenceFindings: [
      'Mid-market community bank compliance-analytics demand is well-grounded post-reconcile pass',
    ],
    capabilityGaps: [],
    strategicImplications: [
      'Stage 3 should treat subscription pricing migration as a first-order strategic hypothesis',
    ],
  },
}

// Section-level JSON schema fragments used to build the dynamic reconcile output schema.
const RECONCILE_SECTION_SCHEMAS = {
  summary:
`  "summary": {
    "whatChanged": "≤20 words: what the reconcile pass materially changed",
    "strongestEvidence": "≤20 words: strongest evidence for the updated assertions",
    "weakestAreas": "≤20 words: still-thin areas after reconcile",
    "dominantTensions": "≤20 words: key tensions in the updated picture",
    "likelyDirection": "≤20 words: updated strategic direction signal"
  }`,
  evidenceConsolidation:
`  "evidenceConsolidation": [
    {
      "nodeId": "stage1 node id the evidence relates to",
      "relationship": "supports|contradicts|qualifies|unresolved",
      "evidenceSummary": "≤20 words: what the evidence says",
      "sourceLabel": "≤10 words: source name or descriptor",
      "sourceUrl": null
    }
  ]`,
  competitorMap:
`  "competitorMap": [
    {
      "name": "competitor name", "type": "direct|indirect|adjacent",
      "segmentFit": "≤20 words", "strategicDivergence": "≤20 words",
      "capabilityGaps": "≤60 words", "acquisitionLogic": "≤60 words"
    }
  ]`,
  emergingEntrants:
`  "emergingEntrants": [
    {
      "name": "entrant name", "threatLevel": "low|medium|high",
      "strategicImplication": "≤60 words"
    }
  ]`,
  contradictionMap:
`  "contradictionMap": [
    {
      "tensionType": "≤5 words label", "description": "≤20 words",
      "resolution": "≤10 words", "nodeIds": [],
      "resolutionNote": "≤20 words"
    }
  ]`,
  adjacencyOpportunities:
`  "adjacencyOpportunities": [
    {
      "area": "≤5 words", "capability": "≤60 words",
      "partnershipLogic": "≤60 words", "buildVsBuy": "≤60 words", "risks": "≤60 words"
    }
  ]`,
  refinedAssertions:
`  "refinedAssertions": [
    {
      "nodeId": "stage1 node id",
      "originalStatement": "≤60 words: original text",
      "revisedStatement": "≤60 words: updated text reflecting new evidence",
      "refinementType": "strengthened|narrowed|qualified|weakened|contradicted|unresolved",
      "confidenceChange": "increased|decreased|unchanged",
      "reason": "≤30 words: why this revision is warranted"
    }
  ]`,
  unresolvedQuestions:
`  "unresolvedQuestions": [
    "≤60 words: specific open question — 3 to 5 items"
  ]`,
  recommendedNextActions:
`  "recommendedNextActions": [
    "≤60 words: specific action with rationale — 3 to 5 items"
  ]`,
  stage3ReadinessSummary:
`  "stage3ReadinessSummary": {
    "strongestThemes":        ["≤25 words — max 3: explain the signal"],
    "unresolvedBlockers":     ["≤25 words — max 3: explain why it blocks"],
    "refinedTensions":        ["≤25 words — max 3: name both forces and consequence"],
    "highConfidenceFindings": ["≤25 words — max 3: state what is now well-grounded"],
    "capabilityGaps":         ["≤25 words — max 3: name gap and why it matters"],
    "strategicImplications":  ["≤25 words — max 3: one implication for Stage 3 framing"]
  }`,
}

export function buildStage2ReconcilePrompt({
  entity, intent, policy,
  stage1Summary, acceptedNodes,
  changedNodes,
  currentStage2Sections,
  sectionsToUpdate,
}) {
  const policyBlock = renderPolicy(policy)

  // ── Changed nodes block ───────────────────────────────────────────────────
  const changesBlock = (changedNodes || []).map((c, i) => {
    const lines = [`  ${i + 1}. [${c.nodeId}] (${c.nodeType || 'node'})`]
    if (c.statementChanged) {
      lines.push(`       WAS:  "${c.previousStatement}"`)
      lines.push(`       NOW:  "${c.currentStatement}"`)
      if (c.changeReason) lines.push(`       WHY:  ${c.changeReason}`)
    }
    if (c.confidenceChanged) lines.push(`       CONFIDENCE: ${c.previousConfidence} → ${c.currentConfidence}`)
    if (c.statusChanged)     lines.push(`       STATUS: ${c.previousStatus} → ${c.currentStatus}`)
    return lines.join('\n')
  }).join('\n') || '  None recorded.'

  // ── Current impacted-section context ─────────────────────────────────────
  const currentCtxBlock = (sectionsToUpdate || []).map(key => {
    const val = currentStage2Sections?.[key]
    if (val == null) return `${key}: (empty)`
    const json = JSON.stringify(val, null, 2)
    // Truncate very long sections to keep prompt size bounded
    return `${key}:\n${json.length > 600 ? json.slice(0, 600) + '\n  … (truncated)' : json}`
  }).join('\n\n') || '  (none)'

  // ── Accepted nodes block ──────────────────────────────────────────────────
  const acceptedBlock = (acceptedNodes || []).length > 0
    ? acceptedNodes.map(n => `  [${n.id}] (${n.type}, ${n.confidence}) "${n.statement}"`).join('\n')
    : '  None accepted yet.'

  // ── Output schema (only the requested sections) ───────────────────────────
  const schemaLines = (sectionsToUpdate || [])
    .map(k => RECONCILE_SECTION_SCHEMAS[k])
    .filter(Boolean)
    .join(',\n')
  const outputSchema = `{\n${schemaLines}\n}`

  const sectionsListStr = (sectionsToUpdate || []).map(k => `  - ${k}`).join('\n')

  return `You are a rigorous strategic analyst performing a Stage 2 reconcile pass.

A Stage 2 reconcile pass is a TARGETED update — not a full rerun. You are updating only the specific Stage 2 sections impacted by recent Stage 1 refinements. All other Stage 2 sections remain unchanged.

ENTITY: "${entity.name}" (${entity.type})
ANALYST ROLE: ${intent.role}
RESEARCH INTENT: ${intent.what}${intent.why ? ' — ' + intent.why : ''}

── STAGE 1 CHANGES SINCE STAGE 2 WAS GENERATED ──────────────────────────────

The following Stage 1 nodes changed after Stage 2 was run. These are the primary driver of this reconcile pass.

${changesBlock}

── CURRENT STAGE 1 BASIS (accepted assertions) ──────────────────────────────

${acceptedBlock}

STAGE 1 SUMMARY:
${stage1Summary}

── CURRENT STAGE 2 CONTENT FOR IMPACTED SECTIONS ───────────────────────────

These are the current values of the sections you must reconcile:

${currentCtxBlock}

── RECONCILE MISSION ────────────────────────────────────────────────────────

Update ONLY these sections to reflect the Stage 1 changes above:
${sectionsListStr}

Rules:
- For each section, produce the best updated version given the changed assertions and any new evidence
- Where the Stage 1 change is a refinement (not a reversal), sharpen the existing analysis rather than replacing it
- Where evidence now contradicts the updated assertion, surface that in contradictionMap or refinedAssertions
- Do NOT update sections not listed above — they are not part of this reconcile scope
- Do NOT fabricate sources or evidence not retrieved in this session
- Mark uncertainty explicitly when the new assertion basis is still thin

${policyBlock}

RETRIEVAL STRATEGY: max 3 targeted searches focused on the changed assertions.
Stop after 3 retrievals or once meaningful evidence is found. Precision over coverage.

Return ONLY valid JSON. Output MUST begin with { and end with }. No preamble, no narration, no backticks.
Return ONLY the sections listed above — do not include other Stage 2 sections.

${outputSchema}`
}

// ─── Stage 3 — Strategic Synthesis & Readiness Assessment ────────────────────
//
// Stage 3 is pure synthesis — no web search.
// Context is assembled from Stage 1 + Stage 2 + accepted pivot proposals.
// Uses callClaude (not callClaudeWithSearch).

export function buildStage3Prompt({
  entity, intent,
  stage1Summary, inferredPatterns,
  acceptedNodes, refinedNodes,
  stage2Summary, evidenceItems, competitors, entrants,
  contradictions, adjacencies, openQuestions,
  stage3ReadinessSummary, acceptedPivotProposals,
  acceptedRefinements,
}) {
  // ── Context block builders ────────────────────────────────────────────────

  const acceptedBlock = acceptedNodes.length > 0
    ? acceptedNodes.map(n => `  [${n.id}] (${n.type}, ${n.confidence}) "${n.statement}"`).join('\n')
    : '  None accepted yet — synthesis basis is thin.'

  const refinedBlock = refinedNodes.length > 0
    ? refinedNodes.map(n =>
        `  [${n.id}] revised: "${n.statement}"\n        was: "${n.previousStatement}"`
      ).join('\n')
    : '  None.'

  const patternsBlock = inferredPatterns.length > 0
    ? inferredPatterns.map(p => `  - ${p.title}: ${p.insight}`).join('\n')
    : '  None.'

  const s2SummaryBlock = stage2Summary
    ? `  What changed:        ${stage2Summary.whatChanged || '—'}
  Dominant tensions:   ${stage2Summary.dominantTensions || '—'}
  Likely direction:    ${stage2Summary.likelyDirection || '—'}
  Strongest evidence:  ${stage2Summary.strongestEvidence || '—'}
  Weakest areas:       ${stage2Summary.weakestAreas || '—'}`
    : '  Stage 2 summary not available.'

  const evidenceBlock = evidenceItems.length > 0
    ? evidenceItems.map(e =>
        `  [${e.nodeId}] ${e.relationship?.toUpperCase() || 'FOUND'}: ${e.evidenceSummary}`
      ).join('\n')
    : '  None.'

  const competitorBlock = competitors.length > 0
    ? competitors.map(c => `  ${c.name} (${c.type}): ${c.strategicDivergence || c.segmentFit || ''}`).join('\n')
    : '  None mapped.'

  const entrantsBlock = entrants.length > 0
    ? entrants.map(e => `  ${e.name}: ${e.strategicImplication}`).join('\n')
    : '  None identified.'

  const contradictionBlock = contradictions.length > 0
    ? contradictions.map(c => `  ${c.tensionType}: ${c.description} [${c.resolution}]`).join('\n')
    : '  None.'

  const adjacencyBlock = adjacencies.length > 0
    ? adjacencies.map(a => `  ${a.area}: ${a.partnershipLogic}`).join('\n')
    : '  None.'

  const questionsBlock = openQuestions.length > 0
    ? openQuestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
    : '  None recorded.'

  const readinessBlock = stage3ReadinessSummary
    ? Object.entries(stage3ReadinessSummary)
        .filter(([, v]) => Array.isArray(v) && v.length > 0)
        .map(([k, arr]) => `  ${k}: ${arr.slice(0, 2).join(' | ')}`)
        .join('\n')
    : '  Not available.'

  const pivotBlock = acceptedPivotProposals.length > 0
    ? acceptedPivotProposals.map((p, i) =>
        `  ${i + 1}. "${p.title}" — ${p.text}${p.stage3Relevance ? ' [Stage 3: ' + p.stage3Relevance + ']' : ''}`
      ).join('\n')
    : '  None.'

  const refinementsBlock = (acceptedRefinements || []).length > 0
    ? (acceptedRefinements || []).map((r, i) => {
        const confChange = r.confidenceChange && r.confidenceChange !== 'unchanged'
          ? ` [confidence: ${r.confidenceChange}]`
          : ''
        const typeLabel  = r.refinementType ? ` (${r.refinementType})` : ''
        const reasonNote = r.reason         ? ` Reason: ${r.reason}`   : ''
        return (
          `  ${i + 1}. [${r.nodeId}]${typeLabel}${confChange}\n` +
          `       OPERATIVE: "${r.revisedStatement}"\n` +
          `       ORIGINAL:  "${r.originalStatement}"${reasonNote}`
        )
      }).join('\n')
    : '  None.'

  return `You are a rigorous strategic analyst conducting Stage 3 — Strategic Synthesis and Readiness Assessment.

Stage 3 is NOT a final strategy. It synthesizes what the research means, assesses evidence strength, surfaces insight clusters, and determines whether the analysis is ready to become a Stage 4 decision-basis artifact.

CRITICAL RULES:
- Do NOT produce generic summaries or consulting platitudes
- Do NOT claim certainty the evidence does not support — mark uncertainty explicitly
- Do NOT invent facts absent from the Stage 1 / Stage 2 basis provided below
- Every claim should trace to a Stage 1 node ID, a Stage 2 evidence item, or a clearly labeled analytical inference
- Use language like "appears to", "suggests", "is unclear" when confidence is limited
- Do NOT do web searches — synthesize from the provided context only

ENTITY: "${entity.name}" (${entity.type})
ANALYST ROLE: ${intent.role}
RESEARCH INTENT: ${intent.what}${intent.why ? ' — ' + intent.why : ''}
OUTCOME GOAL: ${intent.outcome}

── STAGE 1 BASIS ──────────────────────────────────────────────────────────────

ORIENTATION SUMMARY:
${stage1Summary}

ACCEPTED ASSERTIONS (highest analytical trust):
${acceptedBlock}

PRESSURE-TESTED / REVISED ASSERTIONS:
${refinedBlock}

INFERRED ANALYTICAL PATTERNS:
${patternsBlock}

── USER-ACCEPTED STAGE 2 REFINEMENTS ──────────────────────────────────────────

USER-VALIDATED ASSERTION REFINEMENTS (downstream-approved overlays, high analytical trust):
${refinementsBlock}

TREATMENT RULES FOR ACCEPTED REFINEMENTS:
- The OPERATIVE statement supersedes the original for all synthesis purposes
- The ORIGINAL is preserved for lineage only — do not synthesize from it
- Treat accepted refinements with the same trust as accepted Stage 1 assertions
- Where a refinement contradicts an accepted Stage 1 node for the same nodeId, the refinement takes precedence

── STAGE 2 FINDINGS ───────────────────────────────────────────────────────────

STAGE 2 SUMMARY:
${s2SummaryBlock}

EVIDENCE CONSOLIDATION:
${evidenceBlock}

COMPETITOR LANDSCAPE:
${competitorBlock}

EMERGING ENTRANTS:
${entrantsBlock}

STRATEGIC TENSIONS / CONTRADICTIONS:
${contradictionBlock}

ADJACENCY OPPORTUNITIES:
${adjacencyBlock}

OPEN QUESTIONS (Stage 1 + Stage 2):
${questionsBlock}

STAGE 2 READINESS SIGNALS:
${readinessBlock}

── ACCEPTED PIVOT PROPOSALS ───────────────────────────────────────────────────

USER-APPROVED ANALYTICAL REFINEMENTS (treat as high-trust additions to the basis):
${pivotBlock}

── SYNTHESIS MISSION ──────────────────────────────────────────────────────────

Produce a Stage 3 strategic synthesis answering:
1. What is the strongest current interpretation of the evidence?
2. What insight clusters are forming across the evidence?
3. What strategic implications matter most?
4. What plausible strategic options exist?
5. What risks, constraints, and unknowns remain?
6. What would prepare an audience to trust this analysis?
7. Is the analysis ready to become a Stage 4 decision-basis artifact?
8. What process-level learning signals should Stage 5 capture?

OUTPUT CONSTRAINTS:
- thesis.text: ≤100 words; rationale: ≤40 words
- evidenceMap: 4–7 items; each field ≤25 words
- insightClusters: 3–5; insight ≤80 words; other text fields ≤40 words; supportingEvidence ≤3 strings
- strategicImplications: 4–6; each field ≤40 words
- strategicOptions: 3–5; each field ≤60 words
- risksConstraintsUnknowns: 4–7; each field ≤40 words
- audienceConfidenceNotes arrays: ≤4 items, ≤30 words each; reasoningPath ≤60 words; defensibilityNotes ≤50 words
- stage4Readiness.rationale: ≤50 words; arrays ≤3 items
- stage5LearningSignals: 3–5; each field ≤40 words
- Insight clusters and strategic options must represent distinct analytical groupings — do not repeat the same point in different form

Return ONLY valid JSON. Output MUST begin with { and end with }. No preamble, no markdown, no backticks:
{
  "thesis": {
    "text": "≤100 words: the strongest current interpretation of the evidence — not a conclusion, a synthesis",
    "confidence": "Low|Medium|High",
    "rationale": "≤40 words: why this confidence level is appropriate given the evidence base"
  },
  "evidenceMap": [
    {
      "observation": "≤25 words: specific claim or observation from Stage 1 or Stage 2",
      "evidenceBasis": "≤25 words: what grounds this — Stage 1 node, Stage 2 evidence, or inference",
      "lineageRef": "node id or stage2 section name — e.g. n3, evidenceConsolidation, competitorMap",
      "scope": "company|industry|domain|workflow|cross-scope",
      "strength": "weak|moderate|strong",
      "implication": "≤25 words: what this means for the analysis"
    }
  ],
  "insightClusters": [
    {
      "title": "≤8 words",
      "insight": "≤80 words: synthesized analytical insight — not a summary, an interpretation",
      "supportingEvidence": ["≤3 strings referencing Stage 1 nodes, Stage 2 items, or pivot proposals"],
      "whyItMatters": "≤40 words",
      "strategicImplication": "≤40 words",
      "confidence": "Low|Medium|High"
    }
  ],
  "strategicImplications": [
    {
      "implication": "≤40 words",
      "stakeholders": "≤20 words",
      "relevance": "≤25 words: product, workflow, or business relevance",
      "evidenceBasis": "≤25 words",
      "confidence": "Low|Medium|High"
    }
  ],
  "strategicOptions": [
    {
      "title": "≤8 words",
      "description": "≤60 words",
      "plausibilityLevel": "Low|Medium|High",
      "plausibility": "≤50 words: why this option is plausible given the evidence — expand on the level",
      "supportingEvidence": "≤40 words",
      "validationNeeded": "≤50 words: what would need to be confirmed before pursuing",
      "risksTradeoffs": "≤50 words"
    }
  ],
  "risksConstraintsUnknowns": [
    {
      "item": "≤25 words",
      "whyItMatters": "≤35 words",
      "consequenceIfIgnored": "≤35 words",
      "investigationPath": "≤35 words"
    }
  ],
  "audienceConfidenceNotes": {
    "trustRequirements": ["≤4 strings — what an audience would need to see to trust this analysis"],
    "reasoningPath": "≤60 words: the analytical logic chain from evidence to synthesis",
    "tradeoffsToAcknowledge": ["≤3 strings — tensions or tradeoffs that should be surfaced honestly"],
    "evidenceGaps": ["≤4 strings — specific gaps that limit defensibility"],
    "defensibilityNotes": "≤50 words: overall defensibility assessment and framing guidance"
  },
  "stage4Readiness": {
    "status": "Not Ready|Partially Ready|Ready",
    "rationale": "≤50 words: why this readiness level",
    "missingInputs": ["≤3 strings — what would move readiness higher"],
    "artifactCandidates": ["≤3 strings — specific artifact types that fit the current analysis"],
    "suggestedArtifactType": "one of: opportunity memo | product thesis | discovery brief | portfolio case study | stakeholder interview plan | strategy decision brief | mock PRD"
  },
  "stage5LearningSignals": [
    {
      "signal": "≤40 words: a process-level observation about what worked or should change",
      "stage": "Stage 1|Stage 2|Stage 3|Stage 4-prep",
      "whyItMatters": "≤30 words",
      "recommendedFutureBehavior": "≤40 words"
    }
  ]
}`
}

// ─── Stage 3 mock data — Finlytica demo ──────────────────────────────────────
// Demo-only. The schema and component logic are fully generic.

export const MOCK_V4_STAGE3 = {
  thesis: {
    text: 'Finlytica occupies a defensible but constrained niche in community banking analytics by leading with managed services as trust infrastructure rather than as a delivery efficiency play. The services-led model is simultaneously a competitive moat and a unit-economics ceiling: it generates the relationships that enable adoption but limits growth without platform leverage or self-service optionality. The central strategic question is not whether to build a platform tier, but when and how — and whether that decision is urgent given competitive consolidation signals.',
    confidence: 'Medium',
    rationale: 'Core thesis is grounded in multiple independent evidence sources. Commercial model specifics remain unconfirmed from primary sources, limiting confidence to medium.',
  },
  evidenceMap: [
    {
      observation: 'Community banks make analytics decisions by relationship and intuition, not structured data analysis',
      evidenceBasis: 'Stage 1 finding n1 — high confidence, inferred from industry patterns',
      lineageRef: 'n1',
      scope: 'industry',
      strength: 'strong',
      implication: 'Creates structural demand for externally-delivered analytics with a trust-first entry motion',
    },
    {
      observation: "Finlytica positions as an 'analytics partnership,' not a SaaS product, per its own published language",
      evidenceBasis: 'Stage 2 evidence retrieval — direct evidence from finlytica.com',
      lineageRef: 'evidenceConsolidation',
      scope: 'company',
      strength: 'strong',
      implication: 'Managed-service model confirmed directionally; per-seat SaaS pricing unconfirmed',
    },
    {
      observation: 'FDIC third-party risk guidance explicitly governs analytics vendors in community banking',
      evidenceBasis: 'Stage 2 retrieval — verified regulatory source',
      lineageRef: 'evidenceConsolidation',
      scope: 'industry',
      strength: 'strong',
      implication: 'Regulatory constraint is structural — compliance depth creates moat and ceiling simultaneously',
    },
    {
      observation: 'Adjacent platform vendors (Nymbus, Apiture) bundle analytics rather than lead with analytics depth',
      evidenceBasis: 'Stage 2 competitor map',
      lineageRef: 'competitorMap',
      scope: 'industry',
      strength: 'moderate',
      implication: "Standalone analytics positioning is currently differentiated but vulnerable to platform roadmap additions",
    },
    {
      observation: 'Comparable vendors completed managed-to-self-service tier transitions in 12–18 months in adjacent segments',
      evidenceBasis: 'Stage 2 investigative pivot — operational constraints',
      lineageRef: 'pivots',
      scope: 'domain',
      strength: 'moderate',
      implication: 'Platform transition is achievable near-term; competitive window may be shorter than assumed',
    },
  ],
  insightClusters: [
    {
      title: 'Services as trust infrastructure, not delivery mechanism',
      insight: "Finlytica's advisory engagement is not an inefficiency to be platformized away — it is the actual value proposition in a market where analytics adoption is blocked by trust, not technology. The platform, if built, should be designed to deliver data access, not replace the advisory interpretation layer. This distinction is the key to introducing a self-service tier without cannibalizing renewal-driving relationships.",
      supportingEvidence: ['n1 (analytics-light market)', 'n5 (consultative sales pattern)', 'Stage 2 retainer pricing evidence'],
      whyItMatters: 'Misframing the advisory relationship as a cost to be eliminated leads to product decisions that undermine the core retention driver.',
      strategicImplication: 'Self-service tier should be positioned as data transparency, not analytical delivery — preserving advisory for interpretation while enabling scale.',
      confidence: 'Medium',
    },
    {
      title: 'Regulatory depth as underexploited competitive moat',
      insight: 'FDIC third-party risk governance makes compliance depth a selection criterion, not merely a qualification bar. Finlytica\'s specialization creates switching costs and an expertise barrier that generic analytics tools cannot clear. Compliance reporting automation — using the same underlying data — is the highest-leverage adjacency because it deepens this moat while extending engagement footprint and creating natural upsell.',
      supportingEvidence: ['n8 (regulatory constraint — verified fact)', 'Stage 2 FDIC evidence', 'Stage 2 adjacency opportunity: compliance reporting'],
      whyItMatters: 'The regulatory moat is currently an implicit advantage. Making it explicit and extending it through compliance automation converts a constraint into a structural differentiator.',
      strategicImplication: 'Compliance reporting automation is the adjacency with lowest execution risk and highest strategic leverage — prioritize over general platform building.',
      confidence: 'High',
    },
    {
      title: 'Platform transition timing is more urgent than roadmap suggests',
      insight: "Evidence from adjacent segments places the managed-to-self-service migration window at 12–18 months — far shorter than a traditional multi-year platform investment horizon. The risk is not that self-service is technically difficult, but that Finlytica delays while a platform competitor adds bundled analytics to their community banking offering. The competitive window for establishing the analytics partnership model as the default may be shorter than internal planning assumes.",
      supportingEvidence: ['Stage 2 pivot evidence — operational constraints', 'n9 revised (upmarket constraint)', 'Competitor analysis: platform player roadmap signals'],
      whyItMatters: 'If platform competitors add native analytics depth, the standalone analytics positioning collapses. Timing is the variable the analysis cannot confirm but cannot ignore.',
      strategicImplication: "The self-service tier decision is time-bounded. Delaying past the competitive window makes the transition reactive rather than strategic.",
      confidence: 'Low',
    },
  ],
  strategicImplications: [
    {
      implication: 'The managed-service model creates a hiring-dependent growth curve — each new client requires proportional advisory capacity, limiting scalable revenue without platform leverage',
      stakeholders: 'Executive team, investors, future acquirers',
      relevance: 'Directly determines scalability, headcount planning, and valuation trajectory',
      evidenceBasis: 'Stage 2 services-vs-scale contradiction; Stage 1 n3, n5',
      confidence: 'Medium',
    },
    {
      implication: 'Compliance reporting automation is the highest-value adjacent capability — lower execution risk than platform rebuild and extends the regulatory moat',
      stakeholders: 'Product team, CFO/COO buyer persona, compliance officers',
      relevance: 'Adjacency opportunity with natural fit to existing data scope and client relationships',
      evidenceBasis: 'Stage 2 adjacency opportunity; n8 regulatory constraint; FDIC evidence',
      confidence: 'Medium',
    },
    {
      implication: 'Upmarket expansion to regional banks is plausible but structurally constrained — regional banks expect self-service analytics maturity Finlytica does not currently offer',
      stakeholders: 'Growth team, enterprise sales function',
      relevance: 'Shapes whether growth is vertical (deeper community banking) or horizontal (adjacent segments)',
      evidenceBasis: 'Stage 2 refined assertion on n9; competitor evidence on regional bank expectations',
      confidence: 'Medium',
    },
    {
      implication: 'AI-native explanation layer vendors represent a time-bounded threat to the explainability opportunity — the differentiation window is estimated at 2–3 years',
      stakeholders: 'Product strategy, competitive intelligence',
      relevance: 'Shapes urgency of explainability feature investment vs. platform investment',
      evidenceBasis: 'Stage 2 emerging entrants — AI-native explanation layer category',
      confidence: 'Low',
    },
  ],
  strategicOptions: [
    {
      title: 'Deepen compliance adjacency via partnership',
      description: 'Partner with a compliance reporting specialist to offer regulatory analytics automation as an adjacent service layer. Position compliance reporting as a natural extension of the analytics partnership — using data already in scope.',
      plausibilityLevel: 'High',
      plausibility: 'Regulatory constraint is structural and the data is already within the engagement footprint. Advisory relationship provides the trust context for a natural expansion conversation.',
      supportingEvidence: 'Stage 2 adjacency opportunity; FDIC regulatory evidence; n8 constraint node; compliance moat insight cluster',
      validationNeeded: 'Identify viable compliance reporting partners; validate that CFO/COO buyers see compliance and analytics as naturally bundled; confirm incremental willingness-to-pay',
      risksTradeoffs: 'Compliance interpretation errors carry reputational and liability exposure beyond what an analytics vendor should own. Partnership dependency introduces vendor risk.',
    },
    {
      title: 'Introduce a self-service data access tier',
      description: "Build a lightweight self-service layer — automated dashboards and report delivery — positioned as data transparency, not analytical delivery. Advisory remains the interpretation and strategy layer.",
      plausibilityLevel: 'Medium',
      plausibility: "Comparable vendors completed this transition in 12–18 months. The framing matters: self-service as 'data access complement' to advisory, not 'advisory replacement.'",
      supportingEvidence: 'Stage 2 pivot evidence on comparable vendor transitions; Stage 2 refinement of n9; operational constraints pivot insight',
      validationNeeded: 'Validate that community bank executives accept self-service for data access while retaining advisory for interpretation. Validate pricing model — additive or substitutional?',
      risksTradeoffs: 'Advisory revenue cannibalization if self-service is perceived as full replacement. Requires engineering investment before growth return. Framing error is high-consequence.',
    },
    {
      title: 'Concentrate vertically in community banking',
      description: 'Resist upmarket expansion and deepen analytics capability within community banking — broader asset-size coverage, deeper workflow integration (lending, deposit, operations), richer peer benchmarking.',
      plausibilityLevel: 'Medium',
      plausibility: 'The market is fragmented and analytically underserved. Deeper specialization creates a more defensible position before platform competitors consolidate the segment.',
      supportingEvidence: 'n1 (analytics-light market); n4 (CFO/COO buyer); regulatory moat from n8; Stage 2 evidence on segment fit',
      validationNeeded: 'Validate addressable market size within community banking at viable retention economics. Confirm deeper vertical investment creates pricing power rather than commoditization.',
      risksTradeoffs: 'Concentrates risk in a single segment. Limits exit optionality if a platform competitor acquires or builds into the community banking analytics space.',
    },
  ],
  risksConstraintsUnknowns: [
    {
      item: 'Revenue model specifics unconfirmed — retainer, per-bank, outcome-based, or hybrid structure unknown',
      whyItMatters: 'Every strategic option — unit economics, scaling mechanism, investor narrative — depends on the actual commercial model',
      consequenceIfIgnored: 'Strategic recommendations may be built on incorrect commercial model assumptions, invalidating the entire analysis basis',
      investigationPath: 'Review job postings for pricing/account management signals; seek customer testimonials or case studies; find analyst or investor coverage',
    },
    {
      item: 'Advisory capacity as growth constraint — client growth may require proportional headcount without platform leverage',
      whyItMatters: 'Services-led models have hiring-dependent growth curves that limit revenue scaling without structural change',
      consequenceIfIgnored: 'Growth targets become unachievable without proactive delivery model transformation',
      investigationPath: 'Estimate client-to-advisor ratio from available team size data; benchmark against comparable managed analytics vendors in adjacent segments',
    },
    {
      item: 'Platform competitor entry timing — Nymbus or Apiture analytics depth expansion is a time-bounded risk',
      whyItMatters: "Finlytica's standalone differentiation depends on platform players remaining analytically underdeveloped in community banking",
      consequenceIfIgnored: 'The window for establishing analytics partnership as the default model closes if a platform player adds bundled analytics at competitive price',
      investigationPath: 'Monitor platform competitor product roadmap announcements and analytics-specific hiring signals quarterly',
    },
    {
      item: 'Self-service cannibalization risk — unknown whether self-service tier substitutes or complements advisory revenue',
      whyItMatters: 'The self-service tier option viability depends entirely on whether framing can preserve advisory renewal',
      consequenceIfIgnored: 'Premature or miframed self-service introduction could undermine the trust relationship driving the core business',
      investigationPath: 'Research comparable vendor transition case studies; validate framing distinction with target customer discovery interviews before building',
    },
    {
      item: 'Customer tenure and retention data absent — advisory relationship stickiness is inferred, not measured',
      whyItMatters: 'The trust-based retention narrative is the central assumption of the entire thesis — it has not been validated with cohort data',
      consequenceIfIgnored: 'Analysis may overstate the durability of the competitive moat if retention is lower than assumed',
      investigationPath: 'Seek customer references or case study publications; look for NPS or retention signals in any available press or analyst coverage',
    },
  ],
  audienceConfidenceNotes: {
    trustRequirements: [
      'Primary source confirmation of the commercial model — services-led positioning is directional, not contractually confirmed',
      'Customer tenure and retention evidence — the trust-based moat claim is an inference, not a measured fact',
      'Explicit labeling of what is verified, what is inferred, and what is hypothetical throughout any Stage 4 artifact',
      'Acknowledgment that platform competitor timing is a risk scenario, not a confirmed threat',
    ],
    reasoningPath: 'The analysis moves from verified structural constraints (regulatory environment, market fragmentation) → inferred commercial positioning (services-led entry) → analytical synthesis (scaling tension, timing decision). The logical chain is coherent but the commercial model assumption is load-bearing and unconfirmed.',
    tradeoffsToAcknowledge: [
      'Services-led model is both moat and ceiling — the analysis holds this tension without forcing false resolution',
      'Self-service tier could strengthen or destroy advisory revenue depending on framing — both outcomes are plausible and should be disclosed',
    ],
    evidenceGaps: [
      'No primary source confirmation of pricing structure or contract terms',
      'No customer interview data on advisory relationship tenure or renewal drivers',
      'No internal roadmap visibility on self-service or compliance adjacency interest',
      'Platform competitor timeline for community banking analytics expansion is unconfirmed',
    ],
    defensibilityNotes: 'This analysis is defensible as a structured analytical point of view grounded in public evidence and industry patterns. It must be framed as a research-based hypothesis, not a confirmed business assessment. Any Stage 4 artifact should carry explicit confidence labels per claim.',
  },
  stage4Readiness: {
    status: 'Partially Ready',
    rationale: 'Core thesis and insight clusters are analytically grounded and coherent. The commercial model gap is significant — a Stage 4 artifact can be produced but must frame this explicitly as an open assumption, not a resolved fact.',
    missingInputs: [
      'Confirmed commercial model (pricing structure, contract terms)',
      'Customer retention or tenure data to validate the trust-moat claim',
      'Finlytica team size or client-to-advisor ratio estimate',
    ],
    artifactCandidates: [
      'Discovery brief — questions a PM or BA would need answered in a customer or stakeholder discovery call',
      'Product thesis memo — what Finlytica is building, why it matters, and what the strategic inflection decisions are',
      'Competitive intelligence brief — Finlytica positioning against platform players with evidence',
    ],
    suggestedArtifactType: 'discovery brief',
  },
  stage5LearningSignals: [
    {
      signal: 'Stage 1 commercial model assumption (n3) was marked low-confidence but became load-bearing across Stage 2 and Stage 3 — it should have been flagged as a primary investigation target before proceeding',
      stage: 'Stage 1',
      whyItMatters: 'Low-confidence assumptions that are structurally central distort the entire analysis if wrong — early identification enables earlier pressure testing',
      recommendedFutureBehavior: 'At Stage 1 completion, identify which low-confidence nodes are depended on by multiple downstream assertions and surface them as priority pressure test candidates before Stage 2',
    },
    {
      signal: 'Stage 2 competitor map was initialized with two vendors and required manual cap increases — competitive context was underweighted relative to its analytical importance',
      stage: 'Stage 2',
      whyItMatters: 'A stronger competitor map would have surfaced the platform consolidation timing risk earlier and sharpened the strategic options earlier in the workflow',
      recommendedFutureBehavior: 'For entities in fragmented markets with known platform competition, prompt Stage 2 to prioritize competitor map breadth and emerging entrant coverage over evidence consolidation depth',
    },
    {
      signal: 'The operational constraints pivot produced the most analytically useful finding (12–18 month transition window) — it should have been recommended as high priority, not medium',
      stage: 'Stage 2',
      whyItMatters: 'The pivot evidence materially changed the strategic synthesis and the Stage 3 timing insight would be absent without it',
      recommendedFutureBehavior: "In the pivot scoring algorithm, entities with active services-vs-scale contradictions in Stage 2 should trigger 'high priority' for operational constraints pivot, not medium",
    },
    {
      signal: 'Stage 3 synthesis was limited by the absence of primary source data on the commercial model — this gap was known from Stage 1 but not resolved before Stage 3',
      stage: 'Stage 3',
      whyItMatters: 'A load-bearing assumption that reaches Stage 3 unvalidated constrains the entire synthesis and caps Stage 4 readiness at Partially Ready',
      recommendedFutureBehavior: 'Before initiating Stage 3, surface any unresolved low-confidence nodes that appear in Stage 2 evidence as load-bearing — prompt the user to attempt resolution or explicitly accept the gap',
    },
  ],
}

// ─── Evidence Refinement Prompt ────────────────────────────────────────────────
// Used when user selects text inside a Stage 3 Evidence Map item and submits
// a custom prompt to explain, challenge, or refine the selected evidence.

export function buildEvidenceRefinementPrompt({
  thesis,
  evidenceItem,
  selectedText,
  userPrompt,
  stage1Nodes = [],
  stage2Evidence = [],
}) {
  const lineageNote = evidenceItem.lineageRef
    ? `Lineage ref: ${evidenceItem.lineageRef}`
    : 'No lineage ref provided.'

  const s1Block = stage1Nodes.slice(0, 4)
    .map(n => `  [${n.id}] (${n.type}, ${n.confidence}) "${n.statement}"`)
    .join('\n') || '  None.'

  const s2Block = stage2Evidence.slice(0, 3)
    .map(e => `  [${e.nodeId}] ${e.relationship}: ${e.evidenceSummary}`)
    .join('\n') || '  None.'

  return `You are a rigorous strategic analyst examining a specific evidence item in a Stage 3 synthesis.

STAGE 3 THESIS (context):
${thesis || 'Not available.'}

EVIDENCE ITEM:
  Observation: ${evidenceItem.observation || '—'}
  Evidence basis: ${evidenceItem.evidenceBasis || '—'}
  Scope: ${evidenceItem.scope || '—'}
  Strength: ${evidenceItem.strength || '—'}
  Implication: ${evidenceItem.implication || '—'}
  ${lineageNote}

SELECTED TEXT (the specific phrase the user is examining):
"${selectedText}"

USER PROMPT:
${userPrompt}

LINEAGE — STAGE 1 NODES:
${s1Block}

LINEAGE — STAGE 2 EVIDENCE:
${s2Block}

CRITICAL RULES:
- Respond only to what was asked. Do not rewrite the whole item if the user asked to explain.
- Set strategyImpact to "substantial" ONLY if the refinement materially changes what strategic options make sense — not for minor clarifications.
- Include suggestedEvidenceUpdate keys ONLY for fields that genuinely improve. Omit keys that do not need updating.
- Do not fabricate sources or evidence not grounded in the provided context.

Return ONLY valid JSON. No markdown, no backticks:
{
  "explanation": "1-3 sentences directly addressing the user prompt",
  "refinedEvidenceText": "tighter version of the observation if refining — or repeat original if not refining",
  "refinementType": "explain|challenge|clarify|narrow|expand|product_implication|risk_or_constraint",
  "confidenceImpact": "none|low|medium|high",
  "strategyImpact": "none|minor|substantial",
  "rationale": "1-2 sentences: why this refinement type and these impact levels",
  "suggestedEvidenceUpdate": {
    "observation": "updated observation — omit if unchanged",
    "evidenceBasis": "updated evidence basis — omit if unchanged",
    "implication": "updated implication — omit if unchanged",
    "strength": "weak|moderate|strong — omit if unchanged"
  }
}`
}

// ─── Strategy Options Targeted Update ────────────────────────────────────────
// Used after a substantial evidence refinement is applied to refresh only
// strategicOptions — same field name as the Stage 3 schema output.

export function buildStrategyOptionsUpdatePrompt({
  thesis,
  refinedEvidenceMap,
  insightClusters,
  risks,
  currentStrategicOptions,
}) {
  const evidenceBlock = (refinedEvidenceMap || [])
    .map((e, i) =>
      `  ${i + 1}. [${e.scope || 'general'}${e._refined ? ', USER-REFINED' : ''}] ${e.observation}` +
      (e.implication ? `\n     → ${e.implication}` : '')
    ).join('\n') || '  None.'

  const clustersBlock = (insightClusters || [])
    .map(c => `  - ${c.title}: ${(c.insight || '').slice(0, 100)}…`)
    .join('\n') || '  None.'

  const risksBlock = (risks || [])
    .map(r => `  - ${r.item}`)
    .join('\n') || '  None.'

  const currentBlock = (currentStrategicOptions || [])
    .map((o, i) => `  ${i + 1}. "${o.title}": ${(o.description || '').slice(0, 80)}…`)
    .join('\n') || '  None.'

  const optCount = (currentStrategicOptions || []).length || 3

  return `You are a strategic analyst updating strategic options after the Evidence Map was user-refined.

One or more Evidence Map items are marked USER-REFINED above. Update strategic options to reflect these changes. Preserve options where the evidence change has no material effect.

STAGE 3 THESIS:
${thesis || 'Not available.'}

REFINED EVIDENCE MAP:
${evidenceBlock}

INSIGHT CLUSTERS:
${clustersBlock}

RISKS AND CONSTRAINTS:
${risksBlock}

CURRENT STRATEGIC OPTIONS (update in-place — do not replace wholesale):
${currentBlock}

CONSTRAINTS:
- Return exactly ${optCount} strategic options
- Each field ≤60 words
- Do not invent evidence not present above
- Return ONLY valid JSON, no markdown, no backticks:

{
  "strategicOptions": [
    {
      "title": "≤8 words",
      "description": "≤60 words",
      "plausibilityLevel": "Low|Medium|High",
      "plausibility": "≤50 words",
      "supportingEvidence": "≤40 words",
      "validationNeeded": "≤50 words",
      "risksTradeoffs": "≤50 words"
    }
  ]
}`
}

// ─── Outcome-Driven Strategy Menu ────────────────────────────────────────────
// Separate API call from Stage 3 synthesis — triggered by user button.
// Generates exactly 10 strategy options with full execution plans.
// Budget: 8000 tokens.

export function buildStrategyMenuPrompt({ thesis, evidenceMap, insightClusters, risks, strategicOptions, entity }) {
  const evidenceBlock = (evidenceMap || [])
    .map((e, i) =>
      `  ${i + 1}. [${e.scope || 'general'}${e._refined ? ', USER-REFINED' : ''}] ${e.observation}` +
      (e.implication ? `\n     → ${e.implication}` : '')
    ).join('\n') || '  None.'

  const clustersBlock = (insightClusters || [])
    .map(c => `  - ${c.title}: ${(c.insight || '').slice(0, 120)}`)
    .join('\n') || '  None.'

  const risksBlock = (risks || [])
    .map(r => `  - [${r.type || 'risk'}] ${r.item}`)
    .join('\n') || '  None.'

  const optionsBlock = (strategicOptions || [])
    .map((o, i) => `  ${i + 1}. ${o.title} (${o.plausibilityLevel || 'Medium'}): ${(o.description || '').slice(0, 80)}`)
    .join('\n') || '  None.'

  return `You are a senior strategy consultant producing an Outcome-Driven Strategy Menu for ${entity?.name || 'the entity under analysis'}.

STAGE 3 THESIS:
${thesis?.text || thesis || 'Not available.'}

EVIDENCE MAP:
${evidenceBlock}

INSIGHT CLUSTERS:
${clustersBlock}

RISKS AND CONSTRAINTS:
${risksBlock}

EXISTING STRATEGIC OPTIONS (extend and operationalize — do not duplicate verbatim):
${optionsBlock}

TASK:
Generate exactly 10 outcome-driven strategy options covering the full posture spectrum from aggressive investment to divestment. Each option must be grounded in the evidence above.

INVESTMENT POSTURE — use exactly one of: "double down" | "selective investment" | "maintain" | "deprioritize" | "divest/reallocate"

EXECUTION PLAN CONSTRAINTS (per option):
  - Each paragraph: 40–70 words
  - projectManagementPlan: sprint structure, ownership, milestones, governance cadence
  - engineeringPlan: architecture decisions, APIs, integrations, build vs buy, technical risk
  - impactAnalysisPlan: metrics, measurement approach, expected timeline to measurable result
  - optionalAdditionalExecutionNotes: risk or change management — omit the key entirely if not material

Return ONLY valid JSON, no markdown, no backticks:

{
  "strategyMenu": [
    {
      "id": "sm_1",
      "strategyName": "≤8 words, action-oriented",
      "investmentPosture": "double down",
      "outcomeServed": "≤12 words: the business outcome this achieves",
      "whatThisMeans": "≤50 words: concrete operational meaning",
      "evidenceSupporting": "≤50 words: evidence from the map above that supports this",
      "evidenceAgainst": "≤40 words: evidence or risks that argue against this",
      "conditionsForChoosing": "≤40 words: when or if conditions make this the right call",
      "tradeoffs": "≤40 words: what you give up",
      "nextValidationStep": "≤30 words: the one action that would confirm or refute this option",
      "stage4ArtifactUse": "≤30 words: how a Stage 4 artifact built from this option would be used",
      "executionPlan": {
        "projectManagementPlan": "40–70 words on sprint structure, ownership, milestones, governance",
        "engineeringPlan": "40–70 words on architecture, APIs, integrations, build vs buy",
        "impactAnalysisPlan": "40–70 words on metrics, measurement, expected timeline"
      }
    }
  ]
}`
}

// ─── Stage 4 Artifact Generation ─────────────────────────────────────────────
// Generates a 500–700 word one-page decision-basis artifact from a selected
// strategy menu option and a persona configuration.
// Budget: 4000 tokens.

export function buildStage4ArtifactPrompt({ entity, thesis, evidenceMap, insightClusters, risks, selectedStrategy, persona }) {
  const evidenceBlock = (evidenceMap || []).slice(0, 8)
    .map((e, i) => `  ${i + 1}. ${e.observation}${e.implication ? ' → ' + e.implication : ''}`)
    .join('\n') || '  None.'

  const clustersBlock = (insightClusters || []).slice(0, 5)
    .map(c => `  - ${c.title}: ${(c.insight || '').slice(0, 100)}`)
    .join('\n') || '  None.'

  const risksBlock = (risks || []).slice(0, 5)
    .map(r => `  - ${r.item}`)
    .join('\n') || '  None.'

  const strat = selectedStrategy || {}
  const pers = persona || {}
  const sideLabel = pers.side === 'customer' ? 'buyer/user perspective' : 'vendor/operator perspective'

  return `You are a strategy consultant writing a one-page decision-basis artifact for ${entity?.name || 'the subject entity'}.

PERSONA / AUDIENCE:
  Side: ${pers.side || 'provider'} (${sideLabel})
  Role: ${pers.role || 'not specified'}
  Tone emphasis: ${(pers.toneEmphasis || []).join(', ') || 'balanced'}

SELECTED STRATEGY: "${strat.strategyName}"
  Investment posture: ${strat.investmentPosture}
  Outcome served: ${strat.outcomeServed}
  What this means: ${strat.whatThisMeans}
  Evidence supporting: ${strat.evidenceSupporting}
  Evidence against: ${strat.evidenceAgainst}
  Conditions for choosing: ${strat.conditionsForChoosing}
  Tradeoffs: ${strat.tradeoffs}
  Next validation step: ${strat.nextValidationStep}
  Execution — PM: ${strat.executionPlan?.projectManagementPlan || ''}
  Execution — Eng: ${strat.executionPlan?.engineeringPlan || ''}
  Execution — Impact: ${strat.executionPlan?.impactAnalysisPlan || ''}
${strat.executionPlan?.optionalAdditionalExecutionNotes ? '  Execution — Additional: ' + strat.executionPlan.optionalAdditionalExecutionNotes : ''}

THESIS:
${thesis?.text || thesis || 'Not available.'}

EVIDENCE (top items):
${evidenceBlock}

INSIGHT CLUSTERS:
${clustersBlock}

RISKS:
${risksBlock}

TASK:
Write a structured one-page decision-basis artifact. Total word count across all sections: 500–700 words.
Adapt tone and framing to the persona above.
  Provider-side: operational authority, vendor credibility, build/buy framing, ROI to the business.
  Customer-side: value realization, risk to the buyer, TCO, switching cost framing.

Return ONLY valid JSON, no markdown, no backticks:

{
  "artifactTitle": "≤10 words",
  "subtitle": "≤15 words: strategy posture + audience signal",
  "personaSummary": "≤20 words describing the intended reader",
  "sections": [
    { "heading": "Section heading", "body": "80–140 words. Minimum 4 sections, maximum 6." }
  ],
  "keyDecisions": [
    "Decision point 1 — ≤15 words",
    "Decision point 2",
    "Decision point 3"
  ],
  "callToAction": "≤40 words: the one thing the reader should do next",
  "validationCheckpoints": [
    "≤15 words each — 2 to 3 items"
  ],
  "readinessWarnings": [
    "≤20 words each — conditions that would invalidate this strategy — 1 to 3 items"
  ]
}`
}

// ─── Mock data — Strategy Menu ────────────────────────────────────────────────

export const MOCK_STRATEGY_MENU = {
  strategyMenu: [
    {
      id: 'sm_1',
      strategyName: 'Accelerate core Calendar platform investment',
      investmentPosture: 'double down',
      outcomeServed: 'Capture scheduling workflow ownership in mid-market HCM',
      whatThisMeans: 'Increase Calendar engineering headcount, ship bi-weekly, and position the module as the scheduling layer that displaces point solutions like Calendly and Kronos within the Paylocity customer base.',
      evidenceSupporting: 'Calendar has 65% adoption in enterprise tier. Scheduling is the highest-frequency HCM touchpoint. Paylocity NPS advantage concentrates in workflow automation cohorts.',
      evidenceAgainst: 'Mid-market HR teams report change fatigue from rapid release cycles. Calendar UI complexity is a top-3 support ticket driver.',
      conditionsForChoosing: 'Win/loss analysis confirms Calendar is a leading deal differentiator in enterprise accounts over the last two quarters.',
      tradeoffs: 'Pulls roadmap bandwidth from Benefits and Talent modules. Risks over-engineering for SMB customers who use fewer features.',
      nextValidationStep: 'Run win/loss analysis on 30 enterprise deals from last 2 quarters — was Calendar cited as a differentiator?',
      stage4ArtifactUse: 'Decision brief for CPO on roadmap prioritization and resource allocation for the next fiscal year.',
      executionPlan: {
        projectManagementPlan: 'Run 2-week sprints with dedicated Calendar squad of 6 engineers, 1 PM, and 1 designer. Monthly stakeholder readout with CPO. Gate major releases through a Change Advisory Board. Milestone: GA of scheduling automation v2 in Q3. OKR: reduce time-to-first-schedule by 40%.',
        engineeringPlan: 'Refactor Calendar to event-driven architecture using the existing Paylocity message bus. Expose scheduling APIs for third-party integration. Build core availability engine in-house; buy time-zone normalization library. Primary risk: data model migration across 50K+ active calendars.',
        impactAnalysisPlan: 'Measure weekly active scheduling actions per account, Calendar support ticket volume, and feature adoption funnel depth. Baseline in Q1, target 25% improvement in scheduling task completion by Q3. Track CSAT delta for Calendar-heavy accounts quarterly.',
        optionalAdditionalExecutionNotes: 'Require PM-led enablement sessions before each major release. Assign a dedicated CSM to the top 50 Calendar accounts for live feedback capture. Trigger: if Q2 NPS drops on Calendar, pause new feature work and run a 6-week stability sprint.',
      },
    },
    {
      id: 'sm_2',
      strategyName: 'Selective Calendar investment for enterprise only',
      investmentPosture: 'selective investment',
      outcomeServed: 'Maximize Calendar ROI by focusing on the highest-value segment',
      whatThisMeans: 'Invest Calendar development only where deal size or retention risk justifies it. Enterprise accounts get feature-complete scheduling; SMB gets maintenance-mode parity. Deprioritize Calendar for sub-500-employee accounts.',
      evidenceSupporting: 'Enterprise accounts drive 70% of Calendar-related escalations and retention risk. Paylocity margin is 18 percentage points higher in the enterprise tier.',
      evidenceAgainst: 'SMB is the fastest-growing segment. A perceived feature gap between tiers risks brand perception as a two-class product.',
      conditionsForChoosing: 'Segmentation data confirms SMB customers use fewer than 3 of 12 Calendar features and that churn is not scheduling-driven in the SMB tier.',
      tradeoffs: 'Cedes scheduling leadership in SMB to competitors investing there. Creates internal tension between SMB and enterprise product tracks.',
      nextValidationStep: 'Pull Calendar feature utilization by company size band. If SMB uses fewer than 3 features on average, selective investment is justified.',
      stage4ArtifactUse: 'Segmentation brief for VP Product to justify tiered roadmap investment and align SMB sales expectations.',
      executionPlan: {
        projectManagementPlan: 'Split Calendar backlog into Enterprise (active sprint) and SMB (maintenance queue) tracks. Enterprise PM owns the feature roadmap; SMB PM owns bug and parity work. Quarterly enterprise steering committee. SMB changes require VP approval before development begins.',
        engineeringPlan: 'Feature-flag architecture to gate enterprise-only scheduling capabilities. Shared core data model, divergent UI layer. Build an entitlement service to manage feature access by account tier. Risk: entitlement complexity increases QA surface by an estimated 30%.',
        impactAnalysisPlan: 'Track enterprise Calendar NPS monthly and SMB Calendar ticket volume quarterly. Success criteria: enterprise CSAT on scheduling at or above 4.4, SMB Calendar support tickets flat or declining. Revenue metric: enterprise Calendar-attributed retention rate versus prior-year cohort.',
      },
    },
    {
      id: 'sm_3',
      strategyName: 'Maintain current Calendar trajectory',
      investmentPosture: 'maintain',
      outcomeServed: 'Preserve scheduling capability without over-indexing on unproven bets',
      whatThisMeans: 'Continue the current Calendar roadmap at current headcount with no major architecture changes. Ship planned features on existing cadence and monitor competition without reacting prematurely to market signals.',
      evidenceSupporting: 'Calendar adoption is stable. No major competitive displacement threat is confirmed. Current release cadence satisfies committed enterprise roadmap items.',
      evidenceAgainst: 'Workday and Rippling are investing heavily in scheduling. Maintaining current pace may mean falling behind within 12 to 18 months.',
      conditionsForChoosing: 'Competitive intelligence shows no imminent scheduling feature releases from the top 3 competitors in the next two quarters.',
      tradeoffs: 'Risk of being caught flat-footed if competition accelerates. Opportunity cost of not leading the scheduling layer.',
      nextValidationStep: 'Conduct a competitive feature audit of Workday, Rippling, and ADP scheduling modules and publish findings to product leadership within 30 days.',
      stage4ArtifactUse: 'Status brief for the exec team covering current state, competitive context, and defined triggers for investment escalation.',
      executionPlan: {
        projectManagementPlan: 'Maintain current 2-week sprint cadence with existing Calendar squad. Quarterly roadmap review against committed items. Add a monthly competitive monitoring checkpoint. No headcount change. Trigger: if two consecutive quarterly reviews show scheduling win-rate decline, escalate to CPO.',
        engineeringPlan: 'No architectural changes. Continue shipping from the existing Calendar backlog. Add automated regression coverage for core scheduling flows to reduce QA debt. Monitor third-party scheduling API usage in the customer base to detect workarounds signaling unmet needs.',
        impactAnalysisPlan: 'Quarterly dashboard: scheduling task completion rate, Calendar CSAT, support volume, and feature adoption breadth. Compare against the same quarter prior year. Flag any metric that moves more than 10% unfavorably — triggers an executive review meeting.',
      },
    },
    {
      id: 'sm_4',
      strategyName: 'Deprioritize Calendar, redirect to core HCM',
      investmentPosture: 'deprioritize',
      outcomeServed: 'Reallocate capacity to higher-ROI HCM modules with stronger moats',
      whatThisMeans: 'Reduce the Calendar team to a 2-person maintenance crew and redirect engineering capacity to Benefits, Talent, and Payroll modules where differentiation is clearer and competitive switching costs are higher.',
      evidenceSupporting: 'Paylocity highest NPS scores correlate with Payroll and Benefits accuracy, not scheduling. Core HCM is where switching costs are highest and churn attribution to Calendar is low.',
      evidenceAgainst: 'Calendar is a high-frequency touchpoint. Deprioritization risks visibility loss in daily workflow, reducing platform stickiness over time.',
      conditionsForChoosing: 'Retention cohort analysis confirms Calendar has no independent contribution to customer lifetime value beyond what Payroll and Benefits already provide.',
      tradeoffs: 'Loss of scheduling workflow leadership. Risk that customers adopt point solutions like Calendly that reduce Paylocity platform share-of-workflow.',
      nextValidationStep: 'Run retention cohort analysis: do customers with high Calendar engagement churn less than those without? If no significant difference, deprioritization is safe.',
      stage4ArtifactUse: 'Rationale document for product and finance leadership justifying resource reallocation and setting Calendar to maintenance mode.',
      executionPlan: {
        projectManagementPlan: 'Wind down the Calendar sprint track over 60 days. Transition open stories to the backlog or cancel them. Assign 2 engineers to a maintenance rotation shared with the Payroll team. Monthly bug triage replaces the weekly Calendar standup. Document all open feature requests for a potential future restart.',
        engineeringPlan: 'Freeze the Calendar API surface — no new endpoints, no architectural changes. Set up automated monitoring to catch regressions. Document Calendar internals for future team re-onboarding. Evaluate whether the Calendar data model should be consolidated into the core HCM schema.',
        impactAnalysisPlan: 'Monitor Calendar support tickets, CSAT, and churn-flag frequency monthly during wind-down. If any metric exceeds 1.5x baseline over 90 days, trigger a re-evaluation meeting. Track whether customers are adopting Calendly — a leading indicator of unmet scheduling need.',
      },
    },
    {
      id: 'sm_5',
      strategyName: 'Partner with a scheduling specialist, sunset native Calendar',
      investmentPosture: 'divest/reallocate',
      outcomeServed: 'Deliver best-in-class scheduling via OEM partnership without internal R&D cost',
      whatThisMeans: 'Wind down native Calendar and replace it with a deep integration with a scheduling specialist. Paylocity provides the HR data layer; the partner provides the scheduling UX. Exit scheduling UI ownership while preserving the workflow.',
      evidenceSupporting: 'Scheduling specialists invest 100% of R&D in this category. Calendar UI complexity is a top support driver. OEM integration partnerships are increasingly common in mid-market HCM.',
      evidenceAgainst: 'Calendar is embedded in Paylocity workflows. Migration risk for existing users is high. OEM deals carry margin compression and long-term dependency on a third-party roadmap.',
      conditionsForChoosing: 'A scheduling partner achieves 4.5 or higher CSAT with Paylocity customer profile in a 90-day pilot, and the migration path is automatable.',
      tradeoffs: 'Loss of scheduling data ownership. Customer UX disruption during migration. Long-term dependency on partner roadmap decisions.',
      nextValidationStep: 'Run a 90-day pilot offering 50 enterprise accounts a Calendly deep integration alongside native Calendar. Measure adoption, CSAT, and support volume.',
      stage4ArtifactUse: 'Partnership evaluation brief for CPO and CFO: build vs partner analysis, pilot results framework, and go/no-go criteria.',
      executionPlan: {
        projectManagementPlan: '90-day partnership pilot in 3 phases: integration build in 30 days, controlled rollout to 50 accounts in 30 days, evaluation and decision in 30 days. PM owns pilot governance. CPO decision gate at day 90. Full migration plan must be ready before the go/no-go decision.',
        engineeringPlan: 'Build HR data sync API between Paylocity and partner scheduling platform. Scope: employee availability, PTO sync, and org hierarchy. Evaluate partner API maturity before committing. Risk: Paylocity HR data compliance requirements may restrict what can be shared via OAuth integration.',
        impactAnalysisPlan: 'Pilot metrics: scheduling task completion rate, Calendar CSAT, support ticket volume, and pilot account churn rate. Compare pilot cohort against a matched control group. Decision threshold: pilot CSAT at or above 4.3 and support tickets at or below baseline.',
      },
    },
    {
      id: 'sm_6',
      strategyName: 'Build scheduling as an API platform for ISV partners',
      investmentPosture: 'selective investment',
      outcomeServed: 'Monetize Paylocity scheduling data as an HR workflow platform',
      whatThisMeans: 'Invest in exposing Calendar as a scheduling API that ISV partners and enterprise integrators can build on. Shift from internal product to scheduling-data-as-a-service and create a developer ecosystem around HR scheduling data.',
      evidenceSupporting: 'Paylocity holds rich employee availability, shift, and PTO data that standalone scheduling tools lack. Enterprise customers request integrations with Jira and Asana that depend on employee capacity data.',
      evidenceAgainst: 'Paylocity has no API developer ecosystem today. Building one requires new infrastructure, documentation, and developer relations capabilities not currently present.',
      conditionsForChoosing: 'Three or more enterprise customers independently request scheduling API access within a single quarter, signaling real demand before significant investment.',
      tradeoffs: 'High upfront platform investment with uncertain demand. Requires new go-to-market capability including developer relations and ISV partnerships.',
      nextValidationStep: 'Survey the top 25 enterprise accounts: would your team build or buy a scheduling integration if Paylocity offered an API? Quantify willingness-to-pay.',
      stage4ArtifactUse: 'Platform strategy brief for CPO and CTO: API ecosystem investment thesis, demand signal analysis, build roadmap, and ISV partnership criteria.',
      executionPlan: {
        projectManagementPlan: 'Phase 1 Q1: API design and internal beta with 5 design-partner accounts. Phase 2 Q2: ISV pilot with 3 partners. Phase 3 Q3: GA with developer portal. PM and partnerships lead co-own. Monthly executive steering with CPO and CTO throughout.',
        engineeringPlan: 'Build OAuth 2.0 gateway on the existing Paylocity auth layer. Design RESTful scheduling API with employee availability, shift, and PTO endpoints. Include rate limiting, versioning, and sandbox environment. Buy API gateway infrastructure, build domain logic in-house.',
        impactAnalysisPlan: 'Track API registrations, calls per month, integration partner count, enterprise accounts with active integrations, and ARR from API-tier accounts. Target 10 ISV integrations and 100 enterprise API-active accounts by end of year 1.',
        optionalAdditionalExecutionNotes: 'Risk: if API adoption is below 50 enterprise accounts by Q3, re-evaluate the platform thesis. Prepare a pivot plan to productize the API as an internal-only data layer powering future Paylocity modules rather than an external developer platform.',
      },
    },
    {
      id: 'sm_7',
      strategyName: 'Consolidate Calendar into a Workforce Management suite',
      investmentPosture: 'maintain',
      outcomeServed: 'Eliminate module fragmentation and increase cross-sell through unified WFM',
      whatThisMeans: 'Merge Calendar into a broader Workforce Management module alongside time tracking, shift management, and labor forecasting. Sell as a unified WFM suite with premium pricing rather than a standalone scheduling tool.',
      evidenceSupporting: 'Customers who use Calendar also request time tracking integration most frequently. WFM suite positioning commands a 20 to 30% pricing premium. Workday and UKG sell WFM as a unified bundle.',
      evidenceAgainst: 'Module consolidation is an 18 to 24 month engineering undertaking. Risk of disrupting existing Calendar customers during migration.',
      conditionsForChoosing: 'Product analytics shows Calendar and Time Tracking are co-activated in more than 60% of accounts, signaling customers already view them as a pair.',
      tradeoffs: 'Long timeline to value. Increases coordination complexity. May confuse existing Calendar-only buyers who do not need full WFM.',
      nextValidationStep: 'Analyze module co-activation rates. If Calendar plus Time Tracking co-activation exceeds 60%, consolidation thesis is supported.',
      stage4ArtifactUse: 'Product consolidation brief for CPO: WFM module architecture, customer migration plan, pricing model, and competitive positioning versus Workday WFM.',
      executionPlan: {
        projectManagementPlan: '18-month program in 3 phases: design and architecture 6 months, build and internal testing 9 months, GA and customer migration 3 months. Dedicated squad of 10 engineers. Monthly steering committee with CPO, CTO, and Head of Sales throughout all phases.',
        engineeringPlan: 'Build a unified WFM data model merging Calendar, Time Tracking, and Shift entities into a single API surface. Maintain backwards compatibility for Calendar-only customers during a 12-month migration window. Full feature parity gate required before GA.',
        impactAnalysisPlan: 'Milestone metrics: unified module CSAT at GA, cross-sell rate from Calendar to full WFM suite, average contract value uplift, and time-to-full-WFM-adoption for migrated accounts. Target 30% of Calendar-only accounts upgrading within 12 months of GA.',
      },
    },
    {
      id: 'sm_8',
      strategyName: 'Use Calendar as a compliance moat for at-risk accounts',
      investmentPosture: 'selective investment',
      outcomeServed: 'Retain at-risk enterprise accounts by leading with scheduling stickiness',
      whatThisMeans: 'Invest in Calendar features that are difficult to replicate quickly — compliance-aware scheduling, union rule integration, and advanced availability matching. Position as a retention moat for complex accounts rather than a growth driver for new ones.',
      evidenceSupporting: 'Enterprise accounts with complex scheduling requirements show 40% lower churn than standard accounts. This complexity is difficult for newer HCM competitors to replicate without deep HR data integration.',
      evidenceAgainst: 'Compliance-aware scheduling is a niche within the overall Calendar user base. Investment at scale serves a minority of accounts and may not justify ROI if churn rates do not improve measurably.',
      conditionsForChoosing: 'At-risk enterprise account analysis shows scheduling complexity is a top retention lever for more than 12 of the top 20 accounts most likely to churn.',
      tradeoffs: 'Serving a minority use case with disproportionate investment. Benefit is concentrated in accounts already in the contract pipeline — limited new customer acquisition upside.',
      nextValidationStep: 'Pull the top 20 at-risk enterprise accounts. How many have complex scheduling requirements? If more than 12, moat defense investment is justified.',
      stage4ArtifactUse: 'Retention strategy brief for Head of Customer Success: accounts to target, Calendar moat features, and CSM playbook for renewal conversations.',
      executionPlan: {
        projectManagementPlan: 'Identify the top 30 at-risk enterprise accounts with complex scheduling needs. Assign dedicated CSM and PM to each. 90-day retention sprint delivering 2 moat features per quarter. Governance: monthly churn review with CS leadership. Gate: if 5 accounts renew citing Calendar improvements, expand the program.',
        engineeringPlan: 'Build a configurable rule engine for union scheduling agreements covering shift differentials, mandatory rest periods, and seniority-based assignment. Evaluate open-source rule engine versus custom build. Risk: rule complexity exponentially increases QA surface — plan for a dedicated compliance QA resource.',
        impactAnalysisPlan: 'Track renewal rate for targeted accounts versus a matched control, Calendar moat feature activation by account, and compliance scheduling support escalations. Target 80% renewal rate in targeted cohort versus 65% baseline. Measurement cadence: monthly during sprint, quarterly thereafter.',
        optionalAdditionalExecutionNotes: 'Train CS team on the compliance scheduling value proposition before account outreach begins. Prepare a comparison leave-behind showing Paylocity versus competitor compliance scheduling capability. Risk: if legal review of union scheduling rules extends the timeline, delay feature GA rather than ship with incomplete compliance coverage.',
      },
    },
    {
      id: 'sm_9',
      strategyName: 'Position Calendar as AI-first scheduling differentiator',
      investmentPosture: 'selective investment',
      outcomeServed: 'Establish AI scheduling leadership before competitors in mid-market HCM',
      whatThisMeans: 'Invest in AI-powered scheduling features: auto-optimize shift coverage, predict scheduling conflicts before they occur, and recommend patterns based on historical workforce data. Position Paylocity as the intelligent scheduling layer in HCM.',
      evidenceSupporting: 'Paylocity holds multi-year historical scheduling data competitors lack. AI scheduling is on Workday 2025 roadmap — moving now creates a 12 to 18 month timing advantage.',
      evidenceAgainst: 'AI scheduling requires data quality investment before model training. Paylocity current Calendar data model may not be structured for ML consumption. Customer trust in AI HR decisions is still developing.',
      conditionsForChoosing: 'A technical assessment confirms Paylocity scheduling data has sufficient quality and volume to train a predictive model within 6 months.',
      tradeoffs: 'High R&D investment with 12 to 18 month horizon to customer-visible value. Risk of shipping AI features before customer trust is established in this domain.',
      nextValidationStep: 'Commission a 30-day data quality audit of Calendar historical data covering completeness, schema consistency, and volume by account tier.',
      stage4ArtifactUse: 'AI roadmap investment brief for CPO and Head of Data: model approach, data requirements, timeline to production, and competitive timing rationale.',
      executionPlan: {
        projectManagementPlan: 'Phase 1: 30-day data audit with current team. Phase 2: AI scheduling pilot with a 3-person ML team and 3 design-partner enterprise accounts over 90 days. Phase 3: GA with configurable opt-in AI recommendations. CPO decision gate at end of Phase 2 before Phase 3 commitment.',
        engineeringPlan: 'Build a scheduling data pipeline to an ML feature store. Train a gradient-boosted model for shift coverage prediction. Serve recommendations via the existing Calendar API. Build an explainability layer — HR admins must see why the AI recommended each scheduling pattern before accepting it.',
        impactAnalysisPlan: 'Pilot metrics: scheduling conflict reduction rate, time-to-schedule for AI-assisted versus manual, and admin acceptance rate of AI recommendations. Target 20% reduction in scheduling conflicts and 30% faster scheduling task completion in pilot accounts within 90 days.',
        optionalAdditionalExecutionNotes: 'Run structured customer education before enabling AI features. Provide a confidence score on every AI recommendation and an explain-this-recommendation feature at GA. Risk: if acceptance rate falls below 50% at end of pilot, pause expansion and run qualitative research before proceeding.',
      },
    },
    {
      id: 'sm_10',
      strategyName: 'Exit scheduling, reposition as HR analytics platform',
      investmentPosture: 'divest/reallocate',
      outcomeServed: 'Reposition Paylocity from scheduling tool to workforce intelligence platform',
      whatThisMeans: 'Sunset Calendar over 24 months. Redirect all scheduling engineering capacity to an HR analytics layer that aggregates scheduling, workforce, and payroll data into executive dashboards. Compete on intelligence, not scheduling mechanics.',
      evidenceSupporting: 'HR analytics is a high-growth market. Paylocity data assets spanning payroll, scheduling, and talent are uniquely positioned to power cross-functional workforce intelligence that point scheduling tools cannot match.',
      evidenceAgainst: '24-month platform pivot carries high execution risk. Calendar sunset risks near-term retention. Analytics market has established players in Visier, Workday Prism, and Tableau.',
      conditionsForChoosing: 'Market analysis confirms Paylocity can achieve a credible top-5 position in mid-market HR analytics within 36 months and customer research confirms demand for unified workforce intelligence.',
      tradeoffs: 'Maximum short-term disruption and customer communication burden. Long payback period before analytics revenue materializes. Requires managing Calendar sunset carefully across the customer base.',
      nextValidationStep: 'Commission a 60-day HR analytics market sizing and competitive positioning study — assess Paylocity data asset advantage versus Visier, Workday Prism, and Tableau.',
      stage4ArtifactUse: 'Strategic pivot brief for CEO, CPO, and Board: platform repositioning rationale, data asset value analysis, 36-month transformation roadmap, and investment case.',
      executionPlan: {
        projectManagementPlan: '24-month phased exit: Year 1 — build analytics platform core while maintaining Calendar. Year 2 — GA analytics platform, begin Calendar sunset communications. Year 3 — Calendar EOL, full analytics market launch. Quarterly program steering committee with CEO, CPO, and CFO.',
        engineeringPlan: 'Build a unified workforce data warehouse aggregating payroll, scheduling, and talent data. API layer for self-serve analytics. Evaluate embedded BI tooling for the Paylocity UI. Calendar codebase maintained by a 2-person team during the 24-month wind-down with no new features added.',
        impactAnalysisPlan: 'Year 1: analytics pilot with 10 design-partner accounts — track executive dashboard adoption and insights actioned per month. Year 2: GA metrics — accounts on platform, ARR uplift per analytics account. Year 3: full cohort retention rate versus pre-pivot baseline.',
        optionalAdditionalExecutionNotes: 'Calendar sunset plan: 18-month advance notice to all Calendar accounts, dedicated migration support team, and data export tools available at announcement. Risk: if Year 1 pilot adoption is below 50% of design partners, re-evaluate sunset timeline and consider keeping Calendar as a legacy offering on maintenance-only support.',
      },
    },
  ],
}

// ─── Mock data — Stage 4 Artifact ────────────────────────────────────────────

export const MOCK_STAGE4_ARTIFACT = {
  artifactTitle: 'Calendar Platform: The Case for Accelerated Investment',
  subtitle: 'Double-down strategy — Chief Product Officer decision brief',
  personaSummary: 'CPO reviewing roadmap allocation for the HCM scheduling module',
  sections: [
    {
      heading: 'Strategic Context',
      body: "Paylocity's Calendar module sits at the highest-frequency touchpoint in the HCM workflow — scheduling decisions happen daily where payroll decisions happen monthly. This frequency advantage creates an asymmetric opportunity: a scheduling layer embedded in daily operations generates switching costs that HR core modules, despite their contractual stickiness, cannot match on their own. The question is not whether to invest in scheduling, but whether the current investment rate is sufficient to defend against a converging competitive field.",
    },
    {
      heading: 'Evidence Basis',
      body: 'Calendar adoption among enterprise accounts reaches 65% of the installed base, with the highest-engagement cohorts showing measurably lower churn than the Paylocity average. Win-loss patterns indicate scheduling capability is an active factor in competitive deals involving Workday and Rippling. However, the same evidence reveals a gap: Calendar UI complexity is a top-3 support driver, indicating that current adoption reflects need — not satisfaction. There is room to convert functional adoption into loyalty-generating satisfaction before competitors close the feature gap.',
    },
    {
      heading: 'Investment Rationale',
      body: "A double-down posture is justified on three grounds. First, the data asset advantage: Paylocity holds multi-year scheduling history that new entrants cannot synthesize quickly, creating a defensible AI scheduling foundation if developed now. Second, the timing window: Workday's 2025 roadmap signals scheduling intelligence investment, establishing an 18-month window before competitive parity arrives. Third, the moat economics: union rule scheduling and compliance-aware scheduling are areas where Paylocity's enterprise customer relationships create requirements that generic scheduling tools cannot serve without deep HCM integration.",
    },
    {
      heading: 'Execution Approach',
      body: 'The recommended execution follows three phases. Phase 1 — Q1 to Q2: stabilize the existing Calendar experience, targeting a 30% reduction in support ticket volume and improved scheduling task completion rates. No net-new features until the foundation is reliable. Phase 2 — Q3: ship scheduling automation v2, including availability matching, conflict detection, and configurable compliance scheduling rules. Phase 3 — Q4 and beyond: launch an AI scheduling pilot with three to five design-partner enterprise accounts using historical data to power predictive scheduling recommendations. Each phase has a defined go/no-go gate before the next begins.',
    },
    {
      heading: 'Risks and Mitigations',
      body: 'The primary risk is over-engineering for enterprise while eroding SMB experience. Mitigation: feature-flag architecture keeps enterprise-only features invisible to SMB accounts. The secondary risk is change fatigue — rapid release cycles have already surfaced in customer feedback. Mitigation: a Change Advisory Board gates major Calendar releases and requires CSM-led enablement for enterprise accounts before rollout. A third risk is competitive timing: if Workday ships AI scheduling before Phase 3, the timing advantage is lost. Mitigation: a Q1 data quality audit is a hard prerequisite — if Paylocity scheduling data cannot support ML within six months, redirect the budget to stability and compliance features where the advantage is already established.',
    },
  ],
  keyDecisions: [
    'Allocate a dedicated Calendar squad of 6 engineers for a minimum of 12 months',
    'Establish a Change Advisory Board before the next major Calendar release',
    'Authorize a 30-day scheduling data quality audit to gate the AI investment decision',
  ],
  callToAction: 'Approve the Q1 Calendar squad allocation and schedule the data quality audit with the data engineering team within the next two weeks. The audit result gates the AI investment — without it, the Phase 3 timeline is speculative.',
  validationCheckpoints: [
    'Q1: Calendar support ticket volume down 30% versus baseline',
    'Q2: Scheduling task completion rate improved 25% in enterprise cohort',
    'Q3: AI scheduling pilot launched with 3 design-partner accounts',
  ],
  readinessWarnings: [
    'If data quality audit reveals model-training gaps, defer AI timeline by 6 months',
    'If Q2 Calendar NPS drops despite investment, pause features and run stability sprint',
    'If enterprise win-rate analysis does not confirm Calendar as a deal factor, shift to selective investment posture',
  ],
}

// ─── Stage 4 Artifact Refinement ─────────────────────────────────────────────
// Revises an existing Stage 4 artifact based on user-supplied context.
// Returns the same schema as buildStage4ArtifactPrompt plus changeSummary.
// Budget: 4000 tokens.

export function buildStage4ArtifactRefinementPrompt({
  entity,
  currentVersionData,
  selectedStrategy,
  persona,
  refinementContext,
  versionNumber,
}) {
  const strat = selectedStrategy || {}
  const pers = persona || {}
  const sideLabel = pers.side === 'customer' ? 'buyer/user perspective' : 'vendor/operator perspective'

  const currentSections = (currentVersionData?.sections || [])
    .map(s => `  [${s.heading}]\n  ${s.body}`)
    .join('\n\n') || '  (none)'

  return `You are revising a one-page decision-basis artifact for ${entity?.name || 'the subject entity'}.

ARTIFACT BEING REVISED: Version ${versionNumber || 1}

PERSONA / AUDIENCE:
  Side: ${pers.side || 'provider'} (${sideLabel})
  Role: ${pers.role || 'not specified'}
  Tone emphasis: ${(pers.toneEmphasis || []).join(', ') || 'balanced'}

SOURCE STRATEGY: "${strat.strategyName}"
  Investment posture: ${strat.investmentPosture}
  Outcome served: ${strat.outcomeServed}
  Evidence supporting: ${strat.evidenceSupporting}
  Evidence against: ${strat.evidenceAgainst}
  Tradeoffs: ${strat.tradeoffs}

CURRENT ARTIFACT TITLE: ${currentVersionData?.artifactTitle || 'Not available'}

CURRENT SECTIONS:
${currentSections}

CURRENT CALL TO ACTION:
${currentVersionData?.callToAction || '(none)'}

USER-SUPPLIED REFINEMENT CONTEXT:
${refinementContext || '(none provided)'}

REVISION RULES:
- Incorporate the refinement context wherever it materially changes the reasoning or recommendations
- Do not invent metrics or evidence not present in the context or source strategy
- Preserve strong reasoning from the current version that the context does not contradict
- The changeSummary must be concise (≤60 words): explain what changed and why
- Maintain the same persona framing and tone as the current version

Return ONLY valid JSON, no markdown, no backticks:

{
  "artifactTitle": "≤10 words — update only if context changes the strategic framing",
  "subtitle": "≤15 words",
  "personaSummary": "≤20 words",
  "sections": [
    { "heading": "Section heading", "body": "80–140 words per section. Revise sections affected by the new context; preserve others. Minimum 4 sections." }
  ],
  "keyDecisions": ["≤15 words each — 2 to 3 items"],
  "callToAction": "≤40 words",
  "validationCheckpoints": ["≤15 words each — 2 to 3 items"],
  "readinessWarnings": ["≤20 words each — 1 to 3 items"],
  "changeSummary": "≤60 words explaining what changed and why"
}`
}

// ─── Mock data — Stage 4 Artifact Refined ────────────────────────────────────
// Represents a v2 refinement of MOCK_STAGE4_ARTIFACT incorporating a budget
// constraint (4-engineer squad cap) and CHRO's compliance scheduling concern.

export const MOCK_STAGE4_ARTIFACT_REFINED = {
  artifactTitle: 'Calendar Platform: Constrained Investment Case',
  subtitle: 'Double-down strategy revised for budget and compliance context — CPO',
  personaSummary: 'CPO reviewing revised roadmap under budget and renewal-risk constraints',
  sections: [
    {
      heading: 'Strategic Context',
      body: "Paylocity's Calendar module operates at the highest-frequency HCM touchpoint — scheduling decisions happen daily where payroll decisions happen monthly. A revised investment case must account for two material constraints surfaced since the initial brief: the Calendar squad is capped at 4 engineers rather than 6, and the CHRO has flagged compliance scheduling for the top three union enterprise accounts as the primary renewal risk this quarter. These constraints sharpen the investment thesis by forcing prioritization — stability and compliance take precedence over new feature breadth.",
    },
    {
      heading: 'Evidence Basis',
      body: "The core evidence remains intact: 65% enterprise adoption, scheduling as the highest-frequency HCM touchpoint, and win-loss signals confirming Calendar as a deal factor in competitive situations. The new context adds a sharper signal: the CHRO's identification of union scheduling compliance as a retention lever is supported by the prior finding that compliance-sensitive accounts show 40% lower churn. This correlation now has a direct operational counterpart — three named accounts at renewal risk where compliance scheduling is the stated concern. The evidence basis is narrower but more actionable.",
    },
    {
      heading: 'Revised Investment Rationale',
      body: "A double-down posture remains justified, but the execution must operate within a 4-engineer constraint. This changes the investment from broad platform acceleration to a focused two-track execution: first, stabilize the Calendar experience to reduce support volume; second, prioritize compliance scheduling features that directly address the CHRO's retention concern for at-risk union accounts. This sequencing converts a broad platform bet into a targeted retention and differentiation investment with a measurable near-term outcome — preserving the three accounts at renewal risk while building the compliance moat that competitors cannot easily replicate.",
    },
    {
      heading: 'Revised Execution Approach',
      body: 'Phase 1 — Q1 (stabilization, 4 engineers): focus entirely on reducing Calendar support ticket volume and completing compliance scheduling rule configuration for the three at-risk union accounts. No new features. Deliver a compliance scheduling runbook to CSM team by end of Q1. Phase 2 — Q2 (availability matching and conflict detection with 4-engineer capacity): scope is reduced from the original plan but maintains the core scheduling automation milestone. Phase 3 — Q4 (AI scheduling pilot): conditional on the Q1 data quality audit confirming readiness; if not confirmed, redirect Phase 3 capacity to additional compliance accounts. All phases require CPO approval to advance.',
    },
    {
      heading: 'Risks and Mitigations',
      body: "The 4-engineer constraint introduces a sequencing risk: slower feature delivery creates a window for Workday to close the gap if they ship AI scheduling before Paylocity's Phase 3. Mitigation: the compliance scheduling moat is not replicable quickly — invest there first. Stakeholder alignment is a second risk. The CHRO's direct involvement in flagging compliance concerns means CS and Product must align on communication before any public roadmap updates. Mitigation: schedule a pre-announcement briefing with the CHRO and the three at-risk account teams before the Q1 stabilization sprint begins. Change fatigue risk from prior rapid releases remains — the Change Advisory Board gate is essential.",
    },
  ],
  keyDecisions: [
    'Confirm 4-engineer Calendar squad allocation for 12 months minimum',
    'Prioritize compliance scheduling for three named at-risk union accounts in Q1',
    'Schedule CHRO pre-briefing before Q1 sprint kickoff',
  ],
  callToAction: 'Approve the revised 4-engineer Calendar squad allocation, schedule the CHRO pre-briefing within one week, and assign the compliance scheduling runbook task to the CSM lead before the Q1 sprint begins.',
  validationCheckpoints: [
    'Q1: Compliance scheduling configured for all 3 at-risk accounts before renewal dates',
    'Q1: Calendar support ticket volume down 30% versus baseline',
    'Q2: Scheduling task completion rate improved 20% in enterprise cohort under 4-engineer constraint',
  ],
  readinessWarnings: [
    'If 4-engineer constraint cannot be maintained for 12 months, re-scope Phase 2 before committing',
    'If CHRO identifies additional at-risk accounts before Q1, escalate squad allocation request',
    'If data quality audit reveals AI model-training gaps, redirect Phase 3 budget to compliance coverage',
  ],
  changeSummary: 'Revised to incorporate a 4-engineer squad constraint and the CHRO\'s compliance scheduling concern for three at-risk union accounts. Updated execution approach, risks, and call to action to reflect these constraints. The strategic posture remains double-down but is now sequenced around retention-critical compliance work first.',
}

// ─── Stage 2 — item-level refine / challenge prompts ─────────────────────────
//
// Used by handleS2Generate in SessionFlow for per-item Refine and Challenge
// actions across all eligible Stage 2 sections. Response shape is minimal and
// consistent: { proposedText, assessment, citations: [] }.

export function buildS2ItemRefinePrompt(sectionLabel, itemText, entity, userDirection) {
  const directionBlock = userDirection
    ? `\nUser refinement direction:\n${userDirection}\n\nFollow this direction unless it conflicts with evidence. If the direction asks for unsupported framing, explain the constraint in the assessment and produce the most defensible version.\n`
    : ''
  return `You are refining a Stage 2 intelligence analysis item for ${entity}.

Section: ${sectionLabel}
Item: "${itemText}"
${directionBlock}
Task: produce a sharper, more defensible, and more specific version of this item. Preserve the meaning. Improve precision and evidence-groundedness. Do not speculate beyond what the original asserts.

Respond with JSON only — no prose, no markdown wrapper:
{
  "proposedText": "...",
  "assessment": "One sentence explaining what was sharpened${userDirection ? ' and how the user direction shaped the revision' : ''}.",
  "citations": []
}`
}

export function buildS2ItemChallengePrompt(sectionLabel, itemText, entity, userDirection) {
  const directionBlock = userDirection
    ? `\nUser challenge direction:\n${userDirection}\n\nFocus the pressure-test on this angle. If the direction asks for analysis beyond the available evidence, note the constraint in the assessment.\n`
    : ''
  return `You are pressure-testing a Stage 2 analysis item for ${entity}.

Section: ${sectionLabel}
Item: "${itemText}"
${directionBlock}
Task: critically assess this item. If it holds up, reproduce it with any qualifications needed. If it requires revision, produce a more defensible version. If it is unsupported, flag it clearly.

Respond with JSON only — no prose, no markdown wrapper:
{
  "proposedText": "...",
  "assessment": "One sentence explaining the challenge outcome${userDirection ? ' and how the user direction shaped the analysis' : ''}.",
  "citations": []
}`
}

// Mock result — returned when no API key is configured, so controls remain exercisable.
export const MOCK_S2_ITEM_RESULT = {
  proposedText: 'Refined: this claim has been sharpened for precision and defensibility based on available evidence.',
  assessment:   'The original statement was directionally accurate. The revision adds specificity and removes hedging language.',
  citations:    [],
}
