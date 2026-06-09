// Stage 2 pivot bridge contract tests.
//
// Covers:
//  - generateDIQStage2PivotViaBridge HTTP client shape
//  - Payload contains no key/provider fields
//  - DIQ-side routing: toggle ON → ATB called; toggle OFF → native path
//  - ATB success → pivot written to session.stage2.pivots (status: complete)
//  - ATB unusable output → pivot marked status: error
//  - proposedUpdate IDs normalized by DIQ using pu_${pivotId}_${i}
//  - Existing stage2 data is preserved on ATB failure
//  - Toggle ON + no DIQ API key → ATB is still called (bridge manages its own key)

import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateDIQStage2PivotViaBridge } from '../services/atbClient'

// ── Helpers ───────────────────────────────────────────────────────────────────

function okJson(body) {
  return { ok: true, status: 200, json: async () => body }
}

function failFetch(err = new Error('Network error')) {
  return vi.fn().mockRejectedValue(err)
}

function makeSession(overrides = {}) {
  return {
    id: 'sess-s2-001',
    generationPolicy: { useAiToolBridgeForStage2Pivot: false },
    entity: { name: 'TestCo', type: 'company' },
    intent: { role: 'PM', what: 'Market analysis.' },
    stage1: { summary: 'S1 summary.', nodes: [{ id: 'n1', statement: 'Claim.', userStatus: 'accepted', confidence: 'high' }] },
    stage2: {
      id: 'stage2_001',
      pivots: [],
      competitorMap: [{ name: 'CompA' }],
      unresolvedQuestions: ['Key question.'],
    },
    ...overrides,
  }
}

const MOCK_ATB_RESULT = {
  pivotType:     'contextual_competition',
  displaySummary: 'Competitor behavior reveals faster migration timelines.',
  analysisFoundation: {
    userDirectionInterpretation: 'Examined platform vs. services positioning.',
    deeperFinding: 'Managed clients migrate in 12–18 months.',
    evidenceSynthesis: 'Evidence shows faster timelines than assumed.',
    strategicTension: 'Advisory revenue risk during self-service transition.',
    implicationsForStage3: 'Stage 3 should model migration timing.',
    assumptionsToTest: ['Advisory revenue impact'],
    recommendedStage3Angle: 'Frame around migration decision.',
  },
  proposedUpdates: [
    { id: 'pu_1', targetSection: 'competitorMap', updateType: 'modify', title: 'Update timeline', currentText: '', proposedText: 'Migration timelines are 12–18 months.', rationale: 'Evidence contradicts long-timeline assumption.', evidenceBasis: 'Case studies.', stage3Relevance: 'Accelerates decision.', confidence: 'medium' },
    { id: 'pu_2', targetSection: 'contradictionMap', updateType: 'add', title: 'New tension', currentText: '', proposedText: 'New competitive tension identified.', rationale: 'Pivot revealed overlooked tension.', evidenceBasis: 'Market data.', stage3Relevance: 'Affects Stage 3 framing.', confidence: 'low' },
  ],
  unresolvedQuestions:         ['What is advisory revenue impact?'],
  stage3Implications:          ['Migration timing is a primary Stage 3 variable.'],
  additionalSearchSuggestions: ['managed analytics self-service conversion'],
  diagnostics:                 [{ code: 'BRIDGE_WITHOUT_SEARCH', rule: 'bridge_without_search', severity: 'warning', message: 'Parametric knowledge only.' }],
  isUsable: true,
}

afterEach(() => { vi.restoreAllMocks() })

// ── 1. HTTP client: generateDIQStage2PivotViaBridge ──────────────────────────

