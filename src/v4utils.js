// DomainIQ v4 — pure utility functions for diff, dependency resolution, and context summarization
// No React, no side effects.

// ── Chunked assessment ────────────────────────────────────────────────────────

export const DEFAULT_ASSESSMENT_CHUNKS = [
  'decision_summary',
  'challenge_assessment',
  'revised_node',
  'evidence_summary',
  'evidence_items',
  'confidence_and_quality_delta',
]

function defaultQualityDelta() {
  return {
    improvedPrecision: false, reducedOvergeneralization: false,
    improvedSegmentation: false, improvedOperationalPlausibility: false,
    reducedConfidenceAppropriately: false, preservedStrongOriginalReasoning: false,
    surfacedEvidenceGap: false, improvedDecisionUsefulness: false, notes: '',
  }
}

/**
 * mergeAssessmentChunks — assembles a full PressureTestResult from independently-parsed
 * chunk objects.  Handles evidence_items subchunks (names matching evidence_items_*)
 * by collecting and flattening their items arrays.
 */
export function mergeAssessmentChunks(chunks, challengedNodeId) {
  const get = (name) => chunks.find(c => c.chunkName === name)?.payload

  const decisionPayload  = get('decision_summary') || {}
  const challengePayload = get('challenge_assessment') || {}
  const revisedPayload   = get('revised_node') || null
  const evidSumPayload   = get('evidence_summary') || {}
  const evidItemsPayload = get('evidence_items') || {}
  const confidPayload    = get('confidence_and_quality_delta') || {}

  // Collect evidence from named subchunks (evidence_items_001_010, etc.)
  const subchunkItems = chunks
    .filter(c => c.chunkName.startsWith('evidence_items_'))
    .flatMap(c => c.payload?.items || [])

  const retrievedEvidence = subchunkItems.length > 0
    ? subchunkItems
    : (evidItemsPayload.items || [])

  return {
    challengedNodeId,
    decision:               decisionPayload.decision               || 'mark_unresolved',
    challengeAssessment:    challengePayload.challengeAssessment   || '',
    evidenceSummary:        challengePayload.evidenceSummary       || evidSumPayload.text || '',
    evidenceNeeded:         decisionPayload.evidenceNeeded         || '',
    confidenceChangeReason: confidPayload.confidenceChangeReason  || evidSumPayload.confidenceChangeReason || '',
    qualityDelta:           confidPayload.qualityDelta             || defaultQualityDelta(),
    retrievedEvidence,
    inlineCitations:        [],
    suggestedResearchQueries: decisionPayload.suggestedResearchQueries || [],
    revisedNode:            revisedPayload                         || null,
    updatedDownstream:      revisedPayload?.updatedDownstream      || [],
    preservedDownstreamIds: revisedPayload?.preservedDownstreamIds || [],
  }
}

// ── Stage 2 response classifier ───────────────────────────────────────────────
//
// Returns: 'valid' | 'pressure_test_fallback' | 'malformed'
//
// 'valid'                 — response has Stage 2 keys; safe to write as canonical stage2
// 'pressure_test_fallback'— response has pressure-test / retrieval-failed shape; must NOT
//                           overwrite canonical stage2; save to rawResponses instead
// 'malformed'             — unparseable, null, or missing all Stage 2 keys; save raw + error
//
const STAGE2_REQUIRED_KEYS = [
  'strategicThemes', 'readinessAssessment', 'opportunityModels', 'nextActions',
]

export function classifyStage2Response(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'malformed'

  // Pressure-test / retrieval-failed shape: decision + challengedNodeId at top level,
  // or explicit retrieval_failed decision without Stage 2 keys.
  if ('decision' in data && 'challengedNodeId' in data) return 'pressure_test_fallback'
  if (data.decision === 'retrieval_failed')              return 'pressure_test_fallback'

  // Valid Stage 2: must have at least one of the expected top-level section keys
  const hasStage2Key = STAGE2_REQUIRED_KEYS.some(k => k in data)
  if (!hasStage2Key) return 'malformed'

  return 'valid'
}

// Returns nodes that node.dependsOn points to.
export function getDirectDeps(node, allNodes) {
  const deps = node.dependsOn || []
  return allNodes.filter(n => deps.includes(n.id))
}

// Returns nodes that declare a dependency on the given node's id.
export function getDirectDownstream(node, allNodes) {
  return allNodes.filter(n => (n.dependsOn || []).includes(node.id))
}

// Builds a short plain-text summary of accepted nodes for injection into scoped regen prompts.
// Keeps token cost low — never passes raw node objects.
export function buildAcceptedSummary(nodes) {
  const accepted = nodes.filter(n => n.userStatus === 'accepted')
  if (accepted.length === 0) return 'No claims accepted yet.'
  const items = accepted.slice(0, 5).map(n => `"${n.statement}"`)
  const overflow = accepted.length > 5 ? ` (+${accepted.length - 5} more)` : ''
  return `${accepted.length} accepted: ${items.join('; ')}${overflow}`
}

