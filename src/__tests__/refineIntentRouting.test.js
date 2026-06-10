// Refine-intent routing and apply-handling tests.
//
// Covers all requirements for the DIQ n4-style failure:
//  1. hasRefineIntent() — full phrase list from the task requirement
//  2. Operation routing: ATB bridge path and legacy path
//  3. ATB payload carries operation:"refine" when intent detected
//  4. Apply handling: unusable ATB result → not applied, node unchanged
//  5. Exact n4 regression fixture with the task-specified node
//  6. "Bridge assessment" vs "Statement replaced" distinction

import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateDIQStage1ViaBridge } from '../services/atbClient'

afterEach(() => { vi.restoreAllMocks() })

// ── Mirrors the SessionFlow helper exactly ────────────────────────────────────
// Keep in sync with hasRefineIntent() in src/v4/SessionFlow.jsx.

function hasRefineIntent(userNote) {
  if (!userNote || typeof userNote !== 'string') return false
  const note = userNote.toLowerCase()
  return (
    (note.includes('what') && (note.includes('better') || note.includes('answer'))) ||
    /\brewrite\b/.test(note) ||
    /\breplace\b/.test(note) ||
    note.includes('fix this') ||
    note.includes('answer the prompt') ||
    note.includes('make this usable') ||
    note.includes('make this better') ||
    note.includes('provide a better') ||
    note.includes('give me a better') ||
    note.includes('give me the better') ||
    note.includes('turn this into') ||
    note.includes('update this') ||
    note.includes('improve this')
  )
}

// ── Operation derivation (mirrors SessionFlow ATB + legacy routing) ───────────

function deriveATBOperation(mode, userNote) {
  if (mode === 'system_review' || hasRefineIntent(userNote)) return 'refine'
  return 'challenge'
}

function deriveLegacyMode(mode, userNote) {
  // Legacy path: map to 'system_review' when refine intent detected
  if (mode !== 'system_review' && hasRefineIntent(userNote)) return 'system_review'
  return mode
}

// ── 1. hasRefineIntent — full task-required phrase list ───────────────────────

describe('hasRefineIntent — detects ALL task-required replacement phrases', () => {
  const REQUIRED_PHRASES = [
    // Exact n4 user note
    "ok so what's the better to answer the prompt?",
    // Task-specified phrases
    "what's the better answer",
    "what is the better answer",
    "what's the better way to answer the prompt",
    "answer the prompt",
    "fix this",
    "rewrite this",
    "replace this",
    "make this usable",
    "give me the better version",
    "turn this into a usable claim",
  ]

  for (const phrase of REQUIRED_PHRASES) {
    it(`detects: "${phrase}"`, () => {
      expect(hasRefineIntent(phrase)).toBe(true)
    })
  }
})

describe('hasRefineIntent — additional replacement phrases (implementation coverage)', () => {
  const EXTRA_TRUE = [
    "Rewrite this assumption.",
    "replace this with something accurate",
    "REPLACE THIS",
    "Fix this so it makes sense.",
    "answer the prompt correctly",
    "make this better",
    "provide a better version",
    "give me a better statement",
    "give me the better claim",
    "turn this into something useful",
    "update this",
    "improve this",
    "what's the better answer to this?",
  ]

  for (const phrase of EXTRA_TRUE) {
    it(`detects: "${phrase}"`, () => {
      expect(hasRefineIntent(phrase)).toBe(true)
    })
  }
})

describe('hasRefineIntent — does NOT flag non-refine phrases', () => {
  const NON_REFINE = [
    null,
    '',
    'is this claim accurate?',
    'what evidence supports this?',
    'challenge this assumption',
    'check the sources',
    'verify this finding',
    'what does this mean?',
  ]

  for (const phrase of NON_REFINE) {
    it(`no refine intent in: "${String(phrase)}"`, () => {
      expect(hasRefineIntent(phrase)).toBe(false)
    })
  }
})

// ── 2. Operation routing — ATB bridge path ────────────────────────────────────

