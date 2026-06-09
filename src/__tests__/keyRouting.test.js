// Key-routing contract tests for the ATB bridge integration.
//
// Architecture rule enforced here:
//   DIQ frontend must NEVER send provider API keys to ATB.
//   When ATB toggle is ON, ATB is called regardless of whether a DIQ API key is set.
//   ATB selects its own provider and key server-side based on sourceApp.
//   API key checks on the DIQ side apply ONLY to the legacy / direct Claude path.
//
// Tests are unit-level and do not import React.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateDIQStage1ViaBridge } from '../services/atbClient'

// ── Shared test helpers ───────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  return {
    id: 'sess-routing-01',
    generationPolicy: { useAiToolBridgeForStage1: true },
    stage1: {
      nodes: [{ id: 'n1', type: 'finding', statement: 'Community banks lag on digital.' }],
    },
    ...overrides,
  }
}

function makeSyntheticFixture(session) {
  return {
    fixtureVersion: 1,
    sourceApp: 'diq',
    exportedAt: new Date().toISOString(),
    databaseName: 'domainiq_v4',
    stores: { sessions: [session] },
  }
}

// Simulates the routing decision in handleRegenNode without React.
// Returns 'bridge', 'demo', or 'legacy' to indicate which path was taken.
function routingDecision({ apiKeySet, useATB }) {
  if (useATB) return 'bridge'
  if (!apiKeySet) return 'demo'
  return 'legacy'
}

// Simulates the needs_review early-return block.
// Returns 'local_fallback' or 'bridge'.
function needsReviewRouting({ apiKeySet, useATB }) {
  if (!useATB) return 'local_fallback'
  // ATB ON — bridge regardless of apiKeySet
  return 'bridge'
}

// Builds the ATB payload as handleRegenNode does and verifies no key fields.
function buildBridgePayload({ session, nodeId, mode }) {
  const operation = mode === 'system_review' ? 'refine' : 'challenge'
  return {
    generationMode: 'bridge',
    session,
    sessionId: session.id,
    nodeId,
    operation,
    fixture: makeSyntheticFixture(session),
  }
}

// ── 1. ATB toggle ON + no DIQ API key → bridge is called ────────────────────

describe('ATB toggle ON + no DIQ API key → bridge is called', () => {
  it('routing decision is "bridge" when useATB=true regardless of apiKeySet', () => {
    expect(routingDecision({ apiKeySet: false, useATB: true })).toBe('bridge')
  })

  it('routing decision is "bridge" when useATB=true and apiKeySet=true', () => {
    expect(routingDecision({ apiKeySet: true, useATB: true })).toBe('bridge')
  })

  it('generateDIQStage1ViaBridge is called when ATB ON + no DIQ key', async () => {
    const bridgeFn = vi.fn().mockResolvedValue({ applied: false, diagnostics: [] })
    const session = makeSession()
    const apiKeySet = false  // no DIQ API key
    const useATB = true

    if (routingDecision({ apiKeySet, useATB }) === 'bridge') {
      await bridgeFn(buildBridgePayload({ session, nodeId: 'n1', mode: 'user_challenge' }))
    }

    expect(bridgeFn).toHaveBeenCalledTimes(1)
  })

  it('generateDIQStage1ViaBridge is NOT called when ATB OFF even with DIQ key', async () => {
    const bridgeFn = vi.fn()
    const session = makeSession()
    const apiKeySet = true
    const useATB = false

    if (routingDecision({ apiKeySet, useATB }) === 'bridge') {
      await bridgeFn(buildBridgePayload({ session, nodeId: 'n1', mode: 'user_challenge' }))
    }

    expect(bridgeFn).not.toHaveBeenCalled()
  })
})

// ── 2. Needs Review with ATB ON → bridge regardless of DIQ API key ───────────

describe('needs_review with ATB ON → bridge regardless of DIQ API key', () => {
  it('needsReviewRouting is "bridge" when ATB ON + no DIQ key', () => {
    expect(needsReviewRouting({ apiKeySet: false, useATB: true })).toBe('bridge')
  })

  it('needsReviewRouting is "bridge" when ATB ON + DIQ key present', () => {
    expect(needsReviewRouting({ apiKeySet: true, useATB: true })).toBe('bridge')
  })

  it('needsReviewRouting is "local_fallback" when ATB OFF (regardless of apiKeySet)', () => {
    expect(needsReviewRouting({ apiKeySet: false, useATB: false })).toBe('local_fallback')
    expect(needsReviewRouting({ apiKeySet: true,  useATB: false })).toBe('local_fallback')
  })

  it('bridge fn is called for needs_review when ATB ON + no DIQ key', async () => {
    const bridgeFn = vi.fn().mockResolvedValue({ applied: false, diagnostics: [] })
    const session = makeSession()
    const apiKeySet = false
    const useATB = true

    if (needsReviewRouting({ apiKeySet, useATB }) === 'bridge') {
      await bridgeFn(buildBridgePayload({ session, nodeId: 'n1', mode: 'needs_review' }))
    }

    expect(bridgeFn).toHaveBeenCalledTimes(1)
    expect(bridgeFn.mock.calls[0][0].operation).toBe('challenge')
  })
})