// Computes a node-level diff from a PressureTestResult.
// Branches on ptResult.decision — different decisions produce different diff shapes.
//
// decision: revise_claim    → modifiedNodes contains revisedNode + updatedDownstream
// decision: preserve_original → modifiedNodes is empty; the challenged node shows in preservedNodes
// decision: mark_unresolved  → modifiedNodes is empty; challengedNodeId flagged for review
// decision: retrieval_failed → everything preserved; no statement changes
export function computeDiff(originalNodes, ptResult) {
  const {
    decision,
    revisedNode,
    updatedDownstream = [],
    preservedDownstreamIds = [],
    challengedNodeId,
  } = ptResult

  const modifiedNodes = []
  const preservedNodes = []

  if (decision === 'revise_claim' && revisedNode) {
    const changedById = {}
    changedById[revisedNode.id] = revisedNode
    for (const n of updatedDownstream) {
      changedById[n.id] = n
    }

    for (const orig of originalNodes) {
      const update = changedById[orig.id]
      if (update) {
        modifiedNodes.push({
          before: orig,
          after:  { ...orig, ...update },
          reason: update.changeReason || '',
        })
      } else {
        preservedNodes.push(orig)
      }
    }
  } else {
    // preserve_original, mark_unresolved, retrieval_failed,
    // assessment_truncated, assessment_parse_failed — no statement changes
    for (const orig of originalNodes) {
      preservedNodes.push(orig)
    }
  }

  const confidenceChanges = modifiedNodes
    .filter(({ before, after }) => before.confidence !== after.confidence)
    .map(({ before, after }) => ({
      nodeId: after.id,
      before: before.confidence,
      after:  after.confidence,
    }))

  return {
    decision,
    challengedNodeId,
    preservedNodes,
    modifiedNodes,
    removedNodes:      [],
    addedNodes:        [],
    confidenceChanges,
  }
}

// Applies an accepted PressureTestResult to the node array.
//
// revise_claim:      revised node → previousStatement set, userStatus 'pending', challenge note cleared
// preserve_original: challenged node → userStatus 'accepted', challengeAssessment attached as rationale, challenge note preserved
// mark_unresolved:   challenged node → userStatus 'needs_review', challengeAssessment injected as userNote, statement unchanged
// retrieval_failed:  no node state changes
export function applyDiff(originalNodes, ptResult) {
  const {
    decision,
    revisedNode,
    updatedDownstream = [],
    challengedNodeId,
    challengeAssessment,
  } = ptResult

  if (decision === 'retrieval_failed') {
    // Nothing changes — user was shown the failure and clicked Discard or retry
    return originalNodes
  }

  if (decision === 'preserve_original') {
    return originalNodes.map(n => {
      if (n.id !== challengedNodeId) return n
      return {
        ...n,
        userStatus:          'accepted',
        challengeAssessment: challengeAssessment || null,
        // preserve userNote and userPreset — the challenge history is kept
        lastUpdated:         Date.now(),
      }
    })
  }

  if (decision === 'mark_unresolved') {
    return originalNodes.map(n => {
      if (n.id !== challengedNodeId) return n
      return {
        ...n,
        userStatus:          'needs_review',
        userNote:            challengeAssessment || n.userNote,
        challengeAssessment: challengeAssessment || null,
        // statement unchanged
        lastUpdated:         Date.now(),
      }
    })
  }

  if (decision === 'revise_claim' && revisedNode) {
    const changedById = {}
    changedById[revisedNode.id] = revisedNode
    for (const n of updatedDownstream) {
      changedById[n.id] = n
    }

    return originalNodes.map(n => {
      const update = changedById[n.id]
      if (!update) return n
      return {
        ...n,
        ...update,
        previousStatement: n.statement,
        changeReason:      update.changeReason || null,
        userStatus:        'pending',
        userNote:          null,
        userPreset:        null,
        lastUpdated:       Date.now(),
      }
    })
  }

  return originalNodes
}

// Builds the compact context packet injected into Stage 2 prompt.
// Prioritizes by analytical signal: high-confidence nodes first, metadata stripped,
// counts capped so low-value context does not crowd out output token headroom.
export function buildStage2ContextPacket(session) {
  const nodes = session.stage1?.nodes || []
  const confidenceRank = { high: 0, medium: 1, low: 2 }
  const byConfidence = (a, b) => (confidenceRank[a.confidence] ?? 3) - (confidenceRank[b.confidence] ?? 3)

  // Strip to analytical-signal fields only — Stage 2 does not need status metadata
  const slim = n => ({ id: n.id, type: n.type, statement: n.statement, confidence: n.confidence })

  const accepted = nodes
    .filter(n => n.userStatus === 'accepted')
    .sort(byConfidence)
    .slice(0, 6)
    .map(slim)

  const refined = nodes
    .filter(n => n.previousStatement)
    .sort(byConfidence)
    .slice(0, 4)
    .map(n => ({ ...slim(n), previousStatement: n.previousStatement }))

  const unresolved = nodes
    .filter(n => n.userStatus === 'needs_review')
    .slice(0, 3)
    .map(n => ({ ...slim(n), userNote: n.userNote }))

  const patterns = [...(session.stage1?.inferredPatterns || [])]
    .sort(byConfidence)
    .slice(0, 2)

  return {
    entity:           session.entity,
    intent:           session.intent,
    stage1Summary:    session.stage1?.summary || '',
    acceptedNodes:    accepted,
    refinedNodes:     refined,
    unresolvedNodes:  unresolved,
    openQuestions:    (session.stage1?.openQuestions || []).slice(0, 3),
    inferredPatterns: patterns,
  }
}

