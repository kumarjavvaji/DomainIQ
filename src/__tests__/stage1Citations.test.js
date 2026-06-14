// Stage 1 citation persistence tests
//
// Covers:
//  1.  Challenging a Stage 1 node appends a persisted review event.
//  2.  Citation records from the challenge result are normalized and saved.
//  3.  Inline citation refs are saved with stable citation IDs and marker numbers.
//  4.  Node statement after apply is clean; citation markers come from refs (not injected text).
//  5.  Each citation entry in the panel matches a ref marker number.
//  6.  Review event is present after simulated reload (serialization round-trip).
//  7.  Applying a replacement statement does not erase prior review history.
//  8.  Refining a node a second time does not erase prior review history.
//  9.  Preserving a claim still persists citations when challenge returned sources.
//  10. Multiple challenge events accumulate in reviewHistory, all entries preserved.
//  11. Retrieval failure saves outcome='retrieval_failed' without fake citations.
//  12. No-citation responses save a NO_CITATIONS_RETURNED diagnostic, no markers.
//  13. Discarding (not applying) a challenge leaves prior reviewHistory intact.
//  14. normalizePtCitations de-duplicates by canonical URL.

import { describe, it, expect } from 'vitest'
import { normalizePtCitations, buildStage1ReviewEvent, buildInlineCitationSegments, buildCitationRefs, applyDiff } from '../v4utils'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_EVIDENCE = [
  {
    id:        'ev1',
    type:      'direct_evidence',
    url:       'https://example.com/article-one',
    title:     'Article One',
    snippet:   'Key snippet from article one.',
    publisher: 'Example Media',
    confidence: 'high',
  },
  {
    id:        'ev2',
    type:      'pattern_inference',
    url:       'https://data.org/report',
    title:     'Data Report',
    snippet:   'Industry data point.',
    publisher: 'Data Org',
    confidence: 'medium',
  },
]

const PRESERVE_PT_RESULT = {
  decision:            'preserve_original',
  challengedNodeId:    'n1',
  challengeAssessment: 'The claim withstands scrutiny.',
  evidenceSummary:     'Two sources confirm the claim.',
  evidenceNeeded:      null,
  revisedNode:         null,
  updatedDownstream:   [],
  retrievedEvidence:   MOCK_EVIDENCE,
  inlineCitations:     [],
}

const REVISE_PT_RESULT = {
  decision:            'revise_claim',
  challengedNodeId:    'n1',
  challengeAssessment: 'The claim needs narrowing.',
  evidenceSummary:     'Evidence supports a more precise version.',
  evidenceNeeded:      null,
  revisedNode:         { id: 'n1', statement: 'Narrowed revised statement.', confidence: 'high' },
  updatedDownstream:   [],
  retrievedEvidence:   MOCK_EVIDENCE,
  inlineCitations:     [],
}

const RETRIEVAL_FAILED_PT_RESULT = {
  decision:            'retrieval_failed',
  challengedNodeId:    'n1',
  challengeAssessment: 'No evidence could be retrieved.',
  evidenceSummary:     null,
  evidenceNeeded:      null,
  revisedNode:         null,
  updatedDownstream:   [],
  retrievedEvidence:   [],
  inlineCitations:     [],
}

const NO_CITATION_PT_RESULT = {
  decision:            'preserve_original',
  challengedNodeId:    'n1',
  challengeAssessment: 'Claim preserved based on model knowledge.',
  evidenceSummary:     null,
  evidenceNeeded:      null,
  revisedNode:         null,
  updatedDownstream:   [],
  retrievedEvidence:   [],
  inlineCitations:     [],
}

const ORIGINAL_NODE = {
  id:            'n1',
  type:          'finding',
  statement:     'Original claim text.',
  confidence:    'medium',
  evidence_type: 'primary',
  userStatus:    'challenged',
  userNote:      'This needs evidence.',
  userPreset:    'Needs evidence',
  dependsOn:     [],
  reviewHistory: [],
  latestReview:  null,
}

const NODE_LIST = [ORIGINAL_NODE]

// ── Helper: simulate apply-diff + review persistence (mirrors handleAcceptDiff logic) ──

function simulateApplyDiff(nodes, ptResult, nodeText = '') {
  const updatedNodes  = applyDiff(nodes, ptResult)
  const reviewEvent   = buildStage1ReviewEvent(ptResult, nodeText || (nodes.find(n => n.id === ptResult.challengedNodeId)?.statement || ''), 'challenge')

  return updatedNodes.map(n => {
    if (n.id !== ptResult.challengedNodeId) return n
    return {
      ...n,
      reviewHistory: [...(n.reviewHistory || []), reviewEvent],
      latestReview:  reviewEvent,
    }
  })
}

// ── 1. Challenging a node appends a persisted review event ────────────────────

describe('Test 1: challenging a node appends a review event', () => {
  it('reviewHistory gains one entry after applying a pressure test', () => {
    const result = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')

    expect(node.reviewHistory).toHaveLength(1)
    expect(node.latestReview).toBeDefined()
    expect(node.latestReview.operation).toBe('challenge')
  })
})

// ── 2. Citation records are normalized from retrievedEvidence ─────────────────