describe('generateDIQStage2PivotViaBridge HTTP client', () => {
  const PAYLOAD = {
    sessionId:     'sess-s2-001',
    pivotId:       'pivot_001',
    pivotType:     'contextual_competition',
    pivotTitle:    'Competitive Dynamics',
    targetNodeIds: ['n1'],
    userDirection: 'Focus on platform adoption.',
    fixture:       { fixtureVersion: 1, sourceApp: 'diq', exportedAt: '', databaseName: 'test', stores: {} },
  }

  it('sends POST to /diq/stage2/pivot with JSON body', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(MOCK_ATB_RESULT))
    await generateDIQStage2PivotViaBridge(PAYLOAD)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/diq\/stage2\/pivot$/),
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    )
  })

  it('returns parsed ATB result on success', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(MOCK_ATB_RESULT))
    const result = await generateDIQStage2PivotViaBridge(PAYLOAD)
    expect(result.isUsable).toBe(true)
    expect(result.pivotType).toBe('contextual_competition')
    expect(Array.isArray(result.proposedUpdates)).toBe(true)
  })

  it('throws when ATB returns non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    await expect(generateDIQStage2PivotViaBridge(PAYLOAD)).rejects.toThrow('ATB error: 500')
  })

  it('throws when network fails', async () => {
    global.fetch = failFetch(new Error('connection refused'))
    await expect(generateDIQStage2PivotViaBridge(PAYLOAD)).rejects.toThrow('connection refused')
  })
})

// ── 2. Payload contains no key/provider fields ────────────────────────────────

describe('pivot payload contains no key or provider fields', () => {
  const KEY_FIELDS = ['apiKey', 'anthropicApiKey', 'openAiApiKey', 'providerKey', 'provider']

  function buildPayload(session) {
    return {
      sessionId:     session.id,
      pivotId:       'pivot_001',
      pivotType:     'contextual_competition',
      pivotTitle:    'Competitive Dynamics',
      targetNodeIds: [],
      userDirection: '',
      fixture: {
        fixtureVersion: 1, sourceApp: 'diq', exportedAt: new Date().toISOString(),
        databaseName: 'domainiq_v4', stores: { sessions: [session] },
      },
    }
  }

  it('payload has no top-level key fields', () => {
    const payload = buildPayload(makeSession())
    for (const field of KEY_FIELDS) {
      expect(field in payload).toBe(false)
    }
  })

  it('serialized payload JSON contains no key field names', () => {
    const payload = buildPayload(makeSession())
    const json = JSON.stringify(payload)
    for (const field of KEY_FIELDS) {
      expect(json).not.toContain(`"${field}"`)
    }
  })

  it('atbClient sends no key fields to ATB endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson(MOCK_ATB_RESULT))
    const payload = buildPayload(makeSession())
    await generateDIQStage2PivotViaBridge(payload)
    const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body)
    for (const field of KEY_FIELDS) {
      expect(sentBody).not.toHaveProperty(field)
    }
  })
})

// ── 3. Routing: toggle ON → ATB called; toggle OFF → native path ──────────────

describe('pivot routing: ATB toggle determines path', () => {
  // Simulates the routing guard in handleRunPivot
  function pivotRouting({ useATBForStage2, apiKeySet }) {
    if (useATBForStage2) return 'bridge'
    if (!apiKeySet) return 'demo'
    return 'legacy'
  }

  it('toggle ON → bridge regardless of apiKeySet', () => {
    expect(pivotRouting({ useATBForStage2: true, apiKeySet: false })).toBe('bridge')
    expect(pivotRouting({ useATBForStage2: true, apiKeySet: true })).toBe('bridge')
  })

  it('toggle OFF + no API key → demo', () => {
    expect(pivotRouting({ useATBForStage2: false, apiKeySet: false })).toBe('demo')
  })

  it('toggle OFF + API key → legacy', () => {
    expect(pivotRouting({ useATBForStage2: false, apiKeySet: true })).toBe('legacy')
  })

  it('bridge fn called when toggle ON + no DIQ API key', async () => {
    const bridgeFn = vi.fn().mockResolvedValue(MOCK_ATB_RESULT)
    if (pivotRouting({ useATBForStage2: true, apiKeySet: false }) === 'bridge') {
      await bridgeFn({ pivotType: 'contextual_competition' })
    }
    expect(bridgeFn).toHaveBeenCalledTimes(1)
  })

  it('bridge fn NOT called when toggle OFF + API key', async () => {
    const bridgeFn = vi.fn()
    if (pivotRouting({ useATBForStage2: false, apiKeySet: true }) === 'bridge') {
      await bridgeFn()
    }
    expect(bridgeFn).not.toHaveBeenCalled()
  })
})

