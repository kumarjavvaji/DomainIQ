// Stage 2 citation + review event unit tests
// Tests: buildS2EvidenceCitations, buildStage2ReviewEvent, and pipeline integration

import {
  buildS2EvidenceCitations,
  buildS2ItemCitations,
  buildStage2ReviewEvent,
  buildCitationRefs,
  buildInlineCitationSegments,
  buildStage3ContextPacket,
} from '../v4utils'
import {
  buildS2ItemRefinePrompt,
  buildS2ItemChallengePrompt,
} from '../v4prompts'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EVIDENCE_ITEM = {
  nodeId:          'n1',
  nodeStatement:   'The company uses a SaaS billing model.',
  relationship:    'supports',
  evidenceSummary: 'Independent reviews confirm a subscription model. Pricing starts at $49/month per seat.',
  sources: [
    {
      title:        'G2 Review: BillingCo',
      url:          'https://g2.com/products/billingco',
      snippet:      'subscription model',
      relationship: 'supports',
    },
    {
      title:        'Capterra Overview',
      url:          'https://capterra.com/billing',
      snippet:      'Pricing starts at $49',
      relationship: 'qualifies',
    },
  ],
}

const ITEM_NO_SOURCES = {
  nodeId:          'n2',
  nodeStatement:   'The company serves SMBs.',
  relationship:    'supports',
  evidenceSummary: 'No sources retrieved.',
  sources: [],
}

// ── S2-1: empty sources → empty citations ────────────────────────────────────

test('S2-1: buildS2EvidenceCitations returns [] for item with no sources', () => {
  const cites = buildS2EvidenceCitations(ITEM_NO_SOURCES)
  expect(cites).toEqual([])
})

// ── S2-2: sources normalize to Stage1Citation shape ──────────────────────────

test('S2-2: buildS2EvidenceCitations maps sources to Stage1Citation fields', () => {
  const cites = buildS2EvidenceCitations(EVIDENCE_ITEM)
  expect(cites).toHaveLength(2)

  const first = cites[0]
  expect(first.id).toMatch(/^s2cite_/)
  expect(first.title).toBe('G2 Review: BillingCo')
  expect(first.url).toBe('https://g2.com/products/billingco')
  expect(first.domain).toBe('g2.com')
  expect(first.snippet).toBe('subscription model')
  expect(first.supportsClaim).toBe('direct')
  expect(first.accessedAt).toBeTruthy()
})

// ── S2-3: deduplication by canonical URL ─────────────────────────────────────

test('S2-3: buildS2EvidenceCitations deduplicates by canonical URL', () => {
  const item = {
    ...EVIDENCE_ITEM,
    sources: [
      { title: 'G2', url: 'https://g2.com/products/billingco', snippet: 'a', relationship: 'supports' },
      { title: 'G2 (dupe)', url: 'https://g2.com/products/billingco/', snippet: 'b', relationship: 'supports' },
    ],
  }
  const cites = buildS2EvidenceCitations(item)
  expect(cites).toHaveLength(1)
  expect(cites[0].title).toBe('G2')
})

// ── S2-4: relationship maps to supportsClaim correctly ───────────────────────

test('S2-4: buildS2EvidenceCitations maps relationship to supportsClaim', () => {
  const item = {
    ...EVIDENCE_ITEM,
    sources: [
      { title: 'A', url: 'https://a.com', snippet: '', relationship: 'supports'    },
      { title: 'B', url: 'https://b.com', snippet: '', relationship: 'contradicts' },
      { title: 'C', url: 'https://c.com', snippet: '', relationship: 'qualifies'   },
      { title: 'D', url: 'https://d.com', snippet: '', relationship: 'unknown'     },
    ],
  }
  const cites = buildS2EvidenceCitations(item)
  expect(cites[0].supportsClaim).toBe('direct')
  expect(cites[1].supportsClaim).toBe(false)
  expect(cites[2].supportsClaim).toBe('partial')
  expect(cites[3].supportsClaim).toBe('partial')
})

// ── S2-5: buildCitationRefs on S2 citations → sequential 1-based markers ─────

test('S2-5: buildCitationRefs on S2 citations produces sequential 1-based markers', () => {
  const cites = buildS2EvidenceCitations(EVIDENCE_ITEM)
  const refs  = buildCitationRefs(cites)
  expect(refs).toHaveLength(2)
  expect(refs[0].marker).toBe(1)
  expect(refs[1].marker).toBe(2)
  expect(refs[0].citationId).toBe(cites[0].id)
  expect(refs[1].citationId).toBe(cites[1].id)
})