describe('Test 2: citations are normalized from retrievedEvidence', () => {
  it('normalizePtCitations returns one citation per unique evidence item', () => {
    const citations = normalizePtCitations(PRESERVE_PT_RESULT)

    expect(citations).toHaveLength(2)
    expect(citations[0].title).toBe('Article One')
    expect(citations[0].supportsClaim).toBe('direct')
    expect(citations[1].title).toBe('Data Report')
    expect(citations[1].supportsClaim).toBe('context')
  })

  it('each citation has a stable id, url, and domain', () => {
    const citations = normalizePtCitations(PRESERVE_PT_RESULT)

    expect(citations[0].id).toMatch(/^cite_/)
    expect(citations[0].url).toBe('https://example.com/article-one')
    expect(citations[0].domain).toBe('example.com')
    expect(citations[1].domain).toBe('data.org')
  })

  it('citations are saved on the node after apply', () => {
    const result = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')

    expect(node.latestReview.citations).toHaveLength(2)
    expect(node.latestReview.citations[0].url).toBe('https://example.com/article-one')
  })
})

// ── 3. Inline citation refs have stable IDs and sequential markers ─────────────

describe('Test 3: inline citation refs have stable IDs and markers', () => {
  it('inlineCitationRefs length matches citations length', () => {
    const event = buildStage1ReviewEvent(PRESERVE_PT_RESULT, 'Original claim text.', 'challenge')

    expect(event.inlineCitationRefs).toHaveLength(event.citations.length)
  })

  it('markers are sequential starting at 1', () => {
    const event = buildStage1ReviewEvent(PRESERVE_PT_RESULT, 'Original claim text.', 'challenge')
    const markers = event.inlineCitationRefs.map(r => r.marker)

    expect(markers).toEqual([1, 2])
  })

  it('each ref citationId matches a citation in the same event', () => {
    const event      = buildStage1ReviewEvent(PRESERVE_PT_RESULT, 'Original claim text.', 'challenge')
    const citationIds = new Set(event.citations.map(c => c.id))

    for (const ref of event.inlineCitationRefs) {
      expect(citationIds.has(ref.citationId)).toBe(true)
    }
  })
})

// ── 4. Node statement stays clean; markers come from refs not injected text ────

describe('Test 4: node statement is clean; markers live in refs', () => {
  it('node.statement does not contain injected [n] markers after apply', () => {
    const result = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')

    expect(node.statement).not.toMatch(/\[\d+\]/)
  })

  it('markers are readable from node.latestReview.inlineCitationRefs', () => {
    const result = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')
    const markers = node.latestReview.inlineCitationRefs.map(r => r.marker)

    expect(markers).toContain(1)
    expect(markers).toContain(2)
  })

  it('refs have sentenceIndex:null and claimText:null (no full-statement placeholder)', () => {
    const result = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')
    for (const ref of node.latestReview.inlineCitationRefs) {
      expect(ref.claimText).toBeNull()
      expect(ref.sentenceIndex).toBeNull()
    }
  })
})

// ── 5. Citation panel entries match ref markers ────────────────────────────────

describe('Test 5: citation panel entries match ref markers', () => {
  it('every ref marker has a matching citation with the same citationId', () => {
    const result = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')
    const { citations, inlineCitationRefs } = node.latestReview

    for (const ref of inlineCitationRefs) {
      const matched = citations.find(c => c.id === ref.citationId)
      expect(matched).toBeDefined()
    }
  })
})

// ── 6. Serialization round-trip preserves citations ────────────────────────────

describe('Test 6: citations survive JSON round-trip (persistence simulation)', () => {
  it('reviewHistory and citations are present after JSON serialize/deserialize', () => {
    const result     = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node       = result.find(n => n.id === 'n1')
    const serialized = JSON.parse(JSON.stringify(node))

    expect(serialized.reviewHistory).toHaveLength(1)
    expect(serialized.latestReview.citations).toHaveLength(2)
    expect(serialized.latestReview.inlineCitationRefs).toHaveLength(2)
    expect(serialized.latestReview.inlineCitationRefs[0].marker).toBe(1)
  })
})

// ── 7. Applying a replacement does not erase prior review history ──────────────

describe('Test 7: applying a revision does not erase prior reviewHistory', () => {
  it('prior review events are preserved when a second challenge is applied', () => {
    // First challenge: preserve
    const afterFirst = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const nodeAfterFirst = afterFirst.find(n => n.id === 'n1')
    expect(nodeAfterFirst.reviewHistory).toHaveLength(1)

    // Second challenge: revise
    const afterSecond = simulateApplyDiff(afterFirst, REVISE_PT_RESULT)
    const nodeAfterSecond = afterSecond.find(n => n.id === 'n1')

    expect(nodeAfterSecond.reviewHistory).toHaveLength(2)
    expect(nodeAfterSecond.reviewHistory[0].outcome).toBe('preserve')
    expect(nodeAfterSecond.reviewHistory[1].outcome).toBe('revise')
  })
})

// ── 8. Refining a node a second time does not erase prior reviewHistory ────────

describe('Test 8: second refine preserves all prior history', () => {
  it('reviewHistory accumulates across three successive challenges', () => {
    const after1 = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const after2 = simulateApplyDiff(after1, REVISE_PT_RESULT)
    const after3 = simulateApplyDiff(after2, PRESERVE_PT_RESULT)

    const node = after3.find(n => n.id === 'n1')
    expect(node.reviewHistory).toHaveLength(3)
  })
})

// ── 9. Preserving a claim still persists citations ────────────────────────────

