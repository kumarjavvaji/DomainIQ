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
    { "title": "pattern name", "insight": "one sentence", "confidence": "medium" }
  ]
}`
}

// ─── Scoped Regeneration ─────────────────────────────────────────────────────
// Minimal context: only the challenged node, its direct deps, its direct downstream,
// the research intent, the effective policy, and a summary of accepted claims.
// Never receives the full node list or full stage result.

export function buildScopedRegenPrompt({
  challengedNode,
  directDeps,
  directDownstream,
  intent,
  policy,
  policyOverride,
  acceptedSummary,
}) {
  const effectivePolicy = policyOverride ? { ...policy, ...policyOverride } : policy
  const policyBlock = renderPolicy(effectivePolicy)
  const wordBudget = Math.round(effectivePolicy.maxOutputWords * 0.4)

  const depsBlock = directDeps.length > 0
    ? directDeps.map(n => `  [${n.id}] ${n.type}: ${n.statement}`).join('\n')
    : '  None'

  const downstreamBlock = directDownstream.length > 0
    ? directDownstream.map(n => `  [${n.id}] ${n.type}: ${n.statement}`).join('\n')
    : '  None'

  return `You are revising a single analysis node based on a user challenge.
Revise only what is necessary. Preserve epistemic precision. Do not introduce new concepts beyond what the challenge requires.

CHALLENGED NODE:
  ID: ${challengedNode.id}
  Type: ${challengedNode.type}
  Original statement: "${challengedNode.statement}"
  Confidence: ${challengedNode.confidence}
  User preset: "${challengedNode.userPreset || 'none'}"
  User note: "${challengedNode.userNote || 'none'}"

DIRECT DEPENDENCIES (context only — do not revise these):
${depsBlock}

DOWNSTREAM NODES THAT MAY NEED UPDATING:
${downstreamBlock}

RESEARCH INTENT (anchor all reasoning here):
  ${intent.what} — ${intent.why} (role: ${intent.role})

ACCEPTED CLAIMS (do not contradict these):
  ${acceptedSummary}

${policyBlock}
Word budget for this response: ~${wordBudget} words.

Task:
1. Revise the challenged node to address the user's concern.
2. For each downstream node: update it if the revision makes it inconsistent; otherwise include its ID in preservedDownstreamIds.
3. Include a one-sentence changeReason for every node you modify.

Return ONLY valid JSON:
{
  "revisedNode": {
    "id": "${challengedNode.id}",
    "type": "...",
    "statement": "...",
    "confidence": "high|medium|low",
    "evidence_type": "verified_fact|user_provided|inferred_strategy|hypothesis",
    "dependsOn": [...],
    "changeReason": "one sentence: what changed and why"
  },
  "updatedDownstream": [
    {
      "id": "...",
      "type": "...",
      "statement": "...",
      "confidence": "...",
      "evidence_type": "...",
      "dependsOn": [...],
      "changeReason": "one sentence"
    }
  ],
  "preservedDownstreamIds": ["id of downstream node that needs no change"]
}`
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
      title: 'Consulting-first entry in analytics-light segments',
      insight: 'In markets where incumbents lack data maturity, analytics vendors that lead with consulting relationships before platform adoption achieve significantly higher retention than pure SaaS plays.',
      confidence: 'medium',
    },
  ],
}

// Mock scoped regen result — simulates challenging n3 (the revenue model assumption).
// n3 is revised to be more epistemically honest.
// n9 (which depends on n3) is updated to remove the specific SaaS expansion claim.
export const MOCK_SCOPED_REGEN_RESULT = {
  revisedNode: {
    id: 'n3',
    type: 'assumption',
    statement: 'Finlytica\'s revenue model is unconfirmed from public sources. It may be services-led with a recurring analytics component, but the relative weight of subscription vs. professional services fees is unknown.',
    confidence: 'low',
    evidence_type: 'hypothesis',
    dependsOn: ['n2'],
    changeReason: 'Revised to be more epistemically honest. Removed the specific claim about professional services as an entry motion — that detail was speculative and not supported by available evidence.',
  },
  updatedDownstream: [
    {
      id: 'n9',
      type: 'hypothesis',
      statement: 'If Finlytica demonstrates consistent value in community banking, it may expand upmarket to regional banks — but the expansion mechanism depends on the actual commercial model, which is currently unconfirmed.',
      confidence: 'low',
      evidence_type: 'hypothesis',
      dependsOn: ['n2', 'n3'],
      changeReason: 'Updated to remove the reference to a SaaS playbook, which was dependent on the now-revised revenue model assumption in n3.',
    },
  ],
  preservedDownstreamIds: [],
}