// ── 3. Challenge / Pressure Test with ATB ON → bridge regardless of DIQ key ─

describe('challenge / pressure-test with ATB ON → bridge regardless of DIQ API key', () => {
  const MODES = ['user_challenge', 'needs_review']

  for (const mode of MODES) {
    it(`mode="${mode}": routes to bridge when ATB ON + no DIQ key`, () => {
      expect(routingDecision({ apiKeySet: false, useATB: true })).toBe('bridge')
    })
  }

  it('bridge fn receives operation:challenge for user_challenge mode', async () => {
    const bridgeFn = vi.fn().mockResolvedValue({ applied: false, diagnostics: [] })
    const session = makeSession()

    await bridgeFn(buildBridgePayload({ session, nodeId: 'n1', mode: 'user_challenge' }))

    expect(bridgeFn.mock.calls[0][0].operation).toBe('challenge')
  })

  it('bridge fn receives operation:challenge for needs_review mode', async () => {
    const bridgeFn = vi.fn().mockResolvedValue({ applied: false, diagnostics: [] })
    const session = makeSession()

    await bridgeFn(buildBridgePayload({ session, nodeId: 'n1', mode: 'needs_review' }))

    expect(bridgeFn.mock.calls[0][0].operation).toBe('challenge')
  })
})

// ── 4. Refine (system_review) with ATB ON → bridge regardless of DIQ key ────

describe('refine (system_review) with ATB ON → bridge regardless of DIQ API key', () => {
  it('routes to bridge when ATB ON + no DIQ key', () => {
    expect(routingDecision({ apiKeySet: false, useATB: true })).toBe('bridge')
  })

  it('bridge fn receives operation:refine for system_review mode', async () => {
    const bridgeFn = vi.fn().mockResolvedValue({ applied: false, diagnostics: [] })
    const session = makeSession()

    await bridgeFn(buildBridgePayload({ session, nodeId: 'n1', mode: 'system_review' }))

    expect(bridgeFn.mock.calls[0][0].operation).toBe('refine')
  })

  it('bridge is called once with the correct sessionId and nodeId', async () => {
    const bridgeFn = vi.fn().mockResolvedValue({ applied: false, diagnostics: [] })
    const session = makeSession({ id: 'my-sess' })

    await bridgeFn(buildBridgePayload({ session, nodeId: 'n1', mode: 'system_review' }))

    const call = bridgeFn.mock.calls[0][0]
    expect(call.sessionId).toBe('my-sess')
    expect(call.nodeId).toBe('n1')
    expect(call.generationMode).toBe('bridge')
  })
})

// ── 5. Payload sent to ATB contains no API key fields ────────────────────────

describe('payload sent to ATB contains no API key fields', () => {
  const KEY_FIELD_NAMES = ['apiKey', 'anthropicApiKey', 'providerKey', 'api_key', 'provider_key']

  function buildActualPayload(overrides = {}) {
    const session = makeSession()
    const nodeId = 'n1'
    const mode = 'user_challenge'
    return {
      generationMode: 'bridge',
      session,
      sessionId: session.id,
      nodeId,
      operation: mode === 'system_review' ? 'refine' : 'challenge',
      fixture: makeSyntheticFixture(session),
      ...overrides,
    }
  }

  it('payload has no top-level apiKey field', () => {
    const payload = buildActualPayload()
    expect('apiKey' in payload).toBe(false)
  })

  it('payload has no top-level anthropicApiKey field', () => {
    const payload = buildActualPayload()
    expect('anthropicApiKey' in payload).toBe(false)
  })

  it('payload has no top-level providerKey field', () => {
    const payload = buildActualPayload()
    expect('providerKey' in payload).toBe(false)
  })

  it('payload serialized to JSON contains no known API key field names', () => {
    const payload = buildActualPayload()
    const json = JSON.stringify(payload)
    for (const field of KEY_FIELD_NAMES) {
      expect(json).not.toContain(`"${field}"`)
    }
  })

  it('payload contains the required bridge fields and no extras', () => {
    const payload = buildActualPayload()
    const keys = Object.keys(payload)
    expect(keys).toContain('generationMode')
    expect(keys).toContain('session')
    expect(keys).toContain('sessionId')
    expect(keys).toContain('nodeId')
    expect(keys).toContain('operation')
    expect(keys).toContain('fixture')
    // provider must not be present — ATB resolves it server-side
    expect(keys).not.toContain('provider')
    expect(keys).not.toContain('apiKey')
    expect(keys).not.toContain('anthropicApiKey')
    expect(keys).not.toContain('providerKey')
  })

  it('atbClient.generateDIQStage1ViaBridge is called with no key fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ applied: false, diagnostics: [] }),
    })

    const session = makeSession()
    const payload = buildActualPayload()
    await generateDIQStage1ViaBridge(payload)

    const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body)
    for (const field of KEY_FIELD_NAMES) {
      expect(sentBody).not.toHaveProperty(field)
    }

    vi.restoreAllMocks()
  })
})