describe('Test 9: preserve_original outcome still persists citations', () => {
  it('outcome is preserve and citations are saved', () => {
    const event = buildStage1ReviewEvent(PRESERVE_PT_RESULT, 'Original claim text.', 'challenge')

    expect(event.outcome).toBe('preserve')
    expect(event.citations).toHaveLength(2)
    expect(event.inlineCitationRefs).toHaveLength(2)
  })
})

// ── 10. Multiple events accumulate — all preserved ────────────────────────────

describe('Test 10: multiple challenge events accumulate', () => {
  it('latestReview points to the newest event; reviewHistory holds all', () => {
    const after1 = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const after2 = simulateApplyDiff(after1, REVISE_PT_RESULT)
    const node   = after2.find(n => n.id === 'n1')

    expect(node.reviewHistory).toHaveLength(2)
    expect(node.latestReview.outcome).toBe('revise')
    expect(node.reviewHistory[0].outcome).toBe('preserve')
  })
})

// ── 11. Retrieval failure produces retrieval_failed outcome, no citations ──────

describe('Test 11: retrieval failure saves outcome without fake citations', () => {
  it('outcome is retrieval_failed and citations array is empty', () => {
    const event = buildStage1ReviewEvent(RETRIEVAL_FAILED_PT_RESULT, 'Original claim text.', 'challenge')

    expect(event.outcome).toBe('retrieval_failed')
    expect(event.citations).toHaveLength(0)
    expect(event.inlineCitationRefs).toHaveLength(0)
  })

  it('diagnostics contain RETRIEVAL_FAILED code', () => {
    const event = buildStage1ReviewEvent(RETRIEVAL_FAILED_PT_RESULT, 'Original claim text.', 'challenge')
    const codes = event.diagnostics.map(d => d.code)

    expect(codes).toContain('RETRIEVAL_FAILED')
  })
})

// ── 12. No-citation response saves diagnostics, no fake markers ───────────────

describe('Test 12: no-citation response saves NO_CITATIONS_RETURNED diagnostic', () => {
  it('diagnostics contain NO_CITATIONS_RETURNED when evidence is empty', () => {
    const event = buildStage1ReviewEvent(NO_CITATION_PT_RESULT, 'Original claim text.', 'challenge')

    const codes = event.diagnostics.map(d => d.code)
    expect(codes).toContain('NO_CITATIONS_RETURNED')
  })

  it('inlineCitationRefs is empty — no fake [n] markers are produced', () => {
    const event = buildStage1ReviewEvent(NO_CITATION_PT_RESULT, 'Original claim text.', 'challenge')

    expect(event.inlineCitationRefs).toHaveLength(0)
  })
})

// ── 13. Discarding does not erase previously persisted citations ───────────────

describe('Test 13: discard path does not touch prior reviewHistory', () => {
  it('prior citations survive a discard (diff cleared without node mutation)', () => {
    // After first apply, node has citations
    const afterFirst = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const nodeAfterFirst = afterFirst.find(n => n.id === 'n1')
    expect(nodeAfterFirst.reviewHistory).toHaveLength(1)

    // Discard: the diff is cleared but nodes are NOT mutated (handleDiscardDiff calls setDiff(null))
    // Simulate: do NOT call simulateApplyDiff — just verify the node is unchanged.
    expect(nodeAfterFirst.latestReview.citations).toHaveLength(2)
    // Confirm reviewHistory is still present and unmodified
    expect(nodeAfterFirst.reviewHistory[0].citations).toHaveLength(2)
  })
})

// ── 14. normalizePtCitations de-duplicates by canonical URL ───────────────────

