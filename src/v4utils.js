// DomainIQ v4 — pure utility functions for diff, dependency resolution, and context summarization
// No React, no side effects.

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
    // preserve_original, mark_unresolved, retrieval_failed — no statement changes
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
  const cm     = stage2.contradictionMap       || []
  const eq     = stage2.emergingEntrants        || []
  const uq     = stage2.unresolvedQuestions     || []
  const comp   = stage2.competitorMap           || []
  const adj    = stage2.adjacencyOpportunities  || []

  const scores = {
    contextual_competition: (
      (comp.length > 0                                                          ? 2 : 0) +
      (cm.some(c => c.tensionType === 'strategic_inconsistency')                ? 1 : 0) +
      (nodes.filter(n => n.type === 'opportunity').length >= 2                  ? 1 : 0)
    ),
    operational_constraints: (
      (nodes.some(n => n.type === 'constraint' || n.type === 'risk')            ? 2 : 0) +
      (cm.some(c => ['capability_constraint', 'compliance_constraint']
                     .includes(c.tensionType))                                  ? 2 : 0) +
      (adj.some(a => a.risks)                                                   ? 1 : 0)
    ),
    adoption_dynamics: (
      (nodes.filter(n => n.type === 'assumption').length >= 2                   ? 1 : 0) +
      (cm.some(c => c.tensionType === 'business_model_tension')                 ? 2 : 0) +
      (eq.length > 0                                                            ? 1 : 0)
    ),
    business_model_pressures: (
      (cm.some(c => ['pricing_conflict', 'business_model_tension']
                     .includes(c.tensionType))                                  ? 2 : 0) +
      (nodes.some(n => /revenue|pric|subscri|fee|model/i.test(n.statement))    ? 1 : 0)
    ),
    emerging_disruption: (
      (eq.length > 0                                                            ? 2 : 0) +
      (uq.length >= 3                                                           ? 1 : 0)
    ),
    adjacent_capabilities: (
      (adj.length > 0                                                           ? 2 : 0)
    ),
  }

  const priorityLabel = s => s >= 3 ? 'high' : s >= 2 ? 'medium' : 'low'

  return Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type, score]) => ({ type, score, priority: priorityLabel(score) }))
}

// recommendTargetNodes — infers which Stage 1 node IDs are most contextually
// relevant for the given pivot type.  Returns node IDs (max 3, deduplicated).
// Pre-populates the TargetNodeSelector; user can edit before executing.

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