// Returns a compact policy description string for display in UI badges.
export function policyLabel(policy) {
  return `${policy.tokenBudget} token · ${policy.skepticismLevel} skepticism · ${policy.maxOutputWords}w`
}

// Deterministic hash of Stage 1 basis — used to detect when Stage 2 has gone stale.
// Covers the fields that materially affect Stage 2 output: id, statement, userStatus, confidence.
// Output is an unsigned 32-bit decimal string; collision risk negligible at realistic node counts.
export function computeStage1BasisHash(stage1) {
  const nodes = (stage1?.nodes || [])
    .map(n => `${n.id}:${n.statement}:${n.userStatus}:${n.confidence}`)
    .sort()
    .join('|')
  let h = 0
  for (let i = 0; i < nodes.length; i++) {
    h = Math.imul(31, h) + nodes.charCodeAt(i) | 0
  }
  return String(h >>> 0)
}

// ── Stage 3 context hash ──────────────────────────────────────────────────────
//
// computeStage3ContextHash — detects when Stage 1 or Stage 2 inputs have changed
// since Stage 3 was generated.
//
// Uses buildStage3ContextPacket as the canonical source of truth — the same packet
// that feeds the Stage 3 prompt — so the hash represents the full analytical basis.
// No fields are excluded beyond what the context packet itself already filters
// (volatile node metadata, raw search blocks, etc.).
//
// Normalization: objects are key-sorted recursively before JSON serialization so
// the hash is stable regardless of runtime insertion order. Array order is preserved
// because it is semantic in the context packet (confidence-sorted, capped slices).
//
// Output: unsigned 32-bit decimal string. Same Djb2 algorithm as computeStage1BasisHash.

function normalizeForHash(value) {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.map(normalizeForHash)
  if (typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => {
      acc[k] = normalizeForHash(value[k])
      return acc
    }, {})
  }
  return value
}

export function computeStage3ContextHash(session) {
  const packet = buildStage3ContextPacket(session)
  const str    = JSON.stringify(normalizeForHash(packet))
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0
  }
  return String(h >>> 0)
}

// ── Stage 2 pivot system ──────────────────────────────────────────────────────
//
// computePivotRecommendations — deterministic scoring from orientation pass data.
// No AI call. Runs client-side from existing stage2 + stage1 node composition.
//
// Returns up to 3 recommended pivot types, sorted by score descending.
// priority labels: score ≥ 3 → 'high' | ≥ 2 → 'medium' | ≥ 1 → 'low'

export function computePivotRecommendations(session) {
  const nodes  = session.stage1?.nodes || []
  const stage2 = session.stage2 || {}
  // Support both old schema (contradictionMap) and new schema (contradictionAnalysis)
  const cm     = stage2.contradictionAnalysis   || stage2.contradictionMap       || []
  const scen   = stage2.scenarioModels          || []
  const gaps   = stage2.capabilityGaps          || []
  const opp    = stage2.opportunityModels       || stage2.adjacencyOpportunities  || []
  const risks  = stage2.riskModels              || []

  const scores = {
    contextual_competition: (
      (scen.length > 0                                                          ? 2 : 0) +
      (cm.some(c => c.tensionType === 'strategic_inconsistency' ||
                    c.description?.toLowerCase().includes('competi'))           ? 1 : 0) +
      (nodes.filter(n => n.type === 'opportunity').length >= 2                  ? 1 : 0)
    ),
    operational_constraints: (
      (nodes.some(n => n.type === 'constraint' || n.type === 'risk')            ? 2 : 0) +
      (risks.length > 0                                                         ? 2 : 0) +
      (opp.some(a => a.risks || a.complexity === 'high')                        ? 1 : 0)
    ),
    adoption_dynamics: (
      (nodes.filter(n => n.type === 'assumption').length >= 2                   ? 1 : 0) +
      (cm.some(c => c.tensionType === 'business_model_tension' ||
                    c.description?.toLowerCase().includes('adoption'))          ? 2 : 0) +
      (scen.some(s => s.title?.toLowerCase().includes('adoption') ||
                      s.drivers?.some(d => /adopt|chang|resist/i.test(d)))     ? 1 : 0)
    ),
    business_model_pressures: (
      (cm.some(c => ['pricing_conflict', 'business_model_tension']
                     .includes(c.tensionType))                                  ? 2 : 0) +
      (nodes.some(n => /revenue|pric|subscri|fee|model/i.test(n.statement))    ? 1 : 0)
    ),
    emerging_disruption: (
      (scen.some(s => s.title?.toLowerCase().includes('disrupt') ||
                      s.drivers?.some(d => /technolog|disrupt|emerg/i.test(d))) ? 2 : 0) +
      (gaps.length >= 2                                                          ? 1 : 0)
    ),
    adjacent_capabilities: (
      (opp.length > 0                                                            ? 2 : 0)
    ),
  }

  const priorityLabel = s => s >= 3 ? 'high' : s >= 2 ? 'medium' : 'low'

  return Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type, score]) => ({ type, score, priority: priorityLabel(score) }))
}

