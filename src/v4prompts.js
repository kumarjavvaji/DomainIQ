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

RETRIEVAL STRATEGY (use web_search, max 5 queries — target 3):
Execute 3 highly targeted searches. Stop searching once 3 or more meaningful evidence items have been retrieved. Prefer precision over coverage — unused search budget preserves output token headroom for the JSON.
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
- Include search narration, preamble, or any prose before or after the JSON output
- Summarize every retrieved source — include only the single most relevant snippet per item

CONSTRAINTS ON OUTPUT (hard limits — do not exceed):
- evidenceConsolidation: max 3 items; max 2 sources per item
- competitorMap: max 3
- emergingEntrants: 3–5 items
- adjacencyOpportunities: 3–5 items
- refinedAssertions: max 3
- contradictionMap: max 3
- unresolvedQuestions: 3–5 items
- stage3ReadinessSummary: max 3 items per array
- recommendedNextActions: 3–5 items
- Label/name/badge fields (name, type, refinementType, relationship, tensionType, resolution, confidenceChange): ≤5 words or enum values only.
- Summary/label string fields (segmentFit, capabilityGaps, strategicDivergence, implications, evidenceSummary, reason, resolutionNote, whatChanged, strongestEvidence, weakestAreas, dominantTensions, likelyDirection, area): ≤20 words. Concise phrases, no paragraphs.
- Analytical narrative fields (capability, strategicImplication, partnershipLogic, acquisitionLogic, buildVsBuy, risks): ≤60 words. Complete sentences allowed.
- unresolvedQuestions and recommendedNextActions: ≤60 words each. Must be actionable and specific.
- stage3ReadinessSummary items: ≤25 words each — max 3 per array. Explain the signal, do not just label it.
- Omit a section entirely (empty array) rather than padding with weak findings.

Return ONLY valid JSON. Output MUST begin with { and end with }. No preamble, no narration, no markdown, no backticks:
{
  "summary": {
    "whatChanged": "≤20 words: what Stage 2 materially changed vs Stage 1",
    "strongestEvidence": "≤20 words: strongest evidence found",
    "weakestAreas": "≤20 words: what still lacks grounding",
    "dominantTensions": "≤20 words: most important unresolved tension",
    "likelyDirection": "≤20 words: most defensible direction — label as inference"
  },
  "evidenceConsolidation": [
    {
      "nodeId": "<Stage 1 node id>",
      "nodeStatement": "<exact original assertion>",
      "evidenceSummary": "≤20 words: what was found and how it relates",
      "relationship": "supports|contradicts|qualifies|unresolved",
      "sources": [
        {
          "title": "page or article title",
          "url": "exact URL from search",
          "snippet": "verbatim excerpt — max 25 words",
          "relationship": "supports|contradicts|qualifies"
        }
      ]
    }
  ],
  "competitorMap": [
    {
      "name": "competitor name",
      "type": "mature|differentiated|adjacent",
      "segmentFit": "≤15 words",
      "capabilityGaps": "≤15 words",
      "strategicDivergence": "≤15 words",
      "implications": "≤15 words"
    }
  ],
  "emergingEntrants": [
    {
      "name": "entrant name",
      "relevantTo": "<Stage 1 node id or open_question>",
      "capability": "≤60 words: what this entrant actually does and why it matters here",
      "strategicImplication": "≤60 words: specific strategic consequence for the entity under analysis"
    }
  ],
  "adjacencyOpportunities": [
    {
      "area": "capability or workflow area",
      "partnershipLogic": "≤60 words: who the natural partner is, why the fit exists, and what it unlocks",
      "acquisitionLogic": "≤60 words: why acquisition makes strategic sense and what the target would add — or null if not applicable",
      "buildVsBuy": "≤60 words: concrete build-vs-buy-vs-partner recommendation with rationale",
      "connectedNodeIds": ["<Stage 1 node ids>"],
      "risks": "≤60 words: specific execution or market risks for this adjacency"
    }
  ],
  "refinedAssertions": [
    {
      "nodeId": "<Stage 1 node id>",
      "refinementType": "strengthened|narrowed|qualified|weakened|contradicted|unresolved",
      "originalStatement": "<exact original assertion text>",
      "revisedStatement": "≤30 words — more precise or better-grounded version",
      "reason": "≤15 words: what evidence drove this",
      "confidenceChange": "increased|decreased|unchanged"
    }
  ],
  "contradictionMap": [
    {
      "description": "≤20 words: what the tension is",
      "tensionType": "evidence_conflict|strategic_inconsistency|business_model_tension|pricing_conflict|capability_constraint|compliance_constraint",
      "nodeIds": ["<involved Stage 1 node ids>"],
      "resolution": "unresolved|partial|resolved",
      "resolutionNote": "≤15 words"
    }
  ],
  "unresolvedQuestions": [
    "≤60 words: specific strategically important question with enough context to be actionable — 3 to 5 items"
  ],
  "stage3ReadinessSummary": {
    "strongestThemes": ["≤25 words each — max 3: explain the signal, not just the label"],
    "unresolvedBlockers": ["≤25 words each — max 3: explain why it blocks and what resolving it would unlock"],
    "refinedTensions": ["≤25 words each — max 3: name the two forces in tension and the strategic consequence"],
    "highConfidenceFindings": ["≤25 words each — max 3: state what is now well-grounded and why it matters for Stage 3"],
    "capabilityGaps": ["≤25 words each — max 3: name the gap and why it is strategically load-bearing"],
    "strategicImplications": ["≤25 words each — max 3: one clear implication for Stage 3 framing or focus"]
  },
  "recommendedNextActions": [
    "≤60 words: specific action with rationale — what to do, why it matters, and what it would resolve — 3 to 5 items"
  ]
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