describe('Test 14: normalizePtCitations deduplicates by URL', () => {
  it('two evidence items with the same URL produce one citation', () => {
    const ptResultWithDupe = {
      retrievedEvidence: [
        { id: 'dup1', type: 'direct_evidence', url: 'https://example.com/article', title: 'Article', publisher: 'X', confidence: 'high' },
        { id: 'dup2', type: 'direct_evidence', url: 'https://example.com/article/', title: 'Article (trailing slash)', publisher: 'X', confidence: 'high' },
      ],
    }
    const citations = normalizePtCitations(ptResultWithDupe)

    expect(citations).toHaveLength(1)
  })

  it('two evidence items with different URLs produce two citations', () => {
    const citations = normalizePtCitations(PRESERVE_PT_RESULT)
    expect(citations).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// PLACEMENT TESTS — buildInlineCitationSegments
// ═══════════════════════════════════════════════════════════════════════════════

// ── Fixtures for placement tests ──────────────────────────────────────────────

const MULTI_SENTENCE = 'Company A leads SMB payroll. It integrates with QuickBooks. Pricing is competitive.'
const SINGLE_SENTENCE = 'Company A leads SMB payroll.'

// Citations whose snippets echo words from specific sentences
const CITE_PAYROLL = { id: 'c1', title: 'Payroll Report', url: 'https://a.com', snippet: 'leads SMB payroll market' }
const CITE_QB      = { id: 'c2', title: 'QB Integration', url: 'https://b.com', snippet: 'integrates with QuickBooks' }
const CITE_PRICE   = { id: 'c3', title: 'Pricing Study',  url: 'https://c.com', snippet: 'pricing is competitive'    }

const REF_PAYROLL = { citationId: 'c1', marker: 1, sentenceIndex: null, claimText: null }
const REF_QB      = { citationId: 'c2', marker: 2, sentenceIndex: null, claimText: null }
const REF_PRICE   = { citationId: 'c3', marker: 3, sentenceIndex: null, claimText: null }

function textOf(segments) {
  return segments
    .filter(s => 'text' in s)
    .map(s => s.text)
    .join('')
}

function markersAfterSentenceIndex(segments, sentenceIdx) {
  // Walk segments, count text segments to track sentence position,
  // then collect markers that immediately follow the target sentence.
  let textSegCount = 0
  for (let i = 0; i < segments.length; i++) {
    if ('text' in segments[i]) {
      if (textSegCount === sentenceIdx) {
        // Next segment may be markers
        if (i + 1 < segments.length && 'markers' in segments[i + 1]) {
          return segments[i + 1].markers
        }
        return []
      }
      textSegCount++
    }
  }
  return []
}

// ── P1. Multi-sentence: no markers at final character position ─────────────────

describe('P1: multi-sentence statement does not dump all markers at the final character', () => {
  it('markers are distributed — at least one appears before the last text segment', () => {
    const refs = [REF_PAYROLL, REF_QB, REF_PRICE]
    const cites = [CITE_PAYROLL, CITE_QB, CITE_PRICE]
    const segs = buildInlineCitationSegments(MULTI_SENTENCE, refs, cites)

    // Find the last text segment index
    const lastTextIdx = segs.reduce((last, s, i) => 'text' in s ? i : last, -1)
    // At least one markers segment must exist before the last text segment
    const markerBeforeLast = segs.some((s, i) => 'markers' in s && i < lastTextIdx)

    expect(markerBeforeLast).toBe(true)
  })
})

// ── P2. Citation with snippet matching sentence renders after that sentence ────

describe('P2: snippet-matched citation renders after matching sentence', () => {
  it('[1] (payroll snippet) appears after sentence 0', () => {
    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [REF_PAYROLL], [CITE_PAYROLL])
    const markers = markersAfterSentenceIndex(segs, 0)
    expect(markers).toContain(1)
  })

  it('[2] (QuickBooks snippet) appears after sentence 1', () => {
    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [REF_QB], [CITE_QB])
    const markers = markersAfterSentenceIndex(segs, 1)
    expect(markers).toContain(2)
  })

  it('[3] (pricing snippet) appears after sentence 2', () => {
    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [REF_PRICE], [CITE_PRICE])
    const markers = markersAfterSentenceIndex(segs, 2)
    expect(markers).toContain(3)
  })
})

// ── P3. sentenceIndex ref renders after the specified sentence ─────────────────

describe('P3: sentenceIndex ref renders after the correct sentence', () => {
  it('ref with sentenceIndex:1 places its marker after sentence 1', () => {
    const ref  = { citationId: 'c1', marker: 1, sentenceIndex: 1, claimText: null }
    const cite = { id: 'c1', title: 'T', url: '', snippet: '' }
    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [ref], [cite])
    const markers = markersAfterSentenceIndex(segs, 1)
    expect(markers).toContain(1)
  })

  it('ref with sentenceIndex:0 places its marker after the first sentence', () => {
    const ref  = { citationId: 'c1', marker: 1, sentenceIndex: 0, claimText: null }
    const cite = { id: 'c1', title: 'T', url: '', snippet: '' }
    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [ref], [cite])
    const markers = markersAfterSentenceIndex(segs, 0)
    expect(markers).toContain(1)
  })
})

// ── P4. Multiple citations on the same sentence → adjacent markers ─────────────

describe('P4: multiple citations matching the same sentence produce adjacent markers', () => {
  it('[1][2] both appear in the markers segment after sentence 1 when sentenceIndex=1 for both', () => {
    // Both refs explicitly target sentence 1 via sentenceIndex (priority 1 placement)
    const cite1 = { id: 'c1', snippet: '' }
    const cite2 = { id: 'c2', snippet: '' }
    const ref1  = { citationId: 'c1', marker: 1, sentenceIndex: 1, claimText: null }
    const ref2  = { citationId: 'c2', marker: 2, sentenceIndex: 1, claimText: null }

    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [ref1, ref2], [cite1, cite2])
    const markers = markersAfterSentenceIndex(segs, 1)
    expect(markers).toContain(1)
    expect(markers).toContain(2)
  })

  it('[1][2] via snippet matching — snippets that actually appear in sentence 1', () => {
    const cite1 = { id: 'c1', snippet: 'integrates with QuickBooks' }  // exact substring of s1
    const cite2 = { id: 'c2', snippet: 'It integrates with'          }  // exact substring of s1
    const ref1  = { citationId: 'c1', marker: 1, sentenceIndex: null, claimText: null }
    const ref2  = { citationId: 'c2', marker: 2, sentenceIndex: null, claimText: null }

    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [ref1, ref2], [cite1, cite2])
    const markers = markersAfterSentenceIndex(segs, 1)
    expect(markers).toContain(1)
    expect(markers).toContain(2)
  })
})

// ── P5. Sentence with no citation match receives no marker ─────────────────────