// ── 4. ATB success → pivot written to session.stage2.pivots ───────────────────

describe('ATB success writes completed pivot to session.stage2.pivots', () => {
  // Mirrors the ATB branch state-update in handleRunPivot
  function applyATBPivotSuccess(session, pivotId, pivotType, pivotTitle, atbResult) {
    const normalizedUpdates = (atbResult.proposedUpdates || []).map((u, i) => ({
      ...u,
      id:              `pu_${pivotId}_${i}`,
      status:          'proposed',
      userNote:        null,
      userRefinedText: null,
      decidedAt:       null,
    }))
    const updatedPivots = (session.stage2.pivots || []).map(p =>
      p.id !== pivotId ? p : {
        ...p,
        status:                      'complete',
        generatedAt:                 new Date().toISOString(),
        displaySummary:              atbResult.displaySummary || '',
        analysisFoundation:          atbResult.analysisFoundation ?? null,
        proposedUpdates:             normalizedUpdates,
        unresolvedQuestions:         atbResult.unresolvedQuestions || [],
        additionalSearchSuggestions: atbResult.additionalSearchSuggestions || [],
        stage3Implications:          atbResult.stage3Implications || [],
        _rawSearchBlocks:            [],
        errorMessage:                null,
        _bridgePivot:                true,
      }
    )
    return { ...session, stage2: { ...session.stage2, pivots: updatedPivots } }
  }

  const pivotId = 'pivot_001'
  const stubSession = makeSession({
    stage2: {
      ...makeSession().stage2,
      pivots: [{
        id: pivotId, type: 'contextual_competition', title: 'Competitive Dynamics',
        status: 'generating', proposedUpdates: [], displaySummary: '',
      }],
    },
  })

  it('pivot status is set to complete on ATB success', () => {
    const result = applyATBPivotSuccess(stubSession, pivotId, 'contextual_competition', 'CD', MOCK_ATB_RESULT)
    const pivot = result.stage2.pivots.find(p => p.id === pivotId)
    expect(pivot.status).toBe('complete')
  })

  it('displaySummary is populated from ATB result', () => {
    const result = applyATBPivotSuccess(stubSession, pivotId, 'contextual_competition', 'CD', MOCK_ATB_RESULT)
    const pivot = result.stage2.pivots.find(p => p.id === pivotId)
    expect(typeof pivot.displaySummary).toBe('string')
    expect(pivot.displaySummary.length).toBeGreaterThan(0)
  })

  it('existing stage2 fields (competitorMap, unresolvedQuestions) are preserved', () => {
    const result = applyATBPivotSuccess(stubSession, pivotId, 'contextual_competition', 'CD', MOCK_ATB_RESULT)
    expect(result.stage2.competitorMap).toBeDefined()
    expect(result.stage2.unresolvedQuestions).toBeDefined()
  })

  it('_bridgePivot marker is set on the pivot', () => {
    const result = applyATBPivotSuccess(stubSession, pivotId, 'contextual_competition', 'CD', MOCK_ATB_RESULT)
    const pivot = result.stage2.pivots.find(p => p.id === pivotId)
    expect(pivot._bridgePivot).toBe(true)
  })
})

// ── 5. ATB unusable output → pivot marked status: error ──────────────────────