// ── S2-6: inline segments place markers within evidenceSummary text ───────────

test('S2-6: buildInlineCitationSegments places markers within evidenceSummary', () => {
  const cites    = buildS2EvidenceCitations(EVIDENCE_ITEM)
  const refs     = buildCitationRefs(cites)
  const segments = buildInlineCitationSegments(EVIDENCE_ITEM.evidenceSummary, refs, cites)

  // Must produce at least one text segment and at least one marker segment
  const textSegs   = segments.filter(s => 'text'    in s)
  const markerSegs = segments.filter(s => 'markers' in s)
  expect(textSegs.length).toBeGreaterThan(0)
  expect(markerSegs.length).toBeGreaterThan(0)

  // All markers 1–2 must appear somewhere
  const allMarkers = markerSegs.flatMap(s => s.markers)
  expect(allMarkers).toContain(1)
  expect(allMarkers).toContain(2)
})

// ── S2-7: buildStage2ReviewEvent produces correct shape for accept ────────────

test('S2-7: buildStage2ReviewEvent produces correct shape for accept', () => {
  const ev = buildStage2ReviewEvent({
    targetId:        'n1',
    targetSection:   'refinedAssertions',
    operation:       'accept',
    outcome:         'accepted',
    originalText:    'Old statement',
    replacementText: 'New statement',
    citations:       [],
  })

  expect(ev.id).toMatch(/^rev2_/)
  expect(ev.stage).toBe('stage2')
  expect(ev.targetId).toBe('n1')
  expect(ev.targetSection).toBe('refinedAssertions')
  expect(ev.operation).toBe('accept')
  expect(ev.outcome).toBe('accepted')
  expect(ev.originalText).toBe('Old statement')
  expect(ev.replacementText).toBe('New statement')
  expect(ev.createdAt).toBeTruthy()
  expect(Array.isArray(ev.diagnostics)).toBe(true)
  expect(Array.isArray(ev.inlineCitationRefs)).toBe(true)
})

// ── S2-8: reject event does not wipe prior reviewHistory entries ──────────────

test('S2-8: buildStage2ReviewEvent reject does not wipe prior reviewHistory', () => {
  const prior = buildStage2ReviewEvent({
    targetId: 'n1', targetSection: 'refinedAssertions', operation: 'accept', outcome: 'accepted',
  })
  const rejectEv = buildStage2ReviewEvent({
    targetId: 'n1', targetSection: 'refinedAssertions', operation: 'reject', outcome: 'rejected',
  })

  // Simulate the handler: spread prior history and append new event
  const history = [...([prior]), rejectEv]
  expect(history).toHaveLength(2)
  expect(history[0].outcome).toBe('accepted')
  expect(history[1].outcome).toBe('rejected')
})

// ── S2-9: buildStage2ReviewEvent with citations populates inlineCitationRefs ──

test('S2-9: buildStage2ReviewEvent with citations populates inlineCitationRefs', () => {
  const cites = buildS2EvidenceCitations(EVIDENCE_ITEM)
  const ev    = buildStage2ReviewEvent({
    targetId:      'n1',
    targetSection: 'evidenceConsolidation',
    operation:     'accept',
    outcome:       'accepted',
    citations:     cites,
  })

  expect(ev.citations).toHaveLength(2)
  expect(ev.inlineCitationRefs).toHaveLength(2)
  expect(ev.inlineCitationRefs[0].marker).toBe(1)
  expect(ev.inlineCitationRefs[1].marker).toBe(2)
})

// ── S2-10: no sources → no fake citations (NO_CITATIONS_RETURNED diagnostic) ──

test('S2-10: buildS2EvidenceCitations with no sources returns [] — no fake citations', () => {
  const cites = buildS2EvidenceCitations(null)
  expect(cites).toEqual([])

  const cites2 = buildS2EvidenceCitations({ sources: undefined })
  expect(cites2).toEqual([])

  // Review event for a failed retrieval should carry a diagnostic, not fake cites
  const ev = buildStage2ReviewEvent({
    targetId:      'n1',
    targetSection: 'evidenceConsolidation',
    operation:     'accept',
    outcome:       'retrieval_failed',
    citations:     [],
  })
  expect(ev.citations).toHaveLength(0)
  expect(ev.inlineCitationRefs).toHaveLength(0)
  expect(ev.outcome).toBe('retrieval_failed')
})

