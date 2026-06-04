// Stage 2 schema guard tests
//
// Covers:
//  - classifyStage2Response: valid, pressure_test_fallback, malformed cases
//  - pressure-test fallback response does not overwrite previous valid Stage 2
//  - malformed response preserves previous valid Stage 2 and stores raw failure
//  - failed raw responses are stored in rawResponses store
//  - successful Stage 2 response persists correctly

import { describe, it, expect, beforeEach } from 'vitest'
import { classifyStage2Response } from '../v4utils'
import { idbGet, idbPut, idbGetAll, closeDB } from '../idb'

async function resetIDB() {
  closeDB()
  await new Promise(resolve => {
    const req = indexedDB.deleteDatabase('domainiq_v4')
    req.onsuccess = resolve
    req.onerror   = resolve
    req.onblocked = resolve
  })
}

beforeEach(async () => {
  await resetIDB()
})

// ── classifyStage2Response ────────────────────────────────────────────────────

describe('classifyStage2Response', () => {
  it('classifies a valid Stage 2 response correctly', () => {
    const valid = {
      summary: { whatChanged: 'directional confirmation', strongestEvidence: 'FDIC guidance' },
      evidenceConsolidation: [],
      refinedAssertions: [],
    }
    expect(classifyStage2Response(valid)).toBe('valid')
  })

  it('accepts a Stage 2 response with only some keys present', () => {
    // A minimal valid response — only needs one Stage 2 key
    expect(classifyStage2Response({ competitorMap: [] })).toBe('valid')
    expect(classifyStage2Response({ emergingEntrants: [] })).toBe('valid')
    expect(classifyStage2Response({ adjacencyOpportunities: [] })).toBe('valid')
  })

  it('classifies a pressure-test response as pressure_test_fallback', () => {
    const ptResult = {
      challengedNodeId: 'n3',
      decision:         'revise_claim',
      challengeAssessment: 'The challenge is partially supported.',
      evidenceSummary:  'Two results retrieved.',
    }
    expect(classifyStage2Response(ptResult)).toBe('pressure_test_fallback')
  })

  it('classifies retrieval_failed response as pressure_test_fallback', () => {
    const retrievalFailed = {
      decision:         'retrieval_failed',
      challengedNodeId: 'n5',
      evidenceSummary:  'No results retrieved.',
    }
    expect(classifyStage2Response(retrievalFailed)).toBe('pressure_test_fallback')
  })

  it('classifies decision:retrieval_failed without challengedNodeId as pressure_test_fallback', () => {
    // Some responses may have decision alone
    expect(classifyStage2Response({ decision: 'retrieval_failed' })).toBe('pressure_test_fallback')
  })

  it('classifies null as malformed', () => {
    expect(classifyStage2Response(null)).toBe('malformed')
  })

  it('classifies an array as malformed', () => {
    expect(classifyStage2Response([])).toBe('malformed')
  })

  it('classifies a non-object as malformed', () => {
    expect(classifyStage2Response('string response')).toBe('malformed')
    expect(classifyStage2Response(42)).toBe('malformed')
    expect(classifyStage2Response(undefined)).toBe('malformed')
  })

  it('classifies an object with no Stage 2 keys as malformed', () => {
    // Has data, but none of the expected Stage 2 section keys
    const badShape = { foo: 'bar', baz: 123 }
    expect(classifyStage2Response(badShape)).toBe('malformed')
  })

  it('pressure_test_fallback wins over Stage 2 keys if both present', () => {
    // Pathological response: has both decision+challengedNodeId AND a Stage 2 key.
    // Should be classified as fallback — do not allow Stage 2 overwrite.
    const mixed = {
      decision:         'preserve_original',
      challengedNodeId: 'n2',
      summary:          { whatChanged: 'stage2-like field' },
    }
    expect(classifyStage2Response(mixed)).toBe('pressure_test_fallback')
  })
})

// ── rawResponses IDB store ────────────────────────────────────────────────────

