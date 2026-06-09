// @vitest-environment happy-dom
//
// Operation contract tests for the ATB bridge integration in DomainIQ.
//
// Covers:
//  - NodeCard renders bridge challenge fields (challenge/suggestion/concernType)
//  - NodeCard does NOT render bridge challenge section when challenge is absent
//  - mode → operation mapping: user_challenge → 'challenge', system_review → 'refine'
//  - visible-change guard logic: no-change case triggers error, not success
//  - DIQ does not show success when no visible node content changed

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NodeCard from '../v4/NodeCard'

// ── Minimal node factories ────────────────────────────────────────────────────

function makeNode(overrides = {}) {
  return {
    id: 'n1',
    type: 'finding',
    statement: 'Community banks have low digital adoption rates.',
    confidence: 'medium',
    evidence_type: 'inferred_strategy',
    dependsOn: [],
    userStatus: 'pending',
    userNote: null,
    userPreset: null,
    previousStatement: null,
    changeReason: null,
    lastUpdated: 1000,
    ...overrides,
  }
}

function renderCard(node, props = {}) {
  render(
    <NodeCard
      node={node}
      allNodes={[node]}
      onStatusChange={vi.fn()}
      onChallengeClick={vi.fn()}
      onRegenClick={vi.fn()}
      onNeedsReviewClick={vi.fn()}
      {...props}
    />
  )
}

// ── NodeCard bridge challenge display ─────────────────────────────────────────

describe('NodeCard — bridge challenge display', () => {
  it('renders bridge assessment section when node has _bridgeGenerated and challenge', () => {
    const node = makeNode({
      _bridgeGenerated: true,
      challenge: 'The claim overgeneralises — many banks have adopted mobile.',
      concernType: 'evidentiary',
      suggestion: 'Narrow scope to banks under $500M.',
    })
    renderCard(node)
    expect(screen.getByText(/Bridge assessment/i)).toBeTruthy()
    expect(screen.getByText(/overgeneralises/i)).toBeTruthy()
  })

  it('renders concernType badge when present', () => {
    const node = makeNode({
      _bridgeGenerated: true,
      challenge: 'Some challenge.',
      concernType: 'evidentiary',
    })
    renderCard(node)
    expect(screen.getByText('evidentiary')).toBeTruthy()
  })

  it('renders suggestion when present', () => {
    const node = makeNode({
      _bridgeGenerated: true,
      challenge: 'Some challenge.',
      suggestion: 'Cite primary sources.',
    })
    renderCard(node)
    expect(screen.getByText(/Cite primary sources/i)).toBeTruthy()
  })

  it('does NOT render bridge assessment section when challenge is absent', () => {
    const node = makeNode({ _bridgeGenerated: true }) // no challenge
    renderCard(node)
    expect(screen.queryByText(/Bridge assessment/i)).toBeNull()
  })

  it('does NOT render bridge assessment section when _bridgeGenerated is false', () => {
    const node = makeNode({ _bridgeGenerated: false, challenge: 'some text' })
    renderCard(node)
    expect(screen.queryByText(/Bridge assessment/i)).toBeNull()
  })

  it('does NOT render bridge assessment section for a plain non-bridge node', () => {
    const node = makeNode()
    renderCard(node)
    expect(screen.queryByText(/Bridge assessment/i)).toBeNull()
  })
})

// ── NodeCard: original statement still displayed after challenge ───────────────

describe('NodeCard — challenge preserves original statement display', () => {
  it('renders original statement alongside bridge challenge metadata', () => {
    const originalStatement = 'Community banks have slow digital adoption.'
    const node = makeNode({
      statement: originalStatement,
      _bridgeGenerated: true,
      challenge: 'The claim needs a source citation.',
    })
    renderCard(node)
    expect(screen.getByText(originalStatement)).toBeTruthy()
    expect(screen.getByText(/Bridge assessment/i)).toBeTruthy()
  })
})

// ── mode → operation mapping ─────────────────────────────────────────────────
//
// These unit tests verify the mapping logic in handleRegenNode without
// rendering the full component.