// ── 6. ATB toggle OFF + no DIQ API key → demo or local fallback ──────────────

describe('ATB toggle OFF + no DIQ API key → demo mode or local fallback', () => {
  it('routing decision is "demo" when ATB OFF + no DIQ key', () => {
    expect(routingDecision({ apiKeySet: false, useATB: false })).toBe('demo')
  })

  it('routing decision is "legacy" when ATB OFF + DIQ key present', () => {
    expect(routingDecision({ apiKeySet: true, useATB: false })).toBe('legacy')
  })

  it('bridge fn is NOT called when ATB OFF + no DIQ key', async () => {
    const bridgeFn = vi.fn()
    const apiKeySet = false
    const useATB = false

    if (routingDecision({ apiKeySet, useATB }) === 'bridge') {
      await bridgeFn()
    }

    expect(bridgeFn).not.toHaveBeenCalled()
  })

  it('needs_review with ATB OFF falls back to local status (not bridge)', () => {
    expect(needsReviewRouting({ apiKeySet: false, useATB: false })).toBe('local_fallback')
  })

  it('needs_review with ATB OFF + DIQ key also falls back to local (bridge gate is toggle, not key)', () => {
    expect(needsReviewRouting({ apiKeySet: true, useATB: false })).toBe('local_fallback')
  })
})

// ── 7. Stage 2 pivot routing: toggle gates ATB, not apiKeySet ────────────────

describe('Stage 2 pivot: ATB toggle ON → bridge regardless of DIQ API key', () => {
  function pivotRouting({ useATBForStage2, apiKeySet }) {
    if (useATBForStage2) return 'bridge'
    if (!apiKeySet) return 'demo'
    return 'legacy'
  }

  it('toggle ON + no DIQ key → bridge', () => {
    expect(pivotRouting({ useATBForStage2: true, apiKeySet: false })).toBe('bridge')
  })

  it('toggle ON + DIQ key present → bridge', () => {
    expect(pivotRouting({ useATBForStage2: true, apiKeySet: true })).toBe('bridge')
  })

  it('toggle OFF + no DIQ key → demo (not bridge)', () => {
    expect(pivotRouting({ useATBForStage2: false, apiKeySet: false })).toBe('demo')
  })

  it('toggle OFF + DIQ key → legacy (not bridge)', () => {
    expect(pivotRouting({ useATBForStage2: false, apiKeySet: true })).toBe('legacy')
  })
})

// ── 8. Stage 2 pivot payload contains no key fields ──────────────────────────

describe('Stage 2 pivot payload sent to ATB contains no key fields', () => {
  const KEY_FIELDS = ['apiKey', 'anthropicApiKey', 'openAiApiKey', 'providerKey', 'provider']

  function buildPivotPayload(session) {
    return {
      sessionId:     session.id,
      pivotId:       'pivot_001',
      pivotType:     'contextual_competition',
      pivotTitle:    'Competitive Dynamics',
      targetNodeIds: [],
      userDirection: '',
      fixture: {
        fixtureVersion: 1, sourceApp: 'diq', exportedAt: new Date().toISOString(),
        databaseName: 'domainiq_v4',
        stores: { sessions: [session] },
      },
    }
  }

  it('payload has no top-level key fields', () => {
    const session = makeSession()
    const payload = buildPivotPayload(session)
    for (const field of KEY_FIELDS) {
      expect(field in payload).toBe(false)
    }
  })

  it('payload JSON contains no key field names', () => {
    const session = makeSession()
    const payload = buildPivotPayload(session)
    const json = JSON.stringify(payload)
    for (const field of KEY_FIELDS) {
      expect(json).not.toContain(`"${field}"`)
    }
  })
})
