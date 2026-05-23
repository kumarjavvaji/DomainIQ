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

  return {
    entity:                 session.entity,
    intent:                 session.intent,
    stage1Summary:          session.stage1?.summary || '',
    inferredPatterns:       (session.stage1?.inferredPatterns || []).slice(0, 3),
    acceptedNodes,
    refinedNodes,
    stage2Summary:          stage2.summary || null,
    evidenceItems:          (stage2.evidenceConsolidation   || []).slice(0, 5),
    competitors:            (stage2.competitorMap            || []).slice(0, 3),
    entrants:               (stage2.emergingEntrants         || []).slice(0, 3),
    contradictions:         (stage2.contradictionMap         || []).slice(0, 4),
    adjacencies:            (stage2.adjacencyOpportunities   || []).slice(0, 3),
    openQuestions:          [
      ...(session.stage1?.openQuestions || []),
      ...(stage2.unresolvedQuestions    || []),
    ].slice(0, 5),
    stage3ReadinessSummary: stage2.stage3ReadinessSummary || null,
    acceptedPivotProposals,
    acceptedRefinements,
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
    summary:                'Strategic framing updated based on new Stage 1 basis',
    stage3ReadinessSummary: 'Stage 3 readiness assessment updated',
  })[key] || 'Content updated based on new Stage 1 basis'
}

export function buildStage2Comparison(currentStage2, candidateStage2) {
  const sections = [
    { key: 'summary',                label: 'Stage 2 Summary',           artifactType: 'object' },
    { key: 'evidenceConsolidation',  label: 'Evidence Consolidation',    artifactType: 'array'  },
    { key: 'competitorMap',          label: 'Competitor Map',            artifactType: 'array'  },
    { key: 'emergingEntrants',       label: 'Emerging Entrants',         artifactType: 'array'  },
    { key: 'contradictionMap',       label: 'Contradiction Map',         artifactType: 'array'  },
    { key: 'adjacencyOpportunities', label: 'Adjacency Opportunities',   artifactType: 'array'  },
    { key: 'refinedAssertions',      label: 'Refined Assertions',        artifactType: 'array'  },
    { key: 'unresolvedQuestions',    label: 'Unresolved Questions',      artifactType: 'array'  },
    { key: 'recommendedNextActions', label: 'Recommended Next Actions',  artifactType: 'array'  },
    { key: 'stage3ReadinessSummary', label: 'Stage 3 Readiness Summary', artifactType: 'object' },
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
    'summary', 'evidenceConsolidation', 'competitorMap', 'emergingEntrants',
    'contradictionMap', 'adjacencyOpportunities', 'refinedAssertions',
    'unresolvedQuestions', 'recommendedNextActions', 'stage3ReadinessSummary',
  ]

  const hasStructural = changes.some(c => c.changeType === 'added' || c.changeType === 'removed')
  if (hasStructural) return ALL_SECTIONS

  const sections = new Set()
  for (const c of changes.filter(ch => ch.changeType === 'modified')) {
    if (c.statementChanged)  {
      sections.add('summary')
      sections.add('evidenceConsolidation')
      sections.add('refinedAssertions')
      sections.add('contradictionMap')
      sections.add('stage3ReadinessSummary')
    }
    if (c.confidenceChanged) {
      sections.add('evidenceConsolidation')
      sections.add('stage3ReadinessSummary')
    }
    if (c.statusChanged) {
      sections.add('refinedAssertions')
      sections.add('unresolvedQuestions')
      sections.add('recommendedNextActions')
    }
  }

  // Return in canonical order (matching ALL_SECTIONS)
  return ALL_SECTIONS.filter(k => sections.has(k))
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