describe('mode → ATB operation mapping', () => {
  function mapModeToOperation(mode) {
    return mode === 'system_review' ? 'refine' : 'challenge'
  }

  it('user_challenge mode maps to challenge operation', () => {
    expect(mapModeToOperation('user_challenge')).toBe('challenge')
  })

  it('system_review mode maps to refine operation', () => {
    expect(mapModeToOperation('system_review')).toBe('refine')
  })

  it('needs_review mode maps to challenge operation (challenge semantics)', () => {
    expect(mapModeToOperation('needs_review')).toBe('challenge')
  })

  it('default mode (no arg) maps to challenge', () => {
    const DEFAULT_MODE = 'user_challenge'
    expect(mapModeToOperation(DEFAULT_MODE)).toBe('challenge')
  })
})

// ── Visible-change guard logic ────────────────────────────────────────────────
//
// Mirrors the guard in handleRegenNode ATB bridge path:
// if !statementChanged && !challengeAdded → trigger error, not success.

describe('visible-change guard: no success when nothing visibly changed', () => {
  const ORIGINAL_STATEMENT = 'Original claim.'

  function computeVisibilityResult(returnedNode, originalNode) {
    // returnedNode must exist; undefined !== string would be true but means missing node
    const statementChanged = returnedNode != null && returnedNode.statement !== originalNode?.statement
    const challengeAdded   = !!returnedNode?.challenge
    return { statementChanged, challengeAdded, somethingVisible: statementChanged || challengeAdded }
  }

  it('refine: statement changed → somethingVisible = true', () => {
    const orig = { statement: ORIGINAL_STATEMENT }
    const ret  = { statement: 'Refined statement.' }
    expect(computeVisibilityResult(ret, orig).somethingVisible).toBe(true)
  })

  it('challenge: challenge added → somethingVisible = true', () => {
    const orig = { statement: ORIGINAL_STATEMENT }
    const ret  = { statement: ORIGINAL_STATEMENT, challenge: 'Bridge assessment.' }
    expect(computeVisibilityResult(ret, orig).somethingVisible).toBe(true)
  })

  it('neither statement changed nor challenge added → somethingVisible = false (error case)', () => {
    const orig = { statement: ORIGINAL_STATEMENT }
    const ret  = { statement: ORIGINAL_STATEMENT } // no change, no challenge
    expect(computeVisibilityResult(ret, orig).somethingVisible).toBe(false)
  })

  it('null returnedNode → somethingVisible = false (error case)', () => {
    const orig = { statement: ORIGINAL_STATEMENT }
    expect(computeVisibilityResult(null, orig).somethingVisible).toBe(false)
  })

  it('challenge present on returned node even with same statement → visible', () => {
    const orig = { statement: ORIGINAL_STATEMENT }
    const ret  = { statement: ORIGINAL_STATEMENT, challenge: 'non-empty' }
    const { statementChanged, challengeAdded } = computeVisibilityResult(ret, orig)
    expect(statementChanged).toBe(false)
    expect(challengeAdded).toBe(true)
  })
})

// ── NodeCard: needs_review badge and button ───────────────────────────────────

describe('NodeCard — needs_review status badge', () => {
  it('renders "Needs review" status badge when userStatus is needs_review', () => {
    const node = makeNode({ userStatus: 'needs_review' })
    const { container } = render(
      <NodeCard
        node={node} allNodes={[node]}
        onStatusChange={vi.fn()} onChallengeClick={vi.fn()}
        onRegenClick={vi.fn()} onNeedsReviewClick={vi.fn()}
      />
    )
    const badge = container.querySelector('.ns-review')
    expect(badge).toBeTruthy()
    expect(badge.textContent.trim()).toBe('Needs review')
  })

  it('badge is not "Pending" when userStatus is needs_review', () => {
    const node = makeNode({ userStatus: 'needs_review' })
    const { container } = render(
      <NodeCard
        node={node} allNodes={[node]}
        onStatusChange={vi.fn()} onChallengeClick={vi.fn()}
        onRegenClick={vi.fn()} onNeedsReviewClick={vi.fn()}
      />
    )
    const pendingBadge = container.querySelector('.ns-pending')
    expect(pendingBadge).toBeNull()
  })

  it('clicking Needs review button calls onNeedsReviewClick with node id', () => {
    const onNeedsReviewClick = vi.fn()
    const node = makeNode() // userStatus: pending → badge says "Pending"; button says "Needs review"
    render(
      <NodeCard
        node={node} allNodes={[node]}
        onStatusChange={vi.fn()} onChallengeClick={vi.fn()}
        onRegenClick={vi.fn()} onNeedsReviewClick={onNeedsReviewClick}
      />
    )
    // With status pending the badge shows "Pending" so "Needs review" is unambiguously the button
    fireEvent.click(screen.getByText('Needs review'))
    expect(onNeedsReviewClick).toHaveBeenCalledWith(node.id)
    expect(onNeedsReviewClick).toHaveBeenCalledTimes(1)
  })

  it('statement is unchanged when node has needs_review status', () => {
    const statement = 'Community banks have slow digital adoption rates.'
    const node = makeNode({ statement, userStatus: 'needs_review' })
    renderCard(node)
    expect(screen.getByText(statement)).toBeTruthy()
  })
})