// Builds the context packet injected into the Stage 3 prompt.
// Draws from Stage 1 accepted/refined nodes + patterns, Stage 2 summary and
// evidence sections, and any accepted/refined pivot proposals.
// Caps applied per section to keep prompt tokens bounded.
export function buildStage3ContextPacket(session) {
  const nodes  = session.stage1?.nodes || []
  const stage2 = session.stage2 || {}

  const confidenceRank = { high: 0, medium: 1, low: 2 }
  const byConfidence   = (a, b) => (confidenceRank[a.confidence] ?? 3) - (confidenceRank[b.confidence] ?? 3)
  const slim           = n => ({ id: n.id, type: n.type, statement: n.statement, confidence: n.confidence })

  const acceptedNodes = nodes
    .filter(n => n.userStatus === 'accepted')
    .sort(byConfidence)
    .slice(0, 8)
    .map(slim)

  const refinedNodes = nodes
    .filter(n => n.previousStatement)
    .sort(byConfidence)
    .slice(0, 4)
    .map(n => ({ ...slim(n), previousStatement: n.previousStatement }))

  // Accepted/refined pivot proposals — text is the user-refined version when status=refined
  const acceptedPivotProposals = (stage2.pivots || [])
    .flatMap(p => (p.proposedUpdates || []).filter(u => ['accepted', 'refined'].includes(u.status)))
    .slice(0, 5)
    .map(u => ({
      title:           u.title,
      text:            u.status === 'refined' ? (u.userRefinedText || u.proposedText) : u.proposedText,
      rationale:       u.rationale,
      stage3Relevance: u.stage3Relevance,
    }))

  // Stage 2 user-accepted refinements — NOT reflected in Stage 1 nodes (lineage preserved).
  // Stage 3 treats these as high-trust downstream refinements: revised statement supersedes
  // the original for synthesis; original is included for lineage only.
  // New schema (v2) has no refinedAssertions — graceful fallback to empty array.
  const acceptedRefinements = (stage2.refinedAssertions || [])
    .filter(r => r.userStatus === 'accepted' || r.userStatus === 'refined')
    .map(r => ({
      nodeId:            r.nodeId            || '',
      originalStatement: r.originalStatement || '',
      revisedStatement:  r.revisedStatement  || '',
      refinementType:    r.refinementType    || '',
      confidenceChange:  r.confidenceChange  || 'unchanged',
      reason:            r.reason            || '',
    }))

  // Resolve fields from new schema (v2) with fallback to old schema (v1) for existing sessions
  const contradictions = (stage2.contradictionAnalysis || stage2.contradictionMap || []).slice(0, 4)
  const adjacencies    = (stage2.opportunityModels     || stage2.adjacencyOpportunities || []).slice(0, 3)
  const openQs         = [
    ...(session.stage1?.openQuestions || []),
    ...(stage2.unresolvedQuestions    || []),
    ...(stage2.capabilityGaps || []).map(g => g.gap || '').filter(Boolean),
  ].slice(0, 5)

  // stage2Summary: prefer readinessAssessment.recommendation for new schema, fall back to summary.whatChanged
  const stage2Summary = stage2.readinessAssessment?.recommendation
    || stage2.summary?.whatChanged
    || stage2.summary
    || null

  // stage3ReadinessSummary: new schema stores this as readinessAssessment; old schema has the full object
  const stage3ReadinessSummary = stage2.readinessAssessment || stage2.stage3ReadinessSummary || null

  return {
    entity:                 session.entity,
    intent:                 session.intent,
    stage1Summary:          session.stage1?.summary || '',
    inferredPatterns:       (session.stage1?.inferredPatterns || []).slice(0, 3),
    acceptedNodes,
    refinedNodes,
    stage2Summary,
    evidenceItems:          (stage2.evidenceConsolidation || []).slice(0, 5),
    competitors:            (stage2.competitorMap         || []).slice(0, 3),
    entrants:               (stage2.emergingEntrants       || []).slice(0, 3),
    contradictions,
    adjacencies,
    openQuestions:          openQs,
    stage3ReadinessSummary,
    acceptedPivotProposals,
    acceptedRefinements,
    // New v2 fields passed through for downstream stages that learn to use them
    strategicThemes:        (stage2.strategicThemes        || []).slice(0, 5),
    decisionFrameworks:     (stage2.decisionFrameworks     || []).slice(0, 4),
    riskModels:             (stage2.riskModels             || []).slice(0, 4),
    opportunityModels:      (stage2.opportunityModels      || []).slice(0, 5),
  }
}

// recommendTargetNodes — infers which Stage 1 node IDs are most contextually
// relevant for the given pivot type.  Returns node IDs (max 3, deduplicated).
// Pre-populates the TargetNodeSelector; user can edit before executing.

// ── Stage 2 Rerun Comparison ──────────────────────────────────────────────────
//
// buildStage2Comparison — produces a list of impacted artifact objects,
// one per Stage 2 section whose content has changed between the current
// session.stage2 and a freshly generated candidate.
//
// refinedAssertions are compared content-only (userStatus stripped) so that
// prior accept/reject decisions do not produce false positives.
// _rawSearchBlocks, id, generatedAt, pivots, and other metadata are excluded.

function normalizeRefinedAssertions(assertions) {
  if (!Array.isArray(assertions)) return assertions
  return assertions.map(r => {
    const { userStatus, ...rest } = r // eslint-disable-line no-unused-vars
    return rest
  })
}