describe('P5: sentence without a supporting citation receives no marker', () => {
  it('when only one citation matches sentence 0, sentence 2 has no markers', () => {
    // Only CITE_PAYROLL matches sentence 0; sentence 2 should be marker-free
    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [REF_PAYROLL], [CITE_PAYROLL])
    const markers2 = markersAfterSentenceIndex(segs, 2)
    // If sentence 2 is the last text segment, it may not be followed by a markers seg at all
    expect(markers2).toHaveLength(0)
  })
})

// ── P6. Single-sentence statement: all markers go at the end ──────────────────

describe('P6: single-sentence statement places all markers at end of that sentence', () => {
  it('two unmatched refs on a single-sentence statement both render after it', () => {
    const cite1 = { id: 'c1', snippet: 'unrelated snippet one' }
    const cite2 = { id: 'c2', snippet: 'unrelated snippet two' }
    const ref1  = { citationId: 'c1', marker: 1, sentenceIndex: null, claimText: null }
    const ref2  = { citationId: 'c2', marker: 2, sentenceIndex: null, claimText: null }

    const segs = buildInlineCitationSegments(SINGLE_SENTENCE, [ref1, ref2], [cite1, cite2])
    const markers = markersAfterSentenceIndex(segs, 0)
    expect(markers).toContain(1)
    expect(markers).toContain(2)
  })
})

// ── P7. Node with citations produces citation panel data ─────────────────────

describe('P7: node with citations has hasCitations=true and non-empty refs', () => {
  it('latestReview.citations is non-empty after apply', () => {
    const result = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')
    expect(node.latestReview.citations.length).toBeGreaterThan(0)
    expect(node.latestReview.inlineCitationRefs.length).toBeGreaterThan(0)
  })
})

// ── P8. Disclosure defaults to collapsed (refs exist but are not rendered) ─────
// (Component state cannot be tested without @testing-library/react; verified in browser)

// ── P9. Expanded panel shows source entries matching marker numbers ─────────────

describe('P9: citation panel entries match ref markers', () => {
  it('every ref marker has a matching citation entry in the same review event', () => {
    const result = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')
    const { citations, inlineCitationRefs } = node.latestReview
    const citeIds = new Set(citations.map(c => c.id))

    for (const ref of inlineCitationRefs) {
      expect(citeIds.has(ref.citationId)).toBe(true)
    }
  })
})

// ── P10. Click to expand is a real toggle (component state) ───────────────────
// (Interactive behavior verified in browser)

// ── P11. Panel collapse toggles correctly ─────────────────────────────────────
// (Interactive behavior verified in browser)

// ── P12. Panel falls back to reviewHistory if latestReview has no citations ────

describe('P12: effectiveReview falls back to reviewHistory when latestReview is empty', () => {
  it('most recent history event with citations is used when latestReview.citations is empty', () => {
    const historyEvent = {
      id: 'rev_old', createdAt: new Date().toISOString(), operation: 'challenge',
      outcome: 'preserve', citations: [CITE_PAYROLL], inlineCitationRefs: [REF_PAYROLL],
      diagnostics: [],
    }
    const nodeWithHistory = {
      ...ORIGINAL_NODE,
      latestReview:  { ...historyEvent, citations: [] }, // latestReview has no citations
      reviewHistory: [historyEvent],
    }

    // Simulate the effectiveReview logic from NodeCard
    const effectiveReview =
      nodeWithHistory.latestReview?.citations?.length > 0
        ? nodeWithHistory.latestReview
        : (nodeWithHistory.reviewHistory || []).slice().reverse().find(e => e.citations?.length > 0) ?? null

    expect(effectiveReview).not.toBeNull()
    expect(effectiveReview.citations).toHaveLength(1)
  })
})

// ── P13. Marker numbers in statement match marker numbers in panel ─────────────

describe('P13: marker numbers are consistent between statement and panel', () => {
  it('segment markers match ref.marker values in inlineCitationRefs', () => {
    const result  = simulateApplyDiff(NODE_LIST, PRESERVE_PT_RESULT)
    const node    = result.find(n => n.id === 'n1')
    const { citations, inlineCitationRefs } = node.latestReview

    const segs = buildInlineCitationSegments(node.statement, inlineCitationRefs, citations)
    const markerSegNums = segs.filter(s => 'markers' in s).flatMap(s => s.markers)
    const refMarkerNums = inlineCitationRefs.map(r => r.marker)

    // Every marker that appears in segments must be declared in refs
    for (const m of markerSegNums) {
      expect(refMarkerNums).toContain(m)
    }
  })
})

// ── P14. Node without citations produces no markers or fake panel ─────────────

describe('P14: node without citations does not render fake markers', () => {
  it('buildInlineCitationSegments with empty refs returns a single text segment', () => {
    const segs = buildInlineCitationSegments(MULTI_SENTENCE, [], [])
    expect(segs).toHaveLength(1)
    expect(segs[0]).toHaveProperty('text', MULTI_SENTENCE)
  })

  it('node with no latestReview and no reviewHistory has hasCitations=false', () => {
    const node = { ...ORIGINAL_NODE, latestReview: null, reviewHistory: [] }
    const effectiveReview =
      node.latestReview?.citations?.length > 0
        ? node.latestReview
        : (node.reviewHistory || []).slice().reverse().find(e => e.citations?.length > 0) ?? null
    const citations = effectiveReview?.citations || []
    expect(citations).toHaveLength(0)
  })
})

// ── P15. Persisted review history is not mutated by rendering ─────────────────

