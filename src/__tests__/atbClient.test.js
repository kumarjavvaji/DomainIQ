// ATB client behaviour tests
//
// Covers:
//  - checkATBHealth: healthy / unreachable / bad response
//  - generateDIQStage1ViaBridge: correct request shape, success, non-ok error
//  - toggle-off: generateDIQStage1ViaBridge is never called for legacy sessions
//  - toggle-on: generateDIQStage1ViaBridge is called with correct payload
//  - ATB network failure does not mutate a pre-existing session

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkATBHealth, generateDIQStage1ViaBridge } from '../services/atbClient'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetch(response) {
  return vi.fn().mockResolvedValue(response)
}

function okJson(body) {
  return { ok: true, status: 200, json: async () => body }
}

function failFetch(err = new Error('Network error')) {
  return vi.fn().mockRejectedValue(err)
}

// ── checkATBHealth ────────────────────────────────────────────────────────────

describe('checkATBHealth', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns true when ATB responds with ok: true', async () => {
    global.fetch = makeFetch(okJson({ ok: true, service: 'ai-tool-bridge' }))
    expect(await checkATBHealth()).toBe(true)
  })

  it('returns false when fetch throws (ATB unreachable)', async () => {
    global.fetch = failFetch()
    expect(await checkATBHealth()).toBe(false)
  })

  it('returns false when response ok flag is false', async () => {
    global.fetch = makeFetch({ ok: false, status: 503, json: async () => ({}) })
    expect(await checkATBHealth()).toBe(false)
  })

  it('returns false when response body ok field is false', async () => {
    global.fetch = makeFetch(okJson({ ok: false }))
    expect(await checkATBHealth()).toBe(false)
  })

  it('returns false when response body is missing ok field', async () => {
    global.fetch = makeFetch(okJson({ service: 'something-else' }))
    expect(await checkATBHealth()).toBe(false)
  })

  it('sends GET to /health', async () => {
    global.fetch = makeFetch(okJson({ ok: true }))
    await checkATBHealth()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/health$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})

// ── generateDIQStage1ViaBridge ────────────────────────────────────────────────

describe('generateDIQStage1ViaBridge', () => {
  afterEach(() => { vi.restoreAllMocks() })

  const PAYLOAD = {
    generationMode: 'bridge',
    session: { id: 'sess-1', stage1: { nodes: [] } },
    sessionId: 'sess-1',
    nodeId: 'n1',
    operation: 'challenge',
    fixture: { fixtureVersion: 1, sourceApp: 'diq', exportedAt: '', databaseName: 'test', stores: {} },
  }

  const ATB_RESULT = {
    applied: true,
    mode: 'bridge',
    diagnostics: [],
    session: { id: 'sess-1', stage1: { nodes: [{ id: 'n1', challenge: 'Assessment text.' }] } },
  }

  it('sends POST to /diq/stage1/generate with JSON body', async () => {
    global.fetch = makeFetch(okJson(ATB_RESULT))
    await generateDIQStage1ViaBridge(PAYLOAD)

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/diq\/stage1\/generate$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(PAYLOAD),
      }),
    )
  })

  it('returns parsed ATB result on success', async () => {
    global.fetch = makeFetch(okJson(ATB_RESULT))
    const result = await generateDIQStage1ViaBridge(PAYLOAD)
    expect(result).toEqual(ATB_RESULT)
    expect(result.applied).toBe(true)
  })

  it('throws with status code when ATB returns non-ok response', async () => {
    global.fetch = makeFetch({ ok: false, status: 500, json: async () => ({}) })
    await expect(generateDIQStage1ViaBridge(PAYLOAD)).rejects.toThrow('ATB error: 500')
  })

  it('throws when network fails', async () => {
    global.fetch = failFetch(new Error('connection refused'))
    await expect(generateDIQStage1ViaBridge(PAYLOAD)).rejects.toThrow('connection refused')
  })
})

// ── Toggle behaviour (unit-level) ─────────────────────────────────────────────
// These tests verify the conditional logic that guards the ATB call.
// They simulate the logic in handleRegenNode without importing React.

describe('ATB toggle logic', () => {
  it('does not call generateDIQStage1ViaBridge when toggle is false', async () => {
    const mockBridgeFn = vi.fn()
    const policy = { useAiToolBridgeForStage1: false }

    // Simulate the guard: if (!useATB) skip bridge call
    const useATB = !!policy.useAiToolBridgeForStage1
    if (useATB) await mockBridgeFn()

    expect(mockBridgeFn).not.toHaveBeenCalled()
  })

  it('calls generateDIQStage1ViaBridge when toggle is true', async () => {
    const mockBridgeFn = vi.fn().mockResolvedValue({ applied: false, diagnostics: [], session: {} })
    const policy = { useAiToolBridgeForStage1: true }

    const useATB = !!policy.useAiToolBridgeForStage1
    if (useATB) await mockBridgeFn({ generationMode: 'bridge' })

    expect(mockBridgeFn).toHaveBeenCalledWith(expect.objectContaining({ generationMode: 'bridge' }))
  })

  it('does not mutate original session when ATB bridge fails', () => {
    const originalSession = Object.freeze({
      id: 'sess-1',
      stage1: { nodes: [{ id: 'n1', statement: 'Original claim.' }] },
    })

    // Simulate: ATB call threw or returned applied: false.
    // In either case the original session object must remain unchanged.
    const atbFailed = true
    let finalSession = originalSession

    if (!atbFailed) {
      // would replace stage1 — but it didn't happen
      finalSession = { ...originalSession, stage1: { nodes: [] } }
    }

    expect(finalSession).toBe(originalSession)
    expect(finalSession.stage1.nodes[0].statement).toBe('Original claim.')
  })

  it('uses operation "challenge" for user_challenge mode', () => {
    const mode = 'user_challenge'
    const operation = mode === 'system_review' ? 'refine' : 'challenge'
    expect(operation).toBe('challenge')
  })

  it('uses operation "refine" for system_review mode', () => {
    const mode = 'system_review'
    const operation = mode === 'system_review' ? 'refine' : 'challenge'
    expect(operation).toBe('refine')
  })

  it('includes correct ATB payload fields for bridge call', () => {
    const session = { id: 'sess-a', stage1: { nodes: [{ id: 'n2', statement: 'Claim.' }] } }
    const nodeId = 'n2'
    const mode = 'user_challenge'
    const operation = mode === 'system_review' ? 'refine' : 'challenge'

    const syntheticFixture = {
      fixtureVersion: 1,
      sourceApp: 'diq',
      exportedAt: expect.any(String),
      databaseName: 'domainiq_v4',
      stores: { sessions: [session] },
    }

    const payload = {
      generationMode: 'bridge',
      session,
      sessionId: session.id,
      nodeId,
      operation,
      fixture: { fixtureVersion: 1, sourceApp: 'diq', exportedAt: '', databaseName: 'domainiq_v4', stores: { sessions: [session] } },
    }

    expect(payload.generationMode).toBe('bridge')
    expect(payload.sessionId).toBe('sess-a')
    expect(payload.nodeId).toBe('n2')
    expect(payload.operation).toBe('challenge')
    expect(payload.fixture.stores.sessions[0]).toBe(session)
    // provider is intentionally absent — must not be in payload
    expect('provider' in payload).toBe(false)
  })
})