function s2ImpactSummary(key, current, proposed, artifactType) {
  if (artifactType === 'array') {
    const oldLen = (current  || []).length
    const newLen = (proposed || []).length
    const delta  = newLen - oldLen
    if (delta > 0) return `${newLen} items (+${delta} vs current)`
    if (delta < 0) return `${newLen} items (${delta} vs current)`
    return `${newLen} items — content updated, count unchanged`
  }
  return ({
    readinessAssessment: 'Readiness assessment updated based on new Stage 1 basis',
  })[key] || 'Content updated based on new Stage 1 basis'
}

export function buildStage2Comparison(currentStage2, candidateStage2) {
  const sections = [
    { key: 'strategicThemes',          label: 'Strategic Themes',           artifactType: 'array'  },
    { key: 'decisionFrameworks',       label: 'Decision Frameworks',        artifactType: 'array'  },
    { key: 'scenarioModels',           label: 'Scenario Models',            artifactType: 'array'  },
    { key: 'organizationalImplications', label: 'Organizational Implications', artifactType: 'array' },
    { key: 'capabilityGaps',           label: 'Capability Gaps',            artifactType: 'array'  },
    { key: 'contradictionAnalysis',    label: 'Contradiction Analysis',     artifactType: 'array'  },
    { key: 'riskModels',               label: 'Risk Models',                artifactType: 'array'  },
    { key: 'opportunityModels',        label: 'Opportunity Models',         artifactType: 'array'  },
    { key: 'nextActions',              label: 'Next Actions',               artifactType: 'array'  },
    { key: 'readinessAssessment',      label: 'Readiness Assessment',       artifactType: 'object' },
  ]

  const artifacts = []
  let idx = 0

  for (const { key, label, artifactType } of sections) {
    const current  = currentStage2?.[key]  ?? null
    const proposed = candidateStage2?.[key] ?? null

    // For refinedAssertions: strip userStatus before comparing (content only)
    const cmpCurrent  = key === 'refinedAssertions' ? normalizeRefinedAssertions(current)  : current
    const cmpProposed = key === 'refinedAssertions' ? normalizeRefinedAssertions(proposed)  : proposed

    if (JSON.stringify(cmpCurrent) === JSON.stringify(cmpProposed)) continue

    artifacts.push({
      id:                `cmp_${idx++}_${key}`,
      section:           key,
      label,
      artifactType,
      currentValue:      current,
      proposedValue:     proposed,
      impactSummary:     s2ImpactSummary(key, current, proposed, artifactType),
      recommendedAction: 'approve',
      userStatus:        'pending',
      userNote:          null,
      refinedValue:      null,
    })
  }

  return artifacts
}

// ── Stage 1 Change Classification ─────────────────────────────────────────────
//
// These three functions power the severity-aware stale banner and the reconcile
// generation path. They are pure utilities — no LLM, no side effects.
//
// computeStage1Changes: diff current nodes against the snapshot stored at Stage 2
//   generation time. Returns null when no snapshot is present (old sessions).
//
// classifyStage1ChangeSeverity: maps the change set to one of five severity levels.
//
// getReconcileImpactedSections: maps change types to likely-impacted Stage 2 sections.

export function computeStage1Changes(currentNodes, snapshotNodes) {
  if (!Array.isArray(snapshotNodes) || snapshotNodes.length === 0) return null

  const snapMap = Object.fromEntries(snapshotNodes.map(n => [n.id, n]))
  const currMap = Object.fromEntries(currentNodes.map(n => [n.id, n]))
  const changes = []

  for (const snap of snapshotNodes) {
    const curr = currMap[snap.id]
    if (!curr) {
      changes.push({ nodeId: snap.id, nodeType: snap.type || null, changeType: 'removed' })
      continue
    }
    const statementChanged  = snap.statement  !== curr.statement
    const confidenceChanged = snap.confidence !== curr.confidence
    const statusChanged     = snap.userStatus !== curr.userStatus
    if (!statementChanged && !confidenceChanged && !statusChanged) continue
    changes.push({
      nodeId:             curr.id,
      nodeType:           curr.type        || null,
      changeType:         'modified',
      statementChanged,
      confidenceChanged,
      statusChanged,
      previousStatement:  statementChanged  ? snap.statement  : null,
      currentStatement:   statementChanged  ? curr.statement  : null,
      previousConfidence: confidenceChanged ? snap.confidence : null,
      currentConfidence:  confidenceChanged ? curr.confidence : null,
      previousStatus:     statusChanged     ? snap.userStatus : null,
      currentStatus:      statusChanged     ? curr.userStatus : null,
      changeReason:       curr.changeReason || null,
    })
  }

  // Added nodes — present in current but absent from snapshot
  for (const curr of currentNodes) {
    if (!snapMap[curr.id]) {
      changes.push({ nodeId: curr.id, nodeType: curr.type || null, changeType: 'added' })
    }
  }

  return changes
}

export function classifyStage1ChangeSeverity(changes) {
  if (!changes)          return null       // no snapshot — unknown
  if (changes.length === 0) return 'cosmetic' // hash diffed for some reason but no node delta

  const hasStructural = changes.some(c => c.changeType === 'added' || c.changeType === 'removed')
  if (hasStructural) return 'major_basis_change'

  const modified         = changes.filter(c => c.changeType === 'modified')
  const statementChanges = modified.filter(c => c.statementChanged)

  if (statementChanges.length === 0) {
    const hasConfOnly = modified.some(c => c.confidenceChanged && !c.statementChanged)
    return hasConfOnly ? 'minor_clarification' : 'cosmetic'
  }

  if (statementChanges.length > 3) return 'material_reframing'
  return 'substantive_refinement'
}