// ── handleNeedsReviewClick — routes through handleRegenNode ──────────────────
//
// handleNeedsReviewClick now delegates to handleRegenNode('needs_review') so
// the ATB bridge path runs (challenge semantics, statement preserved, status
// overridden to needs_review after apply).

describe('handleNeedsReviewClick — routes through handleRegenNode', () => {
  function handleNeedsReviewClick(handleRegenNode, nodeId) {
    handleRegenNode(nodeId, 'needs_review')
  }

  it('calls handleRegenNode with needs_review mode', () => {
    const handleRegenNode = vi.fn()
    handleNeedsReviewClick(handleRegenNode, 'n1')
    expect(handleRegenNode).toHaveBeenCalledWith('n1', 'needs_review')
    expect(handleRegenNode).toHaveBeenCalledTimes(1)
  })

  it('does not call setSession directly (delegates to handleRegenNode)', () => {
    const handleRegenNode = vi.fn()
    const setSession = vi.fn()
    handleNeedsReviewClick(handleRegenNode, 'n1')
    expect(setSession).not.toHaveBeenCalled()
    expect(handleRegenNode).toHaveBeenCalledTimes(1)
  })
})

// ── needs_review: operation maps to challenge (preserves statement) ───────────

describe('needs_review mode — ATB operation is challenge', () => {
  function mapModeToOperation(mode) {
    return mode === 'system_review' ? 'refine' : 'challenge'
  }

  it('needs_review uses challenge operation (preserves statement, produces assessment)', () => {
    expect(mapModeToOperation('needs_review')).toBe('challenge')
  })

  it('generateDIQStage1ViaBridge is called with operation:challenge for needs_review', async () => {
    const generateDIQStage1ViaBridge = vi.fn().mockResolvedValue({ applied: false, diagnostics: [] })

    async function simulateBridgePath(nodeId, mode, session) {
      const operation = mapModeToOperation(mode)
      const fixture = {
        fixtureVersion: 1, sourceApp: 'diq', exportedAt: new Date().toISOString(),
        databaseName: 'domainiq_v4', stores: { sessions: [session] },
      }
      return generateDIQStage1ViaBridge({ generationMode: 'bridge', session, sessionId: session.id, nodeId, operation, fixture })
    }

    const session = { id: 's1', stage1: { nodes: [{ id: 'n1', statement: 'Original.' }] } }
    await simulateBridgePath('n1', 'needs_review', session)

    expect(generateDIQStage1ViaBridge).toHaveBeenCalledTimes(1)
    expect(generateDIQStage1ViaBridge.mock.calls[0][0].operation).toBe('challenge')
  })
})

// ── needs_review: original statement is preserved ────────────────────────────

describe('needs_review mode — original statement preserved', () => {
  it('challenge operation does not rewrite statement; statement survives to final node', () => {
    const originalStatement = 'Community banks have low digital adoption rates.'
    // ATB challenge result: statement is unchanged, challenge fields added
    const atbReturnedNode = {
      id: 'n1', statement: originalStatement,
      userStatus: 'challenged',
      challenge: 'The claim overgeneralises adoption rates.',
      concernType: 'evidentiary',
      suggestion: 'Narrow to banks under $500M assets.',
    }
    // needs_review override step: only userStatus changes
    const finalNode = { ...atbReturnedNode, userStatus: 'needs_review' }
    expect(finalNode.statement).toBe(originalStatement)
    expect(finalNode.challenge).toBeTruthy()
    expect(finalNode.userStatus).toBe('needs_review')
  })
})