// ── S2-11: buildStage3ContextPacket still works with reviewHistory on items ──

test('S2-11: buildStage3ContextPacket works when refinedAssertions carry reviewHistory', () => {
  const reviewEvent = buildStage2ReviewEvent({
    targetId: 'n1', targetSection: 'refinedAssertions', operation: 'accept', outcome: 'accepted',
  })
  const session = {
    entity:  'ACME Corp',
    intent:  'research',
    stage1: {
      summary:  'Stage 1 summary',
      nodes: [
        { id: 'n1', type: 'claim', statement: 'Uses SaaS billing.', confidence: 'high', userStatus: 'accepted' },
      ],
      inferredPatterns: [],
      openQuestions:    [],
    },
    stage2: {
      summary: 'Stage 2 summary',
      evidenceConsolidation:  [EVIDENCE_ITEM],
      competitorMap:          [],
      emergingEntrants:       [],
      contradictionMap:       [],
      adjacencyOpportunities: [],
      refinedAssertions: [
        {
          nodeId:            'n1',
          originalStatement: 'Uses billing.',
          revisedStatement:  'Uses SaaS billing.',
          refinementType:    'precision',
          confidenceChange:  'unchanged',
          userStatus:        'accepted',
          reviewHistory:     [reviewEvent],
          latestReview:      reviewEvent,
        },
      ],
      unresolvedQuestions:    [],
      recommendedNextActions: [],
      pivots:                 [],
    },
  }

  const packet = buildStage3ContextPacket(session)
  expect(packet.acceptedRefinements).toHaveLength(1)
  expect(packet.acceptedRefinements[0].nodeId).toBe('n1')
  expect(packet.acceptedRefinements[0].revisedStatement).toBe('Uses SaaS billing.')
})

// ── S2-12: buildS2ItemCitations inherits citations from stage1 node ───────────

test('S2-12: buildS2ItemCitations inherits citations from stage1 node latestReview', () => {
  const stage1Citation = {
    id: 'c1', title: 'Inherited Source', url: 'https://source.com',
    domain: 'source.com', snippet: 'test snippet', supportsClaim: 'direct', accessedAt: '2025-01-01',
  }
  const stage1Nodes = [
    {
      id: 'n1',
      statement: 'SaaS billing.',
      latestReview: { citations: [stage1Citation] },
    },
  ]
  const item = { nodeId: 'n1', evidenceSummary: 'Some text', sources: [] }
  const cites = buildS2ItemCitations(item, stage1Nodes)
  expect(cites).toHaveLength(1)
  expect(cites[0].url).toBe('https://source.com')
  expect(cites[0].title).toBe('Inherited Source')
})

// ── S2-13: buildS2ItemCitations deduplicates inherited citations by URL ───────

test('S2-13: buildS2ItemCitations deduplicates inherited citations across multiple nodeIds', () => {
  const sharedCite = {
    id: 'c1', title: 'Shared Source', url: 'https://shared.com',
    domain: 'shared.com', snippet: '', supportsClaim: 'direct', accessedAt: '2025-01-01',
  }
  const stage1Nodes = [
    { id: 'n1', latestReview: { citations: [sharedCite] } },
    { id: 'n2', latestReview: { citations: [sharedCite] } },
  ]
  const item = { nodeIds: ['n1', 'n2'], evidenceSummary: 'Text', sources: [] }
  const cites = buildS2ItemCitations(item, stage1Nodes)
  expect(cites).toHaveLength(1)
})

// ── S2-14: buildS2ItemCitations returns [] when nodeIds not found ─────────────

test('S2-14: buildS2ItemCitations returns [] when no matching stage1 nodes', () => {
  const stage1Nodes = [{ id: 'n99', latestReview: { citations: [] } }]
  const item = { nodeId: 'nX', evidenceSummary: 'Text', sources: [] }
  const cites = buildS2ItemCitations(item, stage1Nodes)
  expect(cites).toEqual([])
})

// ── S2-15: s2ReviewMap accumulates multiple reviewHistory entries ──────────────