// Returns ordered array of Stage 2 section keys likely impacted by the given changes.
// Structural changes (added/removed nodes) return all sections.
// In reconcile mode, these are the ONLY sections sent to the LLM and compared.
export function getReconcileImpactedSections(changes) {
  if (!changes || changes.length === 0) return []

  const ALL_SECTIONS = [
    'strategicThemes', 'decisionFrameworks', 'scenarioModels',
    'organizationalImplications', 'capabilityGaps', 'contradictionAnalysis',
    'riskModels', 'opportunityModels', 'nextActions', 'readinessAssessment',
  ]

  const hasStructural = changes.some(c => c.changeType === 'added' || c.changeType === 'removed')
  if (hasStructural) return ALL_SECTIONS

  const sections = new Set()
  for (const c of changes.filter(ch => ch.changeType === 'modified')) {
    if (c.statementChanged)  {
      sections.add('strategicThemes')
      sections.add('decisionFrameworks')
      sections.add('contradictionAnalysis')
      sections.add('riskModels')
      sections.add('readinessAssessment')
    }
    if (c.confidenceChanged) {
      sections.add('capabilityGaps')
      sections.add('readinessAssessment')
    }
    if (c.statusChanged) {
      sections.add('opportunityModels')
      sections.add('nextActions')
      sections.add('readinessAssessment')
    }
  }

  // Return in canonical order (matching ALL_SECTIONS)
  return ALL_SECTIONS.filter(k => sections.has(k))
}

// ── Stage 1 citation normalization ────────────────────────────────────────────
//
// normalizePtCitations: converts ptResult.retrievedEvidence into Stage1Citation[].
// De-duplicates by canonical URL. Maps evidence type to a support level label.
// Returns [] when no evidence is present — never fabricates citations.

function extractUrlDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch (_) { return '' }
}

function mapEvidenceSupportLevel(type) {
  if (type === 'direct_evidence')         return 'direct'
  if (type === 'pattern_inference')       return 'context'
  if (type === 'competitor_analogy')      return 'context'
  if (type === 'contradictory_evidence')  return false
  return 'partial'
}

export function normalizePtCitations(ptResult) {
  const evidence = ptResult?.retrievedEvidence || []
  if (evidence.length === 0) return []

  const seen      = new Set()
  const citations = []

  for (const e of evidence) {
    const url       = e.url || ''
    const canonical = url.toLowerCase().replace(/\/$/, '')
    if (canonical && seen.has(canonical)) continue
    if (canonical) seen.add(canonical)

    citations.push({
      id:           `cite_${e.id || citations.length}`,
      title:        e.title || '',
      url,
      source:       e.publisher || '',
      domain:       extractUrlDomain(url),
      publishedAt:  e.publishedAt || null,
      accessedAt:   new Date().toISOString(),
      snippet:      e.snippet || '',
      supportsClaim: mapEvidenceSupportLevel(e.type),
      confidence:   e.confidence || null,
    })
  }

  return citations
}

// ── Sentence-level citation placement ─────────────────────────────────────────
//
// buildInlineCitationSegments: splits a node statement into renderable segments
// with citation markers placed after the sentence each citation supports.
//
// Returns: Array<{ text: string } | { markers: number[] }>
//
// Placement priority per ref:
//   1. ref.sentenceIndex exists and is in range → use it
//   2. ref.claimText exists AND differs from the full statement → match sentence
//   3. citation.snippet → keyword match against sentences
//   4. Fallback: distribute evenly from sentence 0 (never pile at end for multi-sentence)

function splitSentences(text) {
  if (!text) return []
  // Split on sentence-ending punctuation followed by whitespace.
  // Each returned element keeps its trailing punctuation.
  const parts = text.trim().split(/(?<=[.!?])\s+/)
  return parts.map(s => s.trim()).filter(s => s.length > 0)
}

function resolveSentenceIndex(ref, cite, sentences, fullStatement) {
  const n = sentences.length

  // Priority 1: explicit sentenceIndex in valid range
  if (typeof ref.sentenceIndex === 'number' && ref.sentenceIndex >= 0 && ref.sentenceIndex < n) {
    return ref.sentenceIndex
  }

  // Priority 2: claimText match — only when claimText is not the full statement.
  // claimText === fullStatement was the old placeholder pattern and carries no placement info.
  const claimText = typeof ref.claimText === 'string' ? ref.claimText.trim() : null
  if (claimText && claimText !== fullStatement.trim()) {
    const claimLower = claimText.toLowerCase()
    for (let i = 0; i < n; i++) {
      const sentLower = sentences[i].toLowerCase()
      // Match if sentence contains the claim prefix, or claim contains the sentence prefix
      if (
        sentLower.includes(claimLower.slice(0, 30)) ||
        claimLower.includes(sentLower.replace(/[.!?]$/, '').slice(0, 30))
      ) {
        return i
      }
    }
  }

  // Priority 3: snippet keyword match against sentences
  if (cite?.snippet && cite.snippet.length >= 8) {
    const keywords = cite.snippet.toLowerCase().split(/\s+/).slice(0, 5).join(' ')
    for (let i = 0; i < n; i++) {
      if (sentences[i].toLowerCase().includes(keywords)) {
        return i
      }
    }
  }

  return null // no confident match
}