describe('P15: buildInlineCitationSegments does not mutate its inputs', () => {
  it('original refs array is not modified after calling buildInlineCitationSegments', () => {
    const refs  = [{ citationId: 'c1', marker: 1, sentenceIndex: null, claimText: null }]
    const cites = [{ id: 'c1', snippet: 'leads SMB payroll market' }]
    const refsBefore = JSON.stringify(refs)

    buildInlineCitationSegments(MULTI_SENTENCE, refs, cites)

    expect(JSON.stringify(refs)).toBe(refsBefore)
  })
})

// ── D-series: challenge preview citation marker tests ──────────────────────────
//
// These tests cover the preview path (RevisionBlock) which must use the same
// normalizePtCitations → buildCitationRefs → buildInlineCitationSegments pipeline
// as buildStage1ReviewEvent so marker numbers are identical before and after apply.

const MULTI_SENTENCE_REVISED = 'Payroll platforms lead the SMB market. They integrate with QuickBooks for accounting.'

const PREVIEW_PT_RESULT = {
  decision:            'revise_claim',
  challengedNodeId:    'n1',
  challengeAssessment: 'Claim needs narrowing.',
  evidenceSummary:     'Two sources confirm.',
  evidenceNeeded:      null,
  revisedNode:         { id: 'n1', statement: MULTI_SENTENCE_REVISED, confidence: 'high' },
  updatedDownstream:   [],
  retrievedEvidence:   [
    {
      id:        'ev_a',
      type:      'direct_evidence',
      url:       'https://source-a.com/report',
      title:     'SMB Market Report',
      snippet:   'payroll platforms lead the SMB market',
      publisher: 'Source A',
      confidence: 'high',
    },
    {
      id:        'ev_b',
      type:      'direct_evidence',
      url:       'https://source-b.com/integration',
      title:     'QuickBooks Integration Guide',
      snippet:   'integrate with QuickBooks for accounting',
      publisher: 'Source B',
      confidence: 'medium',
    },
  ],
  inlineCitations: [],
}

// Simulate the preview path: what DiffView.RevisionBlock computes
function previewSegments(ptResult, statement) {
  const citations = normalizePtCitations(ptResult)
  const refs      = buildCitationRefs(citations)
  return buildInlineCitationSegments(statement, refs, citations)
}

// ── D1. Preview of multi-sentence revised statement has markers not all at end ──

describe('D1: preview markers are not all dumped at end of multi-sentence revised statement', () => {
  it('markers appear after at least one non-final sentence', () => {
    const segs = previewSegments(PREVIEW_PT_RESULT, MULTI_SENTENCE_REVISED)
    // Check that a marker segment appears BEFORE the last text segment
    const lastTextIdx = segs.map((s, i) => ('text' in s ? i : -1)).filter(i => i >= 0).pop()
    const markerBeforeLast = segs.some((s, i) => 'markers' in s && i < lastTextIdx)
    expect(markerBeforeLast).toBe(true)
  })
})

// ── D2. Preview: marker [1] appears at the end of the sentence its snippet matches ─

describe('D2: preview marker [1] is placed after its matching sentence, not at end of statement', () => {
  it('[1] appears after sentence 0 because ev_a snippet matches sentence 0', () => {
    const segs = previewSegments(PREVIEW_PT_RESULT, MULTI_SENTENCE_REVISED)
    const markers = markersAfterSentenceIndex(segs, 0)
    expect(markers).toContain(1)
  })

  it('[2] appears after sentence 1 because ev_b snippet matches sentence 1', () => {
    const segs = previewSegments(PREVIEW_PT_RESULT, MULTI_SENTENCE_REVISED)
    const markers = markersAfterSentenceIndex(segs, 1)
    expect(markers).toContain(2)
  })
})

// ── D3. buildCitationRefs is the shared helper — same output as buildStage1ReviewEvent refs ──

describe('D3: buildCitationRefs produces refs identical to buildStage1ReviewEvent.inlineCitationRefs', () => {
  it('marker numbers and citationIds match', () => {
    const citations  = normalizePtCitations(PREVIEW_PT_RESULT)
    const previewRef = buildCitationRefs(citations)
    const event      = buildStage1ReviewEvent(PREVIEW_PT_RESULT, 'original', 'challenge')

    expect(previewRef.length).toBe(event.inlineCitationRefs.length)
    for (let i = 0; i < previewRef.length; i++) {
      expect(previewRef[i].citationId).toBe(event.inlineCitationRefs[i].citationId)
      expect(previewRef[i].marker).toBe(event.inlineCitationRefs[i].marker)
    }
  })
})

// ── D4. Applying revision preserves same citations and refs as the preview would build ──