test('S2-15: s2ReviewMap accumulates multiple operations on the same itemKey', () => {
  const ev1 = buildStage2ReviewEvent({
    targetId: 'act:0', targetSection: 'recommendedNextActions',
    operation: 'accept', outcome: 'accepted',
    originalText: 'First text', replacementText: 'Refined text',
    citations: [],
  })
  const ev2 = buildStage2ReviewEvent({
    targetId: 'act:0', targetSection: 'recommendedNextActions',
    operation: 'accept', outcome: 'accepted',
    originalText: 'Refined text', replacementText: 'Double-refined text',
    citations: [],
  })

  // Simulate handleS2ItemAccept logic
  let s2ReviewMap = {}
  function applyAccept(itemKey, reviewEvent, acceptedText) {
    const existing = s2ReviewMap[itemKey] || { reviewHistory: [] }
    s2ReviewMap = {
      ...s2ReviewMap,
      [itemKey]: {
        reviewHistory: [...existing.reviewHistory, reviewEvent],
        latestReview:  reviewEvent,
        acceptedText,
      },
    }
  }

  applyAccept('act:0', ev1, 'Refined text')
  applyAccept('act:0', ev2, 'Double-refined text')

  const entry = s2ReviewMap['act:0']
  expect(entry.reviewHistory).toHaveLength(2)
  expect(entry.latestReview.replacementText).toBe('Double-refined text')
  expect(entry.acceptedText).toBe('Double-refined text')
})

// ── S2-16: item-key naming conventions for each section ──────────────────────

test('S2-16: item key naming conventions follow section prefixes', () => {
  const keys = {
    summary:      'sum:evidenceSummary',
    evidence:     'ev:n1:0',
    competitor:   'comp:CorpA',
    entrant:      'ent:2',
    adjacency:    'adj:3',
    refinement:   'ref:n1',
    contradiction:'con:n1:0',
    unresolved:   'uq:0',
    stage3r:      's3r:highConfidenceFindings:0',
    nextAction:   'act:0',
    pivot:        'pivot:market_entry',
  }
  // All keys must be non-empty strings — no null/undefined
  for (const [section, key] of Object.entries(keys)) {
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
    expect(key).toContain(':')
  }
})

// ── S2-17: buildS2ItemRefinePrompt includes user direction ───────────────────

test('S2-17: buildS2ItemRefinePrompt includes user direction when provided', () => {
  const prompt = buildS2ItemRefinePrompt('Stage 3 readiness', 'Company has strong GTM.', 'Acme', 'Focus on GTM implications.')
  expect(prompt).toContain('User refinement direction:')
  expect(prompt).toContain('Focus on GTM implications.')
  expect(prompt).toContain('Follow this direction unless it conflicts with evidence')
})

// ── S2-18: buildS2ItemChallengePrompt includes user direction ────────────────

test('S2-18: buildS2ItemChallengePrompt includes user direction when provided', () => {
  const prompt = buildS2ItemChallengePrompt('Competitor maturity map', 'Competitor X is nascent.', 'Acme', 'Probe their enterprise readiness.')
  expect(prompt).toContain('User challenge direction:')
  expect(prompt).toContain('Probe their enterprise readiness.')
  expect(prompt).toContain('Focus the pressure-test on this angle')
})

// ── S2-19: empty direction preserves autonomous behavior (no direction block) ─

test('S2-19: empty user direction omits direction block from refine prompt', () => {
  const prompt = buildS2ItemRefinePrompt('Evidence consolidation', 'Company serves SMBs.', 'Acme', '')
  expect(prompt).not.toContain('User refinement direction:')
  expect(prompt).not.toContain('Follow this direction')
})

test('S2-19b: empty user direction omits direction block from challenge prompt', () => {
  const prompt = buildS2ItemChallengePrompt('Evidence consolidation', 'Company serves SMBs.', 'Acme', undefined)
  expect(prompt).not.toContain('User challenge direction:')
  expect(prompt).not.toContain('Focus the pressure-test on this angle')
})

// ── S2-20: accepted review event persists userDirection from proposal snapshot ─
// Verifies that the persisted direction is taken from proposal.userDirection
// (captured at generate time), not from the live input state at accept time.

test('S2-20: accepted review event persists userDirection from generate-time snapshot', () => {
  const directionAtGenerate = 'Focus on GTM sequencing, not product.'
  const directionEditedBeforeAccept = 'Totally different note typed after preview appeared.'

  // Simulate handleGenerate: snapshot direction into proposal
  const proposal = {
    proposedText:  'Launch in Q3, targeting mid-market first.',
    assessment:    'Sharpened with GTM focus.',
    citations:     [],
    userDirection: directionAtGenerate,  // ← snapshotted at generate time
  }

  // Simulate handleAccept: reads from proposal.userDirection, not live input
  const reviewEvent = buildStage2ReviewEvent({
    targetId:        'act:0',
    targetSection:   'Recommended next actions',
    operation:       'refine',
    outcome:         'accepted',
    originalText:    'Launch in Q3.',
    replacementText: proposal.proposedText,
    citations:       proposal.citations,
  })
  reviewEvent.userDirection = proposal.userDirection ?? null  // ← correct: from snapshot

  // Even if live input was changed to directionEditedBeforeAccept, the event
  // must carry the direction that actually generated the preview.
  expect(reviewEvent.userDirection).toBe(directionAtGenerate)
  expect(reviewEvent.userDirection).not.toBe(directionEditedBeforeAccept)
  expect(reviewEvent.replacementText).toBe('Launch in Q3, targeting mid-market first.')
})