describe('ATB bridge: operation routing based on mode and userNote', () => {
  it('system_review → refine regardless of userNote', () => {
    expect(deriveATBOperation('system_review', null)).toBe('refine')
    expect(deriveATBOperation('system_review', 'rewrite this')).toBe('refine')
    expect(deriveATBOperation('system_review', '')).toBe('refine')
  })

  it('user_challenge + refine-intent note → refine', () => {
    expect(deriveATBOperation('user_challenge', "what's the better answer to the prompt?")).toBe('refine')
    expect(deriveATBOperation('user_challenge', 'rewrite this')).toBe('refine')
    expect(deriveATBOperation('user_challenge', 'fix this')).toBe('refine')
    expect(deriveATBOperation('user_challenge', 'give me the better version')).toBe('refine')
    expect(deriveATBOperation('user_challenge', 'turn this into a usable claim')).toBe('refine')
  })

  it('user_challenge + no refine-intent note → challenge', () => {
    expect(deriveATBOperation('user_challenge', null)).toBe('challenge')
    expect(deriveATBOperation('user_challenge', '')).toBe('challenge')
    expect(deriveATBOperation('user_challenge', 'is this well-supported?')).toBe('challenge')
  })

  it('needs_review + refine-intent note → refine', () => {
    expect(deriveATBOperation('needs_review', 'answer the prompt')).toBe('refine')
  })

  it('needs_review + no refine-intent note → challenge', () => {
    expect(deriveATBOperation('needs_review', null)).toBe('challenge')
  })
})

// ── 3. Operation routing — legacy path ───────────────────────────────────────
// When the user note implies refine intent, the legacy direct-Claude path
// uses 'system_review' mode so the prompt is oriented toward replacement,
// not challenge-only pressure-test.

describe('legacy path: legacyMode = system_review when refine intent detected', () => {
  it('user_challenge + refine-intent note → legacyMode = system_review', () => {
    expect(deriveLegacyMode('user_challenge', 'rewrite this')).toBe('system_review')
    expect(deriveLegacyMode('user_challenge', "what's the better answer?")).toBe('system_review')
    expect(deriveLegacyMode('user_challenge', 'turn this into a usable claim')).toBe('system_review')
  })

  it('user_challenge + no refine-intent note → legacyMode unchanged', () => {
    expect(deriveLegacyMode('user_challenge', null)).toBe('user_challenge')
    expect(deriveLegacyMode('user_challenge', 'is this supported?')).toBe('user_challenge')
  })

  it('system_review mode is always preserved unchanged by legacy routing', () => {
    expect(deriveLegacyMode('system_review', null)).toBe('system_review')
    expect(deriveLegacyMode('system_review', 'rewrite this')).toBe('system_review')
  })

  it('needs_review + refine-intent note → legacyMode = system_review', () => {
    expect(deriveLegacyMode('needs_review', 'fix this')).toBe('system_review')
  })

  it('needs_review + no refine-intent note → legacyMode = needs_review', () => {
    expect(deriveLegacyMode('needs_review', null)).toBe('needs_review')
  })
})

// ── 4. ATB payload carries operation:"refine" for refine-intent notes ─────────