export function buildInlineCitationSegments(statement, refs, citations) {
  if (!statement) return [{ text: '' }]

  const validRefs = (refs || []).filter(r => r != null && r.marker != null)
  if (validRefs.length === 0) return [{ text: statement }]

  const sentences = splitSentences(statement)
  if (sentences.length === 0) return [{ text: statement }]

  const citeById = Object.fromEntries((citations || []).map(c => [c.id, c]))

  // Assign each ref to a sentence index; collect unplaced ones separately
  const markersPerSentence = Array.from({ length: sentences.length }, () => [])
  const unplaced = []

  for (const ref of validRefs) {
    const idx = resolveSentenceIndex(ref, citeById[ref.citationId], sentences, statement)
    if (idx !== null) {
      markersPerSentence[idx].push(ref.marker)
    } else {
      unplaced.push(ref.marker)
    }
  }

  // Distribute unplaced markers
  if (unplaced.length > 0) {
    if (sentences.length === 1) {
      // Single sentence: all go at the end (correct Wikipedia behavior)
      markersPerSentence[0].push(...unplaced)
    } else {
      // Multi-sentence: spread from front rather than piling at the end
      for (let i = 0; i < unplaced.length; i++) {
        markersPerSentence[i % sentences.length].push(unplaced[i])
      }
    }
  }

  // Build segments: [text][markers][text][markers]...
  const segments = []
  for (let i = 0; i < sentences.length; i++) {
    // Inter-sentence space is a prefix on every sentence except the first
    segments.push({ text: i > 0 ? ' ' + sentences[i] : sentences[i] })
    const markers = markersPerSentence[i].slice().sort((a, b) => a - b)
    if (markers.length > 0) {
      segments.push({ markers })
    }
  }

  return segments
}

// buildCitationRefs — converts a Stage1Citation[] into InlineCitationRef[] with
// sequential markers (1-based). Placement fields are left null so the renderer
// falls back to snippet matching + distribution. Shared by buildStage1ReviewEvent
// and the DiffView preview so marker numbers are guaranteed identical.
export function buildCitationRefs(citations) {
  return (citations || []).map((citation, index) => ({
    citationId:    citation.id,
    marker:        index + 1,
    sentenceIndex: null,
    claimText:     null,
  }))
}

// buildStage1ReviewEvent — constructs a Stage1ReviewEvent from an applied ptResult.
// operation: 'challenge' | 'refine'  (Stage 1 currently only produces 'challenge')
// nodeText: node.statement at the time the user clicks Apply
export function buildStage1ReviewEvent(ptResult, nodeText, operation = 'challenge') {
  const citations = normalizePtCitations(ptResult)
  const { decision, challengeAssessment, evidenceSummary, evidenceNeeded, revisedNode } = ptResult

  const outcome =
    decision === 'revise_claim'      ? 'revise'           :
    decision === 'preserve_original' ? 'preserve'         :
    decision === 'mark_unresolved'   ? 'unresolved'       :
    decision === 'retrieval_failed'  ? 'retrieval_failed' : 'unresolved'

  const replacementStatement =
    decision === 'revise_claim' && revisedNode ? revisedNode.statement : null

  // Do NOT set claimText to the full statement — that provides no sentence-level
  // placement signal and caused all markers to be dumped at the end of the statement.
  // The renderer uses sentenceIndex (null → fallback distributor) and snippet matching.
  const inlineCitationRefs = buildCitationRefs(citations)

  const diagnostics = []
  if (decision === 'retrieval_failed') {
    diagnostics.push({
      code:     'RETRIEVAL_FAILED',
      severity: 'error',
      message:  challengeAssessment || 'Retrieval returned no useful evidence.',
    })
  } else if (citations.length === 0) {
    diagnostics.push({
      code:     'NO_CITATIONS_RETURNED',
      severity: 'warning',
      message:  'Challenge completed without source citations.',
    })
  }

  return {
    id:                  `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt:           new Date().toISOString(),
    operation,
    outcome,
    summary:             challengeAssessment || null,
    critique:            null,
    evidenceSummary:     evidenceSummary || null,
    evidenceStillNeeded: evidenceNeeded ? [evidenceNeeded] : [],
    originalStatement:   nodeText,
    replacementStatement,
    citations,
    inlineCitationRefs,
    diagnostics,
  }
}

// ── Stage 2 citation utilities ─────────────────────────────────────────────────
//
// buildS2EvidenceCitations — normalizes evidenceConsolidation item.sources[] into
// Stage1Citation[] so CitationMarker and buildInlineCitationSegments can be reused
// without change. Mirrors normalizePtCitations shape; returns [] when no sources.
export function buildS2EvidenceCitations(evidenceItem) {
  const sources = evidenceItem?.sources || []
  if (sources.length === 0) return []

  const seen      = new Set()
  const citations = []

  for (const src of sources) {
    const url       = src.url || ''
    const canonical = url.toLowerCase().replace(/\/$/, '')
    if (canonical && seen.has(canonical)) continue
    if (canonical) seen.add(canonical)

    let domain = ''
    try { domain = new URL(url).hostname.replace(/^www\./, '') } catch (_) { domain = '' }

    const supportsClaim =
      src.relationship === 'supports'    ? 'direct'  :
      src.relationship === 'contradicts' ? false      :
      src.relationship === 'qualifies'   ? 'partial'  : 'partial'

    citations.push({
      id:           `s2cite_${citations.length}_${(src.title || '').toLowerCase().replace(/\W+/g, '_').slice(0, 16)}`,
      title:        src.title     || '',
      url,
      source:       src.publisher || '',
      domain,
      publishedAt:  src.publishedAt  || null,
      accessedAt:   new Date().toISOString(),
      snippet:      src.snippet   || '',
      supportsClaim,
      confidence:   src.confidence || null,
    })
  }

  return citations
}

// buildS2ItemCitations — resolves Stage1Citation[] for any Stage 2 item.
// Priority: item.sources[] (evidence consolidation) → Stage 1 node latestReview.citations
// (inherited when item references stage1 nodes) → [] (never fakes citations).
export function buildS2ItemCitations(item, stage1Nodes) {
  if (item?.sources?.length > 0) return buildS2EvidenceCitations(item)

  const nodeIds = [
    ...(item?.nodeIds          || []),
    ...(item?.connectedNodeIds || []),
    ...(item?.nodeId           ? [item.nodeId]                          : []),
    ...(item?.relevantTo && item.relevantTo !== 'open_question' ? [item.relevantTo] : []),
  ].filter((id, i, arr) => Boolean(id) && arr.indexOf(id) === i)

  if (!nodeIds.length || !stage1Nodes?.length) return []

  const seen = new Set()
  const out  = []

  for (const nodeId of nodeIds) {
    const node  = stage1Nodes.find(n => n.id === nodeId)
    const cites = node?.latestReview?.citations || []
    for (const c of cites) {
      const url = (c.url || '').toLowerCase().replace(/\/$/, '')
      if (url && seen.has(url)) continue
      if (url) seen.add(url)
      out.push(c)
    }
  }

  return out
}

// buildStage2ReviewEvent — constructs a Stage 2 review event compatible with
// the Stage 1 shape. stage: 'stage2' distinguishes origin in any future audit.
export function buildStage2ReviewEvent({
  targetId,
  targetSection,
  operation       = 'accept',
  outcome         = 'accepted',
  originalText    = null,
  replacementText = null,
  citations       = [],
}) {
  return {
    id:                 `rev2_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    createdAt:          new Date().toISOString(),
    stage:              'stage2',
    targetId,
    targetSection,
    operation,
    outcome,
    originalText,
    replacementText,
    citations,
    inlineCitationRefs: buildCitationRefs(citations),
    diagnostics:        [],
  }
}