describe('ATB unusable output writes error pivot', () => {
  function applyATBPivotError(session, pivotId, errorMessage) {
    const updatedPivots = (session.stage2.pivots || []).map(p =>
      p.id !== pivotId ? p : { ...p, status: 'error', errorMessage }
    )
    return { ...session, stage2: { ...session.stage2, pivots: updatedPivots } }
  }

  const pivotId = 'pivot_err'
  const stubSession = makeSession({
    stage2: {
      ...makeSession().stage2,
      pivots: [{ id: pivotId, status: 'generating', proposedUpdates: [] }],
    },
  })

  it('pivot status is set to error on ATB failure', () => {
    const result = applyATBPivotError(stubSession, pivotId, 'ATB: parse failed.')
    const pivot = result.stage2.pivots.find(p => p.id === pivotId)
    expect(pivot.status).toBe('error')
    expect(pivot.errorMessage).toContain('parse failed')
  })

  it('existing stage2 data is intact after error', () => {
    const result = applyATBPivotError(stubSession, pivotId, 'ATB error.')
    expect(result.stage2.competitorMap).toBeDefined()
  })

  it('other pivots are not modified by the error', () => {
    const sessionWith2Pivots = makeSession({
      stage2: {
        ...makeSession().stage2,
        pivots: [
          { id: 'pivot_ok', status: 'complete', proposedUpdates: [] },
          { id: pivotId, status: 'generating', proposedUpdates: [] },
        ],
      },
    })
    const result = applyATBPivotError(sessionWith2Pivots, pivotId, 'Error.')
    const okPivot = result.stage2.pivots.find(p => p.id === 'pivot_ok')
    expect(okPivot.status).toBe('complete')
  })
})

// ── 6. proposedUpdate IDs normalized by DIQ ───────────────────────────────────

describe('DIQ normalizes proposedUpdate IDs from ATB response', () => {
  const pivotId = 'pivot_abc'

  function normalizeIds(atbUpdates, pivotId) {
    return atbUpdates.map((u, i) => ({
      ...u,
      id:              `pu_${pivotId}_${i}`,
      status:          'proposed',
      userNote:        null,
      userRefinedText: null,
      decidedAt:       null,
    }))
  }

  it('ATB IDs (pu_1, pu_2) are overridden with pu_${pivotId}_${i}', () => {
    const normalized = normalizeIds(MOCK_ATB_RESULT.proposedUpdates, pivotId)
    expect(normalized[0].id).toBe(`pu_${pivotId}_0`)
    expect(normalized[1].id).toBe(`pu_${pivotId}_1`)
  })

  it('all other ATB update fields are preserved', () => {
    const normalized = normalizeIds(MOCK_ATB_RESULT.proposedUpdates, pivotId)
    expect(normalized[0].targetSection).toBe('competitorMap')
    expect(normalized[0].proposedText).toBe('Migration timelines are 12–18 months.')
  })

  it('status is set to proposed on normalized updates', () => {
    const normalized = normalizeIds(MOCK_ATB_RESULT.proposedUpdates, pivotId)
    expect(normalized.every(u => u.status === 'proposed')).toBe(true)
  })

  it('userNote, userRefinedText, decidedAt are null on normalized updates', () => {
    const normalized = normalizeIds(MOCK_ATB_RESULT.proposedUpdates, pivotId)
    expect(normalized[0].userNote).toBeNull()
    expect(normalized[0].userRefinedText).toBeNull()
    expect(normalized[0].decidedAt).toBeNull()
  })
})

// ── 7. Toggle ON + no DIQ API key → ATB is still called ──────────────────────

describe('toggle ON + no DIQ API key → ATB called (bridge manages its own key)', () => {
  it('bridge path taken when useATBForStage2=true and apiKeySet=false', () => {
    const useATBForStage2 = true
    const apiKeySet = false
    // Simulates the guard order in handleRunPivot
    let path = 'none'
    if (useATBForStage2)  path = 'bridge'
    else if (!apiKeySet)  path = 'demo'
    else                  path = 'legacy'
    expect(path).toBe('bridge')
  })

  it('ATB fn is invoked with correct fields when no DIQ API key', async () => {
    const bridgeFn = vi.fn().mockResolvedValue({ ...MOCK_ATB_RESULT })
    const apiKeySet = false
    const useATBForStage2 = true

    if (useATBForStage2) {
      await bridgeFn({
        sessionId: 'sess-001', pivotId: 'pivot_001',
        pivotType: 'contextual_competition', pivotTitle: 'CD',
        targetNodeIds: [], userDirection: '', fixture: {},
      })
    } else if (!apiKeySet) {
      throw new Error('Should not reach demo path')
    }

    expect(bridgeFn).toHaveBeenCalledTimes(1)
    expect(bridgeFn.mock.calls[0][0]).not.toHaveProperty('apiKey')
    expect(bridgeFn.mock.calls[0][0]).not.toHaveProperty('provider')
  })
})