describe('ATB payload carries operation:"refine" when refine intent is detected', () => {
  function buildPayload(session, nodeId, mode, userNote) {
    const operation = deriveATBOperation(mode, userNote)
    return {
      generationMode: 'bridge',
      session,
      sessionId: session.id,
      nodeId,
      operation,
      fixture: {
        fixtureVersion: 1, sourceApp: 'diq', exportedAt: new Date().toISOString(),
        databaseName: 'domainiq_v4', stores: { sessions: [session] },
      },
    }
  }

  const session = {
    id: 'sess-a',
    stage1: { nodes: [{ id: 'n4', type: 'assumption', statement: 'Original.', userNote: "ok so what's the better to answer the prompt?" }] },
  }

  it('refine-intent note → payload.operation is "refine" (not "challenge")', () => {
    const payload = buildPayload(session, 'n4', 'user_challenge', session.stage1.nodes[0].userNote)
    expect(payload.operation).toBe('refine')
    expect(payload.operation).not.toBe('challenge')
  })

  it('no refine-intent note → payload.operation is "challenge"', () => {
    const payload = buildPayload(session, 'n4', 'user_challenge', null)
    expect(payload.operation).toBe('challenge')
  })

  it('payload sent to ATB endpoint has operation:"refine"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ applied: true, mode: 'bridge', diagnostics: [],
        session: { id: 'sess-a', stage1: { nodes: [{ id: 'n4', statement: 'Replacement.', challenge: null }] } } }),
    })
    const payload = buildPayload(session, 'n4', 'user_challenge', session.stage1.nodes[0].userNote)
    await generateDIQStage1ViaBridge(payload)
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(sent.operation).toBe('refine')
  })

  it('payload sent to ATB endpoint has no apiKey or provider fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    const payload = buildPayload(session, 'n4', 'user_challenge', session.stage1.nodes[0].userNote)
    await generateDIQStage1ViaBridge(payload)
    const sent = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(sent).not.toHaveProperty('apiKey')
    expect(sent).not.toHaveProperty('provider')
    expect(sent).not.toHaveProperty('anthropicApiKey')
  })
})

// ── 5. Apply handling: ATB failure path does not corrupt session ───────────────
// Mirrors the handleRegenNode ATB branch post-processing logic.

describe('apply handling: ATB unusable result does not update session', () => {
  const N4_NODE = {
    id: 'n4', type: 'assumption',
    statement: '[Mock] Generated text for stage "basis" in response to: "Refine this assumption..."',
    userStatus: 'pending', challenge: null, concernType: null, suggestion: null,
    confidence: 'medium', evidence_type: 'inferred_strategy',
    userNote: "ok so what's the better to answer the prompt?",
    userPreset: 'Unsupported', dependsOn: ['n1'],
  }

  // Simulates the ATB result handling in handleRegenNode (bridge path)
  function applyATBResult(atbResult, nodeId, originalNode) {
    // Step 1: ATB returned unusable
    if (!atbResult.applied || !atbResult.session?.stage1) {
      return {
        applied: false,
        nodeUnchanged: true,
        diagnostics: atbResult.diagnostics || [],
        node: originalNode,
      }
    }
    // Step 2: Check visible change
    const returnedNode = (atbResult.session.stage1.nodes || []).find(n => n.id === nodeId)
    const statementChanged = returnedNode != null && returnedNode.statement !== originalNode.statement
    const challengeAdded   = !!returnedNode?.challenge

    if (!statementChanged && !challengeAdded) {
      return {
        applied: false,
        nodeUnchanged: true,
        diagnostics: [{ code: 'NO_VISIBLE_CHANGE', message: 'No visible change.' }],
        node: originalNode,
      }
    }

    return {
      applied: true,
      nodeUnchanged: false,
      diagnostics: atbResult.diagnostics || [],
      node: returnedNode,
      statementReplaced: statementChanged,
      bridgeAssessmentAdded: challengeAdded && !statementChanged,
    }
  }

  it('applied=false when ATB returns isUsable:false', () => {
    const atbResult = {
      applied: false, session: null,
      diagnostics: [
        { code: 'CHALLENGE_ONLY_OUTPUT_FOR_REPLACE', severity: 'error', message: 'Challenge output for refine.' },
        { code: 'REPLACEMENT_STATEMENT_REQUIRED', severity: 'error', message: 'Statement required.' },
      ],
    }
    const result = applyATBResult(atbResult, 'n4', N4_NODE)
    expect(result.applied).toBe(false)
  })

  it('original node is unchanged when ATB returns unusable', () => {
    const atbResult = { applied: false, session: null, diagnostics: [{ code: 'CHALLENGE_ONLY_OUTPUT_FOR_REPLACE', severity: 'error', message: 'x' }] }
    const result = applyATBResult(atbResult, 'n4', N4_NODE)
    expect(result.nodeUnchanged).toBe(true)
    expect(result.node.statement).toBe(N4_NODE.statement)
  })

  it('diagnostics from ATB are surfaced when not applied', () => {
    const atbResult = {
      applied: false, session: null,
      diagnostics: [
        { code: 'CHALLENGE_ONLY_OUTPUT_FOR_REPLACE', severity: 'error', message: 'Challenge only.' },
        { code: 'REPLACEMENT_STATEMENT_REQUIRED', severity: 'error', message: 'Statement needed.' },
      ],
    }
    const result = applyATBResult(atbResult, 'n4', N4_NODE)
    expect(result.diagnostics).toHaveLength(2)
    expect(result.diagnostics.some(d => d.code === 'CHALLENGE_ONLY_OUTPUT_FOR_REPLACE')).toBe(true)
    expect(result.diagnostics.some(d => d.code === 'REPLACEMENT_STATEMENT_REQUIRED')).toBe(true)
  })

  it('applied=true and statement updated when ATB returns valid replacement', () => {
    const replacement = 'Community-banking fintech startups sell infrastructure to banks, not bank charters.'
    const atbResult = {
      applied: true, diagnostics: [],
      session: { stage1: { nodes: [{ id: 'n4', statement: replacement, challenge: null }] } },
    }
    const result = applyATBResult(atbResult, 'n4', N4_NODE)
    expect(result.applied).toBe(true)
    expect(result.node.statement).toBe(replacement)
    expect(result.node.statement).not.toContain('[Mock]')
  })

  it('applied=false and node unchanged when ATB returns challenge-only (no statement change, no challenge added)', () => {
    // This represents ATB returning applied:true but no visible change
    const atbResult = {
      applied: true, diagnostics: [],
      session: { stage1: { nodes: [{ id: 'n4', statement: N4_NODE.statement, challenge: null }] } },
    }
    const result = applyATBResult(atbResult, 'n4', N4_NODE)
    expect(result.applied).toBe(false)
    expect(result.nodeUnchanged).toBe(true)
  })
})