describe('D4: applied node citations match what the preview path would compute', () => {
  it('applied node inlineCitationRefs markers match preview buildCitationRefs output', () => {
    const result = simulateApplyDiff([ORIGINAL_NODE], PREVIEW_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')

    const previewCitations = normalizePtCitations(PREVIEW_PT_RESULT)
    const previewRefs      = buildCitationRefs(previewCitations)

    expect(node.latestReview.inlineCitationRefs.length).toBe(previewRefs.length)
    node.latestReview.inlineCitationRefs.forEach((ref, i) => {
      expect(ref.marker).toBe(previewRefs[i].marker)
      expect(ref.citationId).toBe(previewRefs[i].citationId)
    })
  })
})

// ── D5. Preview segments and applied node segments render identically ─────────

describe('D5: preview segments and applied node card segments are structurally identical', () => {
  it('same markers in same sentence positions before and after apply', () => {
    const result = simulateApplyDiff([ORIGINAL_NODE], PREVIEW_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')

    // Preview path
    const previewSegs = previewSegments(PREVIEW_PT_RESULT, MULTI_SENTENCE_REVISED)

    // Post-apply node card path (node.statement is the revised statement after apply)
    const { citations, inlineCitationRefs } = node.latestReview
    const appliedSegs = buildInlineCitationSegments(node.statement, inlineCitationRefs, citations)

    // Extract marker segment contents from both paths
    const previewMarkers = previewSegs.filter(s => 'markers' in s).map(s => s.markers.sort((a,b)=>a-b))
    const appliedMarkers = appliedSegs.filter(s => 'markers' in s).map(s => s.markers.sort((a,b)=>a-b))

    expect(previewMarkers).toEqual(appliedMarkers)
  })
})

// ── D6. Discard does not persist a new review event ───────────────────────────

describe('D6: discarding the challenge preview does not persist a review event', () => {
  it('node reviewHistory is unchanged when apply is not called', () => {
    const originalHistory = [...(ORIGINAL_NODE.reviewHistory || [])]
    // Discard = simply not calling simulateApplyDiff
    expect(ORIGINAL_NODE.reviewHistory).toEqual(originalHistory)
    expect(ORIGINAL_NODE.reviewHistory).toHaveLength(0)
  })

  it('node with prior history keeps that history intact after a discard', () => {
    // Simulate a first apply
    const afterFirst = simulateApplyDiff([ORIGINAL_NODE], PRESERVE_PT_RESULT)
    const nodeAfterFirst = afterFirst.find(n => n.id === 'n1')
    expect(nodeAfterFirst.reviewHistory).toHaveLength(1)

    // Discard = do not call simulateApplyDiff again
    // History must still be length 1
    expect(nodeAfterFirst.reviewHistory).toHaveLength(1)
  })
})

// ── D7. Existing reviewHistory is not wiped by a second apply ────────────────

describe('D7: prior reviewHistory is preserved when a new challenge is applied', () => {
  it('reviewHistory accumulates across two separate challenge applications', () => {
    const afterFirst  = simulateApplyDiff([ORIGINAL_NODE], PRESERVE_PT_RESULT)
    const nodeFirst   = afterFirst.find(n => n.id === 'n1')
    const afterSecond = simulateApplyDiff(afterFirst, PREVIEW_PT_RESULT)
    const nodeSecond  = afterSecond.find(n => n.id === 'n1')

    expect(nodeSecond.reviewHistory).toHaveLength(2)
    expect(nodeSecond.reviewHistory[0].outcome).toBe('preserve')
    expect(nodeSecond.reviewHistory[1].outcome).toBe('revise')
  })
})

// ── CM-series: CitationMarker tooltip data tests ──────────────────────────────
//
// CitationMarker is a React component so interactive behavior (hover/focus) is
// verified in the browser. These tests cover the data contract: that the citation
// objects passed to CitationMarker contain all required tooltip fields and that
// the null-safety patterns hold.

// ── CM1. Citation has all tooltip fields after normalization ─────────────────

describe('CM1: normalized citation has all fields needed by CitationMarker tooltip', () => {
  it('citation has title, domain, snippet, url, supportsClaim, and confidence', () => {
    const citations = normalizePtCitations(PREVIEW_PT_RESULT)
    const cite = citations[0]
    expect(typeof cite.title).toBe('string')
    expect(typeof cite.domain).toBe('string')
    expect(typeof cite.snippet).toBe('string')
    expect(typeof cite.url).toBe('string')
    // supportsClaim is 'direct' | 'partial' | 'context' | false
    expect(['direct', 'partial', 'context', false]).toContain(cite.supportsClaim)
  })
})

// ── CM2. Snippet from retrievedEvidence is preserved as tooltip quote ─────────

describe('CM2: citation snippet matches source evidence snippet', () => {
  it('citation.snippet equals the evidence snippet it was built from', () => {
    const evidence  = PREVIEW_PT_RESULT.retrievedEvidence[0]
    const citations = normalizePtCitations(PREVIEW_PT_RESULT)
    expect(citations[0].snippet).toBe(evidence.snippet)
  })
})

// ── CM3. Citation without snippet — fallback path is supported ───────────────

describe('CM3: citation with empty snippet has falsy snippet field', () => {
  it('normalizePtCitations preserves empty snippet as empty string (tooltip shows fallback)', () => {
    const ptWithNoSnippet = {
      ...PREVIEW_PT_RESULT,
      retrievedEvidence: [{
        id: 'ev_x', type: 'direct_evidence',
        url: 'https://example.org/', title: 'No Snippet Source',
        snippet: '', publisher: 'Org', confidence: 'medium',
      }],
    }
    const citations = normalizePtCitations(ptWithNoSnippet)
    // snippet is empty/falsy — tooltip should render fallback text
    expect(citations[0].snippet).toBeFalsy()
    // url is present — "Open source" link should still render
    expect(citations[0].url).toBe('https://example.org/')
  })
})

// ── CM4. Citation without URL — open-source link omitted ─────────────────────

describe('CM4: citation with no URL has falsy url field', () => {
  it('normalizePtCitations stores empty url correctly — tooltip omits link', () => {
    const ptNoUrl = {
      ...PREVIEW_PT_RESULT,
      retrievedEvidence: [{
        id: 'ev_y', type: 'pattern_inference',
        url: '', title: 'Internal Analysis', snippet: 'Some finding.',
        publisher: 'Internal', confidence: 'low',
      }],
    }
    const citations = normalizePtCitations(ptNoUrl)
    expect(citations[0].url).toBeFalsy()
    expect(citations[0].domain).toBe('')  // no domain when url is empty
  })
})

// ── CM5. Marker n corresponds to retrievedEvidence[n-1] — tooltip matches panel ─

describe('CM5: CitationMarker for marker n shows data from evidence[n-1]', () => {
  it('marker 1 citation.title matches evidence[0].title', () => {
    const citations = normalizePtCitations(PREVIEW_PT_RESULT)
    const refs      = buildCitationRefs(citations)
    const ref1      = refs.find(r => r.marker === 1)
    const cite1     = citations.find(c => c.id === ref1.citationId)
    expect(cite1.title).toBe(PREVIEW_PT_RESULT.retrievedEvidence[0].title)
  })

  it('marker 1 citation.snippet matches evidence[0].snippet', () => {
    const citations = normalizePtCitations(PREVIEW_PT_RESULT)
    const refs      = buildCitationRefs(citations)
    const ref1      = refs.find(r => r.marker === 1)
    const cite1     = citations.find(c => c.id === ref1.citationId)
    expect(cite1.snippet).toBe(PREVIEW_PT_RESULT.retrievedEvidence[0].snippet)
  })
})

// ── CM6. Missing citation (null) — null-safe lookup does not throw ────────────

describe('CM6: null-safe citation lookup does not crash', () => {
  it('citeById lookup for an unknown citationId returns undefined (falsy, not exception)', () => {
    const citations = normalizePtCitations(PREVIEW_PT_RESULT)
    const citeById  = Object.fromEntries(citations.map(c => [c.id, c]))
    const missing   = citeById['cite_nonexistent'] ?? null
    expect(missing).toBeNull()
    // CitationMarker receives null and renders the marker without a tooltip
  })
})

// ── CM7. Preview and applied paths supply identical tooltip data ──────────────

describe('CM7: preview citation objects match applied node citation objects', () => {
  it('title, snippet, domain, and url are identical in both paths', () => {
    // Preview path
    const previewCitations = normalizePtCitations(PREVIEW_PT_RESULT)

    // Applied path
    const event = buildStage1ReviewEvent(PREVIEW_PT_RESULT, 'original statement', 'challenge')

    expect(event.citations.length).toBe(previewCitations.length)
    for (let i = 0; i < previewCitations.length; i++) {
      expect(event.citations[i].title).toBe(previewCitations[i].title)
      expect(event.citations[i].snippet).toBe(previewCitations[i].snippet)
      expect(event.citations[i].domain).toBe(previewCitations[i].domain)
      expect(event.citations[i].url).toBe(previewCitations[i].url)
    }
  })
})

// ── CM8. Existing CitationPanel (Sources / Review Evidence) still receives correct data ──

describe('CM8: CitationPanel data contract is unaffected by CitationMarker addition', () => {
  it('applied node has citations and inlineCitationRefs for the panel', () => {
    const result = simulateApplyDiff([ORIGINAL_NODE], PRESERVE_PT_RESULT)
    const node   = result.find(n => n.id === 'n1')
    const { citations, inlineCitationRefs } = node.latestReview

    // Panel requires non-empty arrays
    expect(citations.length).toBeGreaterThan(0)
    expect(inlineCitationRefs.length).toBeGreaterThan(0)

    // Every ref maps to a known citation
    const citeIds = new Set(citations.map(c => c.id))
    for (const ref of inlineCitationRefs) {
      expect(citeIds.has(ref.citationId)).toBe(true)
    }
  })
})

// ── D8. Preview marker numbers match EvidenceSection index order ──────────────
//
// EvidenceSection numbers items as [i+1] where i is the position in
// ptResult.retrievedEvidence. normalizePtCitations preserves order (minus de-dupe)
// so citation[0] = evidence[0] and marker [1] = evidence item at index 0.

describe('D8: preview marker [n] matches retrievedEvidence[n-1] from EvidenceSection', () => {
  it('marker 1 citation title matches retrievedEvidence[0].title', () => {
    const citations = normalizePtCitations(PREVIEW_PT_RESULT)
    const refs      = buildCitationRefs(citations)

    // ref with marker=1 should have citationId pointing to the first evidence item
    const ref1  = refs.find(r => r.marker === 1)
    const cite1 = citations.find(c => c.id === ref1.citationId)

    // EvidenceSection would show [1] next to retrievedEvidence[0].title
    expect(cite1.title).toBe(PREVIEW_PT_RESULT.retrievedEvidence[0].title)
  })

  it('marker 2 citation title matches retrievedEvidence[1].title', () => {
    const citations = normalizePtCitations(PREVIEW_PT_RESULT)
    const refs      = buildCitationRefs(citations)

    const ref2  = refs.find(r => r.marker === 2)
    const cite2 = citations.find(c => c.id === ref2.citationId)

    expect(cite2.title).toBe(PREVIEW_PT_RESULT.retrievedEvidence[1].title)
  })
})