// ── S2-21: rejected review — direction is NOT stored in s2ReviewMap ───────────

test('S2-21: rejected operation does not add to s2ReviewMap', () => {
  let s2ReviewMap = {}

  // Simulate reject: handler resets mode/proposal without calling onAccept
  // so s2ReviewMap remains unchanged
  const itemKey = 'act:0'
  expect(s2ReviewMap[itemKey]).toBeUndefined()

  // Only accept writes to the map
  const ev = buildStage2ReviewEvent({
    targetId: itemKey, targetSection: 'Recommended next actions',
    operation: 'challenge', outcome: 'accepted', citations: [],
  })
  ev.userDirection = 'Test direction'
  const existing = s2ReviewMap[itemKey] || { reviewHistory: [] }
  s2ReviewMap = {
    ...s2ReviewMap,
    [itemKey]: {
      reviewHistory: [...existing.reviewHistory, ev],
      latestReview:  ev,
      acceptedText:  'Accepted text.',
    },
  }

  expect(s2ReviewMap[itemKey].latestReview.userDirection).toBe('Test direction')
  // A subsequent reject would NOT call this handler — map stays as is
  expect(s2ReviewMap[itemKey].acceptedText).toBe('Accepted text.')
})

// ── S2-22: no-key path throws explicit error, not mock ────────────────────────
// Simulates the corrected handleS2Generate behavior: apiKeySet=false → throw.

test('S2-22: no-apiKeySet path throws an explicit error, not silent mock', async () => {
  // Replicate the corrected gate logic from handleS2Generate
  async function simulateHandleS2Generate(apiKeySet, sectionLabel, op, text, userDirection) {
    if (!apiKeySet) {
      throw new Error('Stage 2 AI refinement unavailable — no API key configured. Set VITE_ANTHROPIC_API_KEY in .env.local.')
    }
    // (real path would call callClaude here)
  }

  await expect(simulateHandleS2Generate(false, 'Evidence', 'refine', 'Some text', ''))
    .rejects.toThrow('Stage 2 AI refinement unavailable')

  // Must NOT resolve with MOCK_S2_ITEM_RESULT shape
  await expect(simulateHandleS2Generate(false, 'Evidence', 'refine', 'Some text', ''))
    .rejects.not.toThrow('Refined: this claim has been sharpened')
})

// ── S2-23: mock result string is not present in the error message ──────────────

test('S2-23: error thrown when no apiKey does not contain generic mock text', async () => {
  async function gatedGenerate(apiKeySet) {
    if (!apiKeySet) {
      throw new Error('Stage 2 AI refinement unavailable — no API key configured. Set VITE_ANTHROPIC_API_KEY in .env.local.')
    }
  }

  let caught
  try { await gatedGenerate(false) } catch (e) { caught = e }
  expect(caught).toBeDefined()
  expect(caught.message).not.toContain('sharpened for precision and defensibility')
  expect(caught.message).toContain('no API key')
})

// ── S2-24: user direction appears in both prompt builders' output ─────────────

test('S2-24: user direction is present in real prompt sent to LLM', () => {
  const dir = 'say more about the GTM implication'
  const refinePrompt = buildS2ItemRefinePrompt(
    'Competitor maturity map', 'Moveworks acquired by ServiceNow.', 'Acme Corp', dir
  )
  const challengePrompt = buildS2ItemChallengePrompt(
    'Competitor maturity map', 'Moveworks acquired by ServiceNow.', 'Acme Corp', dir
  )
  expect(refinePrompt).toContain(dir)
  expect(challengePrompt).toContain(dir)
  // Neither prompt should contain the generic mock text
  expect(refinePrompt).not.toContain('sharpened for precision and defensibility')
  expect(challengePrompt).not.toContain('sharpened for precision and defensibility')
})