export function recommendTargetNodes(pivotType, stage1Nodes, stage2) {
  const MAX    = 3
  const dedupe = arr => [...new Map(arr.map(n => [n.id, n])).values()]

  switch (pivotType) {
    case 'contextual_competition':
      // Opportunities, hypotheses, assumptions — assertions most reshaped by competitor context
      return dedupe(
        stage1Nodes.filter(n => ['opportunity', 'hypothesis', 'assumption'].includes(n.type))
      ).slice(0, MAX).map(n => n.id)

    case 'operational_constraints':
      // Constraint and risk nodes first; then low-confidence hypotheses
      return dedupe([
        ...stage1Nodes.filter(n => ['constraint', 'risk'].includes(n.type)),
        ...stage1Nodes.filter(n => n.type === 'hypothesis' && n.confidence === 'low'),
      ]).slice(0, MAX).map(n => n.id)

    case 'adoption_dynamics':
      // Assumptions and hypotheses — behavioral and demand claims
      return dedupe(
        stage1Nodes.filter(n => ['assumption', 'hypothesis'].includes(n.type))
      ).slice(0, MAX).map(n => n.id)

    case 'business_model_pressures': {
      // Pull from contradiction map nodes first (already flagged as business model tensions)
      const fromContradictions = new Set(
        (stage2?.contradictionMap || [])
          .filter(c => ['business_model_tension', 'pricing_conflict'].includes(c.tensionType))
          .flatMap(c => c.nodeIds || [])
      )
      return dedupe([
        ...stage1Nodes.filter(n => fromContradictions.has(n.id)),
        ...stage1Nodes.filter(n => n.type === 'assumption'),
      ]).slice(0, MAX).map(n => n.id)
    }

    case 'emerging_disruption':
      // Hypothesis and opportunity nodes — forward-looking claims most exposed to disruption
      return dedupe(
        stage1Nodes.filter(n => ['hypothesis', 'opportunity'].includes(n.type))
      ).slice(0, MAX).map(n => n.id)

    case 'adjacent_capabilities':
      // Use connectedNodeIds from adjacency opportunities first
      return (stage2?.adjacencyOpportunities || [])
        .flatMap(a => a.connectedNodeIds || [])
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .slice(0, MAX)

    default:
      // Fallback: lowest confidence nodes
      return dedupe(
        [...stage1Nodes].sort((a, b) =>
          ['low', 'medium', 'high'].indexOf(a.confidence) -
          ['low', 'medium', 'high'].indexOf(b.confidence)
        )
      ).slice(0, MAX).map(n => n.id)
  }
}