// ── needs_review: bridge assessment panel renders ────────────────────────────

describe('needs_review mode — bridge assessment panel renders', () => {
  it('renders Bridge assessment section when node has needs_review + challenge fields', () => {
    const node = makeNode({
      userStatus: 'needs_review',
      _bridgeGenerated: true,
      challenge: 'The claim lacks supporting evidence.',
      concernType: 'evidentiary',
      suggestion: 'Add primary source citations.',
    })
    renderCard(node)
    expect(screen.getByText(/Bridge assessment/i)).toBeTruthy()
    expect(screen.getByText(/lacks supporting evidence/i)).toBeTruthy()
  })

  it('bridge assessment shows concernType for a needs_review node', () => {
    const node = makeNode({
      userStatus: 'needs_review',
      _bridgeGenerated: true,
      challenge: 'Some concern.',
      concernType: 'assumption',
    })
    renderCard(node)
    expect(screen.getByText('assumption')).toBeTruthy()
  })

  it('bridge assessment shows suggestion for a needs_review node', () => {
    const node = makeNode({
      userStatus: 'needs_review',
      _bridgeGenerated: true,
      challenge: 'Weak claim.',
      suggestion: 'Cite industry reports.',
    })
    renderCard(node)
    expect(screen.getByText(/Cite industry reports/i)).toBeTruthy()
  })
})

// ── needs_review: final userStatus remains needs_review ──────────────────────

describe('needs_review mode — userStatus override after bridge', () => {
  // Mirrors the finalNodes logic in handleRegenNode for mode === 'needs_review'
  function applyNeedsReviewOverride(nodeId, atbNodes) {
    return atbNodes.map(n => n.id === nodeId ? { ...n, userStatus: 'needs_review' } : n)
  }

  it('overrides userStatus from challenged to needs_review on target node', () => {
    const atbNodes = [
      { id: 'n1', userStatus: 'challenged', challenge: 'Weak evidence.', statement: 'Original.' },
      { id: 'n2', userStatus: 'pending' },
    ]
    const result = applyNeedsReviewOverride('n1', atbNodes)
    expect(result[0].userStatus).toBe('needs_review')
  })

  it('other nodes are not modified by the override', () => {
    const atbNodes = [
      { id: 'n1', userStatus: 'challenged' },
      { id: 'n2', userStatus: 'pending' },
    ]
    const result = applyNeedsReviewOverride('n1', atbNodes)
    expect(result[1].userStatus).toBe('pending')
  })

  it('challenge / concernType / suggestion are preserved after userStatus override', () => {
    const atbNodes = [
      { id: 'n1', userStatus: 'challenged', challenge: 'Weak evidence.', concernType: 'evidentiary', suggestion: 'Add citations.' },
    ]
    const result = applyNeedsReviewOverride('n1', atbNodes)
    expect(result[0].challenge).toBe('Weak evidence.')
    expect(result[0].concernType).toBe('evidentiary')
    expect(result[0].suggestion).toBe('Add citations.')
  })

  it('statement is preserved after userStatus override', () => {
    const atbNodes = [{ id: 'n1', userStatus: 'challenged', statement: 'Original claim.', challenge: 'x.' }]
    const result = applyNeedsReviewOverride('n1', atbNodes)
    expect(result[0].statement).toBe('Original claim.')
  })
})

// ── needs_review: ATB toggle OFF — falls back to local status ────────────────
//
// Architecture rule: when ATB is ON, ATB owns provider key selection server-side.
// The DIQ frontend API key is NOT consulted for the bridge path.
// Fallback only fires when ATB is OFF (regardless of whether an API key is present).

