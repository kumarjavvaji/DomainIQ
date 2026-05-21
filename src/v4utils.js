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
// Pulls only persisted, inspectable fields — never raw API response blobs.
export function buildStage2ContextPacket(session) {
  const nodes = session.stage1?.nodes || []
  const accepted   = nodes.filter(n => n.userStatus === 'accepted')
  const refined    = nodes.filter(n => n.previousStatement)
  const unresolved = nodes.filter(n => n.userStatus === 'needs_review')
  return {
    entity:           session.entity,
    intent:           session.intent,
    stage1Summary:    session.stage1?.summary || '',
    acceptedNodes:    accepted,
    refinedNodes:     refined,
    unresolvedNodes:  unresolved,
    openQuestions:    session.stage1?.openQuestions  || [],
    inferredPatterns: session.stage1?.inferredPatterns || [],
  }
}

// Returns a compact policy description string for display in UI badges.
export function policyLabel(policy) {
  return `${policy.tokenBudget} token · ${policy.skepticismLevel} skepticism · ${policy.maxOutputWords}w`
}