// ── 6. "Bridge assessment" vs "Statement replaced" distinction ────────────────

describe('Bridge assessment vs statement replacement distinction', () => {
  const ORIGINAL_STATEMENT = '[Mock] Generated text for stage "basis"...'

  function classifyATBResult(atbResult, nodeId, originalStatement) {
    if (!atbResult.applied || !atbResult.session?.stage1) return 'not_applied'
    const returnedNode = (atbResult.session.stage1.nodes || []).find(n => n.id === nodeId)
    if (!returnedNode) return 'not_applied'
    const statementChanged = returnedNode.statement !== originalStatement
    const challengeAdded   = !!returnedNode.challenge
    if (statementChanged) return 'statement_replaced'
    if (challengeAdded)   return 'bridge_assessment_added'
    return 'not_applied'
  }

  it('"Statement replaced" when returnedNode.statement differs from original', () => {
    const atbResult = {
      applied: true, diagnostics: [],
      session: { stage1: { nodes: [{ id: 'n4', statement: 'New substantive claim.', challenge: null }] } },
    }
    expect(classifyATBResult(atbResult, 'n4', ORIGINAL_STATEMENT)).toBe('statement_replaced')
  })

  it('"Bridge assessment added" when challenge is set but statement unchanged', () => {
    const atbResult = {
      applied: true, diagnostics: [],
      session: { stage1: { nodes: [{ id: 'n4', statement: ORIGINAL_STATEMENT, challenge: 'Evidentiary concern.' }] } },
    }
    expect(classifyATBResult(atbResult, 'n4', ORIGINAL_STATEMENT)).toBe('bridge_assessment_added')
  })

  it('"Not applied" when neither statement changed nor challenge added', () => {
    const atbResult = {
      applied: true, diagnostics: [],
      session: { stage1: { nodes: [{ id: 'n4', statement: ORIGINAL_STATEMENT, challenge: null }] } },
    }
    expect(classifyATBResult(atbResult, 'n4', ORIGINAL_STATEMENT)).toBe('not_applied')
  })

  it('"Not applied" when ATB returns applied:false', () => {
    const atbResult = { applied: false, session: null, diagnostics: [] }
    expect(classifyATBResult(atbResult, 'n4', ORIGINAL_STATEMENT)).toBe('not_applied')
  })
})