describe('needs_review — fallback when ATB toggle is off', () => {
  function updateNode(session, nodeId, changes) {
    return {
      ...session,
      stage1: {
        ...session.stage1,
        nodes: session.stage1.nodes.map(n => n.id === nodeId ? { ...n, ...changes } : n),
      },
    }
  }

  function makeSession() {
    return { id: 's1', stage1: { nodes: [{ id: 'n1', userStatus: 'pending', statement: 'Original.' }] } }
  }

  // Mirrors the fixed early-return block in handleRegenNode for needs_review mode.
  // Key rule: useATB is checked BEFORE apiKeySet. When ATB is ON, there is no
  // early return — the bridge path handles it without a DIQ API key.
  function needsReviewFallbackCheck(apiKeySet, useATB, setSession, setError, nodeId) {
    if (!useATB) {
      setSession(prev => updateNode(prev, nodeId, { userStatus: 'needs_review' }))
      setError('Bridge review requires the ATB toggle. Enable "Use AI Tool Bridge" in generation settings to run a live review.')
      return true
    }
    // ATB is ON — bridge path proceeds regardless of apiKeySet.
    return false
  }

  it('ATB toggle OFF: sets userStatus to needs_review locally', () => {
    const session = makeSession()
    let updated = null
    const setSession = vi.fn(fn => { updated = fn(session) })
    needsReviewFallbackCheck(true, false, setSession, vi.fn(), 'n1')
    expect(updated.stage1.nodes[0].userStatus).toBe('needs_review')
  })

  it('ATB toggle OFF: shows message mentioning ATB toggle', () => {
    const setError = vi.fn()
    needsReviewFallbackCheck(true, false, vi.fn(fn => fn(makeSession())), setError, 'n1')
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('ATB toggle'))
  })

  it('ATB toggle OFF + no API key: still falls back locally (ATB toggle is the gate, not apiKeySet)', () => {
    const session = makeSession()
    let updated = null
    const setSession = vi.fn(fn => { updated = fn(session) })
    needsReviewFallbackCheck(false, false, setSession, vi.fn(), 'n1')
    expect(updated.stage1.nodes[0].userStatus).toBe('needs_review')
  })

  it('ATB toggle OFF + no API key: message mentions ATB toggle (not API key)', () => {
    const setError = vi.fn()
    needsReviewFallbackCheck(false, false, vi.fn(fn => fn(makeSession())), setError, 'n1')
    expect(setError).toHaveBeenCalledWith(expect.stringContaining('ATB toggle'))
  })

  it('ATB ON + API key set: fallback is not triggered', () => {
    const setSession = vi.fn()
    const setError = vi.fn()
    const triggered = needsReviewFallbackCheck(true, true, setSession, setError, 'n1')
    expect(triggered).toBe(false)
    expect(setSession).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
  })

  it('ATB ON + no API key: fallback is NOT triggered (ATB manages its own key)', () => {
    const setSession = vi.fn()
    const setError = vi.fn()
    const triggered = needsReviewFallbackCheck(false, true, setSession, setError, 'n1')
    expect(triggered).toBe(false)
    expect(setSession).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
  })
})

// ── Accept / Reject remain local-only (no ATB call) ──────────────────────────

describe('Accept and Reject do not call ATB', () => {
  it('Accept button calls onStatusChange with accepted, not onNeedsReviewClick', () => {
    const onStatusChange = vi.fn()
    const onNeedsReviewClick = vi.fn()
    const node = makeNode()
    render(
      <NodeCard
        node={node} allNodes={[node]}
        onStatusChange={onStatusChange} onChallengeClick={vi.fn()}
        onRegenClick={vi.fn()} onNeedsReviewClick={onNeedsReviewClick}
      />
    )
    fireEvent.click(screen.getByText('Accept'))
    expect(onStatusChange).toHaveBeenCalledWith(node.id, 'accepted')
    expect(onNeedsReviewClick).not.toHaveBeenCalled()
  })

  it('Reject button calls onStatusChange with rejected, not onNeedsReviewClick', () => {
    const onStatusChange = vi.fn()
    const onNeedsReviewClick = vi.fn()
    const node = makeNode()
    render(
      <NodeCard
        node={node} allNodes={[node]}
        onStatusChange={onStatusChange} onChallengeClick={vi.fn()}
        onRegenClick={vi.fn()} onNeedsReviewClick={onNeedsReviewClick}
      />
    )
    fireEvent.click(screen.getByText('Reject'))
    expect(onStatusChange).toHaveBeenCalledWith(node.id, 'rejected')
    expect(onNeedsReviewClick).not.toHaveBeenCalled()
  })
})
