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

// ─── Stage 2 — Research Expansion & Evidence Consolidation ───────────────────

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

  return `You are a rigorous strategic analyst conducting Stage 2 research expansion and evidence consolidation.

This is NOT a new analysis. Stage 1 has already established orientation assertions for "${entity.name}". Your job is to DEEPEN and GROUND the existing investigation — not restart it.

ENTITY: "${entity.name}" (${entity.type})
ANALYST ROLE: ${intent.role}
RESEARCH INTENT: ${intent.what}${intent.why ? ' — ' + intent.why : ''}

STAGE 1 SUMMARY:
${stage1Summary}

ACCEPTED ASSERTIONS (preserve unless evidence materially changes them):
${acceptedBlock}

REVISED ASSERTIONS (already pressure-tested):
${refinedBlock}

UNRESOLVED ASSERTIONS (require evidence grounding):
${unresolvedBlock}

OPEN QUESTIONS (from Stage 1):
${questionsBlock}

INFERRED ANALYTICAL PATTERNS:
${patternsBlock}

${policyBlock}

STAGE 2 MISSION:
Answer: "What current evidence, competitor behavior, emerging entrants, adjacent capabilities, and market signals strengthen, weaken, qualify, or materially reshape the Stage 1 assertions?"

RETRIEVAL STRATEGY (use web_search, max 5 queries total):
Prioritize searches toward:
1. Load-bearing assertions with low confidence or unresolved status
2. Open questions from Stage 1
3. Competitor behavior directly relevant to key assertions
4. Adjacent capabilities or market movements affecting strategic direction
5. Evidence that resolves or sharpens strategic tensions

Do NOT:
- Search for generic market trends or broad landscape reports
- Fabricate competitors, sources, or acquisition logic
- Cite sources not retrieved in this session
- Overstate certainty from limited or ambiguous results
- Produce comprehensive market surveys

CONSTRAINTS ON OUTPUT:
- evidenceConsolidation: max 5 items — load-bearing assertions only
- competitorMap: max 4 — strategically contextual, not exhaustive
- emergingEntrants: max 3 — only when tied to assertions, gaps, or strategic tensions
- adjacencyOpportunities: max 3 — tied to assertions, not speculative
- refinedAssertions: max 4 — only where evidence materially changes interpretation
- contradictionMap: max 4 — preserve genuine tensions; do not force resolution
- unresolvedQuestions: max 5 — most strategically important only

Return ONLY valid JSON, no markdown, no backticks:
{
  "summary": {
    "whatChanged": "1-2 sentences: what Stage 2 materially changed vs Stage 1",
    "strongestEvidence": "1-2 sentences: strongest evidence found",
    "weakestAreas": "1-2 sentences: what still lacks grounding",
    "dominantTensions": "1-2 sentences: most important unresolved strategic tension",
    "likelyDirection": "1-2 sentences: most defensible strategic direction — clearly labeled as inference"
  },
  "evidenceConsolidation": [
    {
      "nodeId": "<Stage 1 node id>",
      "nodeStatement": "<exact original assertion>",
      "evidenceSummary": "what was found and how it relates to this assertion",
      "relationship": "supports|contradicts|qualifies|unresolved",
      "sources": [
        {
          "title": "page or article title",
          "url": "exact URL from search",
          "snippet": "verbatim excerpt — max 60 words",
          "relationship": "supports|contradicts|qualifies"
        }
      ]
    }
  ],
  "competitorMap": [
    {
      "name": "competitor name",
      "type": "mature|differentiated|adjacent",
      "segmentFit": "how well they fit the same customer segment vs the entity",
      "capabilityGaps": "what they have that entity lacks, or vice versa",
      "strategicDivergence": "where strategy diverges — pricing, workflow, AI, model",
      "implications": "what this means for entity — threat, opportunity, or constraint"
    }
  ],
  "emergingEntrants": [
    {
      "name": "entrant name",
      "relevantTo": "<Stage 1 node id or open_question>",
      "capability": "what capability or workflow shift they represent",
      "strategicImplication": "why this matters for the entity"
    }
  ],
  "adjacencyOpportunities": [
    {
      "area": "capability or workflow area",
      "partnershipLogic": "why partnership makes sense",
      "acquisitionLogic": "why acquisition might make sense, or null if not applicable",
      "buildVsBuy": "build vs buy vs partner analysis",
      "connectedNodeIds": ["<Stage 1 node ids this relates to>"],
      "risks": "key risks or constraints"
    }
  ],
  "refinedAssertions": [
    {
      "nodeId": "<Stage 1 node id>",
      "refinementType": "strengthened|narrowed|qualified|weakened|contradicted|unresolved",
      "originalStatement": "<exact original assertion text>",
      "revisedStatement": "more precise or better-grounded version",
      "reason": "what evidence drove this refinement",
      "confidenceChange": "increased|decreased|unchanged"
    }
  ],
  "contradictionMap": [
    {
      "description": "what the tension is",
      "tensionType": "evidence_conflict|strategic_inconsistency|business_model_tension|pricing_conflict|capability_constraint|compliance_constraint",
      "nodeIds": ["<involved Stage 1 node ids>"],
      "resolution": "unresolved|partial|resolved",
      "resolutionNote": "why it is or is not resolved — preserve genuine uncertainty"
    }
  ],
  "unresolvedQuestions": [
    "specific strategically important question that remains unanswered after Stage 2"
  ],
  "stage3ReadinessSummary": {
    "strongestThemes": ["theme 1", "theme 2"],
    "unresolvedBlockers": ["what prevents clean Stage 3 synthesis"],
    "refinedTensions": ["key tensions to carry into Stage 3"],
    "highConfidenceFindings": ["findings with strong evidence grounding"],
    "capabilityGaps": ["gaps that affect strategic direction"],
    "strategicImplications": ["implications worth synthesizing in Stage 3"]
  },
  "recommendedNextActions": [
    "specific research action, assertion to revisit, or area to expand"
  ]
}`
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
