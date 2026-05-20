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

// Computes a node-level diff between the original node list and a scoped regen API result.
// Does not mutate anything — returns a plain RegenerationDiff object.
export function computeDiff(originalNodes, regenResult) {
  const { revisedNode, updatedDownstream = [] } = regenResult

  const changedById = {}
  changedById[revisedNode.id] = revisedNode
  for (const n of updatedDownstream) {
    changedById[n.id] = n
  }

  const modifiedNodes = []
  const preservedNodes = []

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

  const confidenceChanges = modifiedNodes
    .filter(({ before, after }) => before.confidence !== after.confidence)
    .map(({ before, after }) => ({
      nodeId: after.id,
      before: before.confidence,
      after:  after.confidence,
    }))

  return {
    preservedNodes,
    modifiedNodes,
    removedNodes: [],    // not produced in Stage 1 MVP
    addedNodes:   [],    // not produced in Stage 1 MVP
    confidenceChanges,
  }
}

// Applies an accepted diff to the node array and returns the new array.
// Revised nodes: previousStatement set, userStatus reset to 'pending' for re-review.
// Unaffected nodes: returned as-is, including their existing userStatus.
export function applyDiff(originalNodes, regenResult) {
  const { revisedNode, updatedDownstream = [] } = regenResult

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

// Returns a compact policy description string for display in UI badges.
export function policyLabel(policy) {
  return `${policy.tokenBudget} token · ${policy.skepticismLevel} skepticism · ${policy.maxOutputWords}w`
}