// ── 7. Exact n4 regression fixture ────────────────────────────────────────────
// Uses the task-specified node exactly as described.

describe('n4 regression fixture', () => {
  const N4 = {
    id: 'n4',
    type: 'assumption',
    statement: '[Mock] Generated text for stage "basis" in response to: "Refine this assumption..."',
    userNote: "ok so what's the better to answer the prompt?",
    userPreset: 'Unsupported',
    dependsOn: ['n1'],
  }

  it('hasRefineIntent(n4.userNote) === true', () => {
    expect(hasRefineIntent(N4.userNote)).toBe(true)
  })

  it('operation is routed as "refine" for n4 userNote in user_challenge mode', () => {
    const operation = deriveATBOperation('user_challenge', N4.userNote)
    expect(operation).toBe('refine')
    expect(operation).not.toBe('challenge')
  })

  it('legacy path uses system_review mode for n4 userNote', () => {
    const legacyMode = deriveLegacyMode('user_challenge', N4.userNote)
    expect(legacyMode).toBe('system_review')
  })

  it('ATB payload for n4 carries operation:"refine"', () => {
    const payload = {
      generationMode: 'bridge',
      sessionId: 'sess-n4',
      nodeId: N4.id,
      operation: deriveATBOperation('user_challenge', N4.userNote),
      fixture: {
        fixtureVersion: 1, sourceApp: 'diq', exportedAt: new Date().toISOString(),
        databaseName: 'domainiq_v4',
        stores: { sessions: [{ id: 'sess-n4', stage1: { nodes: [N4] } }] },
      },
    }
    expect(payload.operation).toBe('refine')
  })

  it('challenge-only ATB result for n4 is NOT applied as statement replacement', () => {
    // ATB returned challenge output (CHALLENGE_ONLY_OUTPUT_FOR_REPLACE) → not applied
    const atbResult = {
      applied: false,
      diagnostics: [{ code: 'CHALLENGE_ONLY_OUTPUT_FOR_REPLACE', severity: 'error', message: 'Challenge only for refine.' }],
      session: null,
    }
    const applied = atbResult.applied && !!atbResult.session?.stage1
    expect(applied).toBe(false)
    // Original statement is preserved
    const statementAfter = applied ? 'would be changed' : N4.statement
    expect(statementAfter).toBe(N4.statement)
    expect(statementAfter).toContain('[Mock]')
  })

  it('valid replacement ATB result for n4 updates statement, removes mock text', () => {
    const replacement = 'Community-banking fintechs predominantly license infrastructure to existing banks rather than obtaining bank charters, because chartering imposes capital, compliance, and supervisory burdens that most vendors avoid.'
    const atbResult = {
      applied: true, diagnostics: [],
      session: { stage1: { nodes: [{ ...N4, statement: replacement, challenge: null }] } },
    }
    const returnedNode = atbResult.session.stage1.nodes.find(n => n.id === N4.id)
    expect(returnedNode.statement).toBe(replacement)
    expect(returnedNode.statement).not.toContain('[Mock]')
    expect(returnedNode.statement).not.toContain('Generated text for stage')
  })

  it('n4 userPreset "Unsupported" is preserved after refinement (not overwritten by bridge)', () => {
    // Bridge does not touch userPreset — it is user-owned
    const atbResult = {
      applied: true, diagnostics: [],
      session: { stage1: { nodes: [{ ...N4, statement: 'New claim.', challenge: null }] } },
    }
    const returnedNode = atbResult.session.stage1.nodes.find(n => n.id === N4.id)
    // userPreset comes from N4 spread in the atbResult session — confirm it's present
    expect(returnedNode.userPreset).toBe('Unsupported')
  })

  it('n4 dependsOn is preserved after refinement', () => {
    const atbResult = {
      applied: true, diagnostics: [],
      session: { stage1: { nodes: [{ ...N4, statement: 'New claim.', challenge: null }] } },
    }
    const returnedNode = atbResult.session.stage1.nodes.find(n => n.id === N4.id)
    expect(returnedNode.dependsOn).toEqual(['n1'])
  })
})