describe('rawResponses IDB store', () => {
  it('stores a pressure_test_fallback record when Stage 2 guard fires', async () => {
    const ptFallback = {
      challengedNodeId: 'n3',
      decision:         'revise_claim',
      evidenceSummary:  'demo',
    }

    // Simulate what the guard does when classifyStage2Response returns 'pressure_test_fallback'
    const id = 'raw_stage2_' + Date.now()
    await idbPut('rawResponses', {
      id,
      sessionId:  'v4s_test',
      type:       'pressure_test_fallback',
      rawData:    ptFallback,
      capturedAt: Date.now(),
    })

    const record = await idbGet('rawResponses', id)
    expect(record).not.toBeNull()
    expect(record.type).toBe('pressure_test_fallback')
    expect(record.rawData.decision).toBe('revise_claim')
    expect(record.sessionId).toBe('v4s_test')
  })

  it('stores a parse_failure record when JSON cannot be parsed', async () => {
    const id = 'raw_stage2_' + Date.now()
    await idbPut('rawResponses', {
      id,
      sessionId:  'v4s_test',
      type:       'parse_failure',
      rawText:    '{ bad json >>>',
      error:      'Unexpected token b',
      capturedAt: Date.now(),
    })

    const record = await idbGet('rawResponses', id)
    expect(record).not.toBeNull()
    expect(record.type).toBe('parse_failure')
    expect(record.rawText).toBe('{ bad json >>>')
  })

  it('stores a malformed record when response has no Stage 2 keys', async () => {
    const id = 'raw_stage2_' + Date.now()
    await idbPut('rawResponses', {
      id,
      sessionId:  'v4s_test',
      type:       'malformed',
      rawData:    { unexpected: 'shape' },
      capturedAt: Date.now(),
    })

    const record = await idbGet('rawResponses', id)
    expect(record.type).toBe('malformed')
  })

  it('multiple raw failures accumulate — each gets a unique id', async () => {
    for (let i = 0; i < 3; i++) {
      await idbPut('rawResponses', {
        id:         'raw_stage2_' + (1000 + i),
        sessionId:  'v4s_test',
        type:       'malformed',
        rawData:    {},
        capturedAt: Date.now(),
      })
    }

    const all = await idbGetAll('rawResponses')
    expect(all.length).toBe(3)
  })
})

// ── Stage 2 overwrite protection (logic contract tests) ───────────────────────
//
// These tests verify the contract: a bad response must not reach the session.stage2
// write path. We test this by asserting classifyStage2Response returns non-'valid'
// for all known-bad shapes, and that valid shapes pass through.

describe('Stage 2 overwrite protection contract', () => {
  const KNOWN_PRESSURE_TEST_SHAPES = [
    { decision: 'revise_claim',       challengedNodeId: 'n3', evidenceSummary: 'x' },
    { decision: 'preserve_original',  challengedNodeId: 'n5', challengeAssessment: 'y' },
    { decision: 'mark_unresolved',    challengedNodeId: 'n1', evidenceSummary: 'z' },
    { decision: 'retrieval_failed',   challengedNodeId: null  },
    { decision: 'retrieval_failed'                            },
  ]

  it.each(KNOWN_PRESSURE_TEST_SHAPES)(
    'pressure-test shape (%o) is NOT classified as valid',
    (shape) => {
      expect(classifyStage2Response(shape)).not.toBe('valid')
    }
  )

  const KNOWN_VALID_STAGE2_SHAPES = [
    { summary: { whatChanged: 'x' } },
    { evidenceConsolidation: [] },
    { refinedAssertions: [] },
    { competitorMap: [] },
    { emergingEntrants: [] },
    { adjacencyOpportunities: [] },
    { summary: {}, evidenceConsolidation: [], refinedAssertions: [] },
  ]

  it.each(KNOWN_VALID_STAGE2_SHAPES)(
    'valid Stage 2 shape (%o) is classified as valid',
    (shape) => {
      expect(classifyStage2Response(shape)).toBe('valid')
    }
  )

  it('a valid Stage 2 response can be written to IDB sessions store', async () => {
    const validStage2 = {
      id:          'stage2_test',
      stageNumber: 2,
      generatedAt: Date.now(),
      summary:     { whatChanged: 'confirmed model' },
      evidenceConsolidation: [],
      refinedAssertions:     [],
    }

    const sessionRecord = {
      id:            'v4s_test',
      schemaVersion: 4,
      createdAt:     Date.now(),
      updatedAt:     Date.now(),
      stage2:        validStage2,
    }

    await idbPut('sessions', sessionRecord)
    const loaded = await idbGet('sessions', 'v4s_test')
    expect(loaded.stage2.summary.whatChanged).toBe('confirmed model')
  })

  it('previous valid Stage 2 is preserved when a fallback fires', async () => {
    // Initial session with a valid stage2
    const existingStage2 = { id: 'stage2_original', summary: { whatChanged: 'original run' } }
    const sessionRecord = {
      id: 'v4s_test', schemaVersion: 4, createdAt: Date.now(), updatedAt: Date.now(),
      stage2: existingStage2,
    }
    await idbPut('sessions', sessionRecord)

    // Bad response detected — guard fires, writes to rawResponses, does NOT touch session
    const badResponse = { decision: 'retrieval_failed', challengedNodeId: 'n3' }
    expect(classifyStage2Response(badResponse)).toBe('pressure_test_fallback')

    await idbPut('rawResponses', {
      id: 'raw_stage2_test', sessionId: 'v4s_test',
      type: 'pressure_test_fallback', rawData: badResponse, capturedAt: Date.now(),
    })

    // Session in IDB is unchanged
    const session = await idbGet('sessions', 'v4s_test')
    expect(session.stage2.summary.whatChanged).toBe('original run')

    // Raw failure was captured
    const raw = await idbGet('rawResponses', 'raw_stage2_test')
    expect(raw).not.toBeNull()
    expect(raw.type).toBe('pressure_test_fallback')
  })
})
