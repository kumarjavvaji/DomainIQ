import React, { useState } from 'react'
import { NODE_TYPES } from '../v4schema'
import { normalizePtCitations, buildCitationRefs, buildInlineCitationSegments } from '../v4utils'
import CitationMarker from './CitationMarker'

// ─── AssessmentView ───────────────────────────────────────────────────────────
// Renders the full PressureTestResult.
// Replaces the old "Regeneration result" DiffView.
//
// Decision variants:
//   revise_claim     — shows original + revised, evidence, citations, quality delta
//   preserve_original — shows assessment rationale, no before/after diff
//   mark_unresolved   — shows ambiguity explanation, no statement change
//   retrieval_failed  — shows error, retry option
//   (no decision field) — incompatible old shape warning
export default function DiffView({ diff, onAccept, onDiscard }) {
  const ptResult = diff?._ptResult

  // ── Incompatible shape guard ─────────────────────────────────
  if (!ptResult || !ptResult.decision) {
    return (
      <div style={{
        background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.3)',
        borderRadius: 'var(--r)', padding: 16, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-alert-triangle" /> Incompatible response shape
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7 }}>
          Expected a <code style={{ fontFamily: 'var(--fm)', color: 'var(--accent)' }}>decision</code> field.
          The pressure test returned a legacy regeneration result.
          Discard and re-run the pressure test.
        </div>
        <button onClick={onDiscard} style={S.discardBtn}>Discard</button>
      </div>
    )
  }

  const { decision } = ptResult

  // ── Citation validation ──────────────────────────────────────
  // Build the set of evidence IDs that were actually retrieved.
  // Any inlineCitation whose evidenceId is not in this set is orphaned —
  // it references evidence that was not returned, which is a fabrication signal.
  const evidenceIds = new Set((ptResult.retrievedEvidence || []).map(e => e.id))
  const orphanedCitations = (ptResult.inlineCitations || []).filter(
    c => c.evidenceId && !evidenceIds.has(c.evidenceId)
  )
  const hasOrphanedCitations = orphanedCitations.length > 0

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid ${decisionBorderColor(decision)}`,
      borderRadius: 'var(--r)', padding: 16, marginBottom: 16,
    }}>
      <DecisionBanner decision={decision} />

      {/* Citation integrity warning — shown before content, blocks Apply */}
      {hasOrphanedCitations && (
        <CitationWarning orphaned={orphanedCitations} />
      )}

      {/* retrieval_failed: short error, no other sections */}
      {decision === 'retrieval_failed' && (
        <RetrievalFailed ptResult={ptResult} onDiscard={onDiscard} />
      )}

      {/* assessment_truncated / assessment_parse_failed: chunking failed fallback */}
      {(decision === 'assessment_truncated' || decision === 'assessment_parse_failed') && (
        <AssessmentTruncated ptResult={ptResult} onDiscard={onDiscard} />
      )}

      {/* All other decisions: full assessment */}
      {decision !== 'retrieval_failed' &&
       decision !== 'assessment_truncated' &&
       decision !== 'assessment_parse_failed' && (
        <>
          <AssessmentBlock ptResult={ptResult} />
          {decision === 'revise_claim' && <RevisionBlock diff={diff} ptResult={ptResult} />}
          <EvidenceSection ptResult={ptResult} />
          {ptResult.qualityDelta && <QualityDeltaSection qd={ptResult.qualityDelta} />}
          {ptResult.suggestedResearchQueries?.length > 0 && (
            <SuggestedQueries queries={ptResult.suggestedResearchQueries} />
          )}
          <EvidenceFootnotes evidence={ptResult.retrievedEvidence || []} />
          <ModelKnowledgeNotice hasEvidence={(ptResult.retrievedEvidence || []).length > 0} />
          <ApplyDiscard
            decision={decision}
            onAccept={onAccept}
            onDiscard={onDiscard}
            disabled={hasOrphanedCitations}
          />
        </>
      )}
    </div>
  )
}

// ─── Decision banner ─────────────────────────────────────────────────────────
function DecisionBanner({ decision }) {
  const cfg = {
    revise_claim:      { label: 'Revise claim',      icon: 'ti-edit',           color: '#fb923c', bg: 'rgba(251,146,60,.06)',   border: 'rgba(251,146,60,.2)'   },
    preserve_original: { label: 'Preserve original', icon: 'ti-shield-check',   color: 'var(--accent)', bg: 'rgba(0,229,180,.06)', border: 'rgba(0,229,180,.2)' },
    mark_unresolved:   { label: 'Mark unresolved',   icon: 'ti-help',           color: 'var(--a2)', bg: 'rgba(124,108,250,.06)', border: 'rgba(124,108,250,.2)' },
    retrieval_failed:       { label: 'Retrieval failed',        icon: 'ti-wifi-off',    color: '#f87171', bg: 'rgba(248,113,113,.06)', border: 'rgba(248,113,113,.2)'  },
    assessment_truncated:   { label: 'Assessment truncated',    icon: 'ti-clock-pause', color: '#f59e0b', bg: 'rgba(245,158,11,.06)',  border: 'rgba(245,158,11,.2)'  },
    assessment_parse_failed:{ label: 'Assessment parse failed', icon: 'ti-code-off',    color: '#f59e0b', bg: 'rgba(245,158,11,.06)',  border: 'rgba(245,158,11,.2)'  },
  }[decision] || { label: decision, icon: 'ti-question-mark', color: 'var(--muted)', bg: 'var(--s2)', border: 'var(--border)' }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 12px', marginBottom: 14,
      background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 7,
    }}>
      <i className={`ti ${cfg.icon}`} style={{ fontSize: 14, color: cfg.color, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>
          Decision: {cfg.label}
        </div>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 1 }}>
          {decisionSubtitle(decision)}
        </div>
      </div>
    </div>
  )
}

function decisionSubtitle(decision) {
  if (decision === 'revise_claim')      return 'Retrieved evidence supports a more precise or defensible version of this claim'
  if (decision === 'preserve_original') return 'Original claim survives scrutiny — challenge does not materially weaken it'
  if (decision === 'mark_unresolved')   return 'Genuine ambiguity — evidence insufficient to decide either way'
  if (decision === 'retrieval_failed')       return 'No useful evidence returned — evaluation could not be completed'
  if (decision === 'assessment_truncated')   return 'Retrieval succeeded — assessment output was truncated; chunk continuation failed'
  if (decision === 'assessment_parse_failed') return 'Retrieval succeeded — assessment response could not be parsed; chunk continuation failed'
  return ''
}

function decisionBorderColor(decision) {
  if (decision === 'revise_claim')          return 'rgba(251,146,60,.3)'
  if (decision === 'preserve_original')     return 'rgba(0,229,180,.25)'
  if (decision === 'assessment_truncated')   return 'rgba(245,158,11,.3)'
  if (decision === 'assessment_parse_failed') return 'rgba(245,158,11,.3)'
  if (decision === 'mark_unresolved')   return 'rgba(124,108,250,.3)'
  if (decision === 'retrieval_failed')  return 'rgba(248,113,113,.3)'
  return 'var(--border)'
}

// ─── Challenge assessment ─────────────────────────────────────────────────────
function AssessmentBlock({ ptResult }) {
  const { challengeAssessment, evidenceSummary, evidenceNeeded, inlineCitations } = ptResult

  function renderWithCitations(text) {
    if (!text || !inlineCitations?.length) return text
    // Replace [n] markers with styled superscripts
    return text.split(/(\[\d+\])/).map((part, i) => {
      if (/^\[\d+\]$/.test(part)) {
        return (
          <sup key={i} style={{
            fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)',
            background: 'rgba(0,229,180,.1)', padding: '1px 3px',
            borderRadius: 2, cursor: 'default',
          }}>
            {part}
          </sup>
        )
      }
      return part
    })
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <SectionLabel icon="ti-file-analytics" label="Challenge assessment" />
      <div style={{
        fontSize: 11, color: 'var(--text)', lineHeight: 1.8,
        padding: '10px 12px', background: 'var(--s2)',
        border: '1px solid var(--border)', borderRadius: 7, marginBottom: 8,
      }}>
        {renderWithCitations(challengeAssessment)}
      </div>
      {evidenceSummary && (
        <div style={{
          fontSize: 10, color: 'var(--muted2)', lineHeight: 1.7,
          padding: '8px 12px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 7, marginBottom: 8,
        }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', display: 'block', marginBottom: 3 }}>
            EVIDENCE SUMMARY
          </span>
          {evidenceSummary}
        </div>
      )}
      {evidenceNeeded && (
        <div style={{
          fontSize: 10, color: 'var(--a4)', lineHeight: 1.7,
          padding: '7px 12px', background: 'rgba(56,189,248,.04)',
          border: '1px solid rgba(56,189,248,.15)', borderRadius: 7,
        }}>
          <i className="ti ti-search" style={{ fontSize: 10, verticalAlign: -1, marginRight: 5 }} />
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600, marginRight: 6 }}>EVIDENCE STILL NEEDED:</span>
          {evidenceNeeded}
        </div>
      )}
    </div>
  )
}

// ─── Revision block (revise_claim only) ──────────────────────────────────────
//
// For the challenged node's revised statement, renders inline citation markers
// using the same normalization + placement logic as the post-apply NodeCard.
// Marker numbers match the [n] labels in EvidenceSection / EvidenceFootnotes.
function RevisionBlock({ diff, ptResult }) {
  const { modifiedNodes } = diff
  const { updatedDownstream } = ptResult
  if (!modifiedNodes?.length) return null

  // Build preview citations once — same call path as buildStage1ReviewEvent so
  // marker numbers are guaranteed to match the applied node card.
  const previewCitations = normalizePtCitations(ptResult)
  const previewRefs      = buildCitationRefs(previewCitations)
  const previewCiteById  = Object.fromEntries(previewCitations.map(c => [c.id, c]))
  const hasCitations     = previewCitations.length > 0

  return (
    <div style={{ marginBottom: 14 }}>
      <SectionLabel icon="ti-pencil" label="Statement changes" />
      {modifiedNodes.map(({ before, after, reason }) => {
        const nodeType         = NODE_TYPES[after.type] || NODE_TYPES.finding
        const isChallengedNode = before.id === ptResult.challengedNodeId

        // Render inline markers only on the challenged node's revised statement.
        // Downstream nodes changed by the revision render plain text.
        let revisedContent
        if (isChallengedNode && hasCitations) {
          const segments = buildInlineCitationSegments(after.statement, previewRefs, previewCitations)
          revisedContent = segments.map((seg, i) => {
            if ('markers' in seg) {
              return seg.markers.map(m => {
                const ref  = previewRefs.find(r => r.marker === m)
                const cite = ref ? previewCiteById[ref.citationId] : null
                return <CitationMarker key={`${i}_${m}`} marker={m} citation={cite} />
              })
            }
            return <React.Fragment key={`t${i}`}>{seg.text}</React.Fragment>
          })
        } else {
          revisedContent = after.statement
        }

        return (
          <div key={after.id} className="diff-modified" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>{after.id}</span>
              <span className={`node-type ${nodeType.cls}`}>
                <i className={`ti ${nodeType.icon}`} /> {nodeType.label}
              </span>
              {isChallengedNode && (
                <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c' }}>challenged node</span>
              )}
            </div>
            <div style={{
              fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 4,
              padding: '6px 8px', background: 'rgba(248,113,113,.04)',
              border: '1px solid rgba(248,113,113,.15)', borderRadius: 5,
            }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', display: 'block', marginBottom: 2 }}>original</span>
              {before.statement}
            </div>
            <div style={{
              fontSize: 10, color: 'var(--text)', lineHeight: 1.6, marginBottom: 4,
              padding: '6px 8px', background: 'rgba(0,229,180,.04)',
              border: '1px solid rgba(0,229,180,.15)', borderRadius: 5,
            }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', display: 'block', marginBottom: 2 }}>revised — more precise</span>
              {revisedContent}
            </div>
            {reason && (
              <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', fontStyle: 'italic' }}>
                <i className="ti ti-info-circle" style={{ fontSize: 9, verticalAlign: -1 }} /> {reason}
              </div>
            )}
          </div>
        )
      })}
      {updatedDownstream?.length > 0 && (
        <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 4 }}>
          <i className="ti ti-arrow-down" style={{ fontSize: 9, verticalAlign: -1 }} /> {updatedDownstream.length} downstream node{updatedDownstream.length !== 1 ? 's' : ''} updated
        </div>
      )}
    </div>
  )
}

// ─── Evidence section ─────────────────────────────────────────────────────────
function EvidenceSection({ ptResult }) {
  const evidence = ptResult.retrievedEvidence || []
  if (!evidence.length) return null

  const typeConfig = {
    direct_evidence:       { label: 'Direct evidence',      color: 'var(--accent)',  icon: 'ti-circle-check' },
    contradictory_evidence: { label: 'Contradicts claim',    color: '#f87171',        icon: 'ti-circle-x' },
    competitor_analogy:    { label: 'Competitor analogy',    color: 'var(--a2)',      icon: 'ti-building' },
    pattern_inference:     { label: 'Pattern inference',     color: 'var(--a4)',      icon: 'ti-trending-up' },
    unresolved_hypothesis: { label: 'Unresolved hypothesis', color: 'var(--muted2)',  icon: 'ti-help' },
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <SectionLabel icon="ti-search" label={`Retrieved evidence — ${evidence.length} result${evidence.length !== 1 ? 's' : ''}`} />
      {evidence.map((e, i) => {
        const tc = typeConfig[e.type] || { label: e.type, color: 'var(--muted)', icon: 'ti-link' }
        return (
          <div key={e.id} style={{
            padding: '9px 12px', marginBottom: 6,
            background: 'var(--s2)', border: '1px solid var(--border)',
            borderRadius: 7,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0 }}>
                [{i + 1}]
              </span>
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', color: tc.color,
                background: `${tc.color}14`, border: `1px solid ${tc.color}30`,
                padding: '1px 6px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <i className={`ti ${tc.icon}`} style={{ fontSize: 9 }} /> {tc.label}
              </span>
              <a
                href={e.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: 'var(--a4)', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {e.title}
              </a>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 5, fontStyle: 'italic' }}>
              "{e.snippet}"
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', display: 'flex', gap: 8 }}>
              <span>{e.publisher}</span>
              <span style={{ color: 'var(--border2)' }}>·</span>
              <span>confidence: {e.confidence}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Quality delta ────────────────────────────────────────────────────────────
function QualityDeltaSection({ qd }) {
  const improvements = [
    { key: 'improvedPrecision',                label: 'More precise' },
    { key: 'reducedOvergeneralization',        label: 'Less overgeneralized' },
    { key: 'improvedSegmentation',             label: 'Better segmented' },
    { key: 'improvedOperationalPlausibility',  label: 'More operationally plausible' },
    { key: 'reducedConfidenceAppropriately',   label: 'Confidence appropriately reduced' },
    { key: 'preservedStrongOriginalReasoning', label: 'Original reasoning preserved' },
    { key: 'surfacedEvidenceGap',              label: 'Evidence gap surfaced' },
    { key: 'improvedDecisionUsefulness',       label: 'More decision-useful' },
  ]

  const trueItems = improvements.filter(x => qd[x.key])
  if (!trueItems.length && !qd.notes) return null

  return (
    <div style={{ marginBottom: 14 }}>
      <SectionLabel icon="ti-award" label="Quality improvement" />
      <div style={{
        padding: '9px 12px', background: 'var(--s2)',
        border: '1px solid var(--border)', borderRadius: 7,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: qd.notes ? 8 : 0 }}>
          {trueItems.map(x => (
            <span key={x.key} style={{
              fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)',
              background: 'rgba(0,229,180,.08)', border: '1px solid rgba(0,229,180,.2)',
              padding: '2px 7px', borderRadius: 3,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <i className="ti ti-check" style={{ fontSize: 9 }} /> {x.label}
            </span>
          ))}
          {trueItems.length === 0 && (
            <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>No improvements flagged</span>
          )}
        </div>
        {qd.notes && (
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65, borderTop: trueItems.length ? '1px solid var(--border)' : 'none', paddingTop: trueItems.length ? 7 : 0 }}>
            {qd.notes}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Suggested queries ────────────────────────────────────────────────────────
function SuggestedQueries({ queries }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <SectionLabel icon="ti-telescope" label="Suggested follow-up searches" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {queries.map((q, i) => (
          <div key={i} style={{
            fontSize: 10, color: 'var(--muted2)', padding: '5px 10px',
            background: 'var(--s2)', border: '1px solid var(--border)',
            borderRadius: 5, fontFamily: 'var(--fm)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <i className="ti ti-search" style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }} />
            {q}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Evidence footnotes ───────────────────────────────────────────────────────
function EvidenceFootnotes({ evidence }) {
  if (!evidence.length) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
        Sources
      </div>
      {evidence.map((e, i) => (
        <div key={e.id} style={{
          display: 'flex', gap: 8, fontSize: 10, color: 'var(--muted2)',
          marginBottom: 4, paddingLeft: 4, lineHeight: 1.5,
        }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0, paddingTop: 1, width: 20 }}>
            [{i + 1}]
          </span>
          <span>
            <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--a4)', textDecoration: 'none' }}>
              {e.title}
            </a>
            {' '}— {e.publisher}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Model knowledge notice ───────────────────────────────────────────────────
function ModelKnowledgeNotice({ hasEvidence }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
      padding: '5px 10px', marginBottom: 14,
      background: 'var(--s2)', border: '1px solid var(--border)',
      borderRadius: 5, display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <i className="ti ti-info-circle" style={{ fontSize: 10, flexShrink: 0 }} />
      {hasEvidence
        ? 'Assessment incorporates live retrieved evidence. URLs and snippets above are from actual search results.'
        : 'No evidence retrieved. Assessment based on model knowledge only — no live evidence retrieved.'}
    </div>
  )
}

// ─── Retrieval failed ─────────────────────────────────────────────────────────
function RetrievalFailed({ ptResult, onDiscard }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 10 }}>
        {ptResult.challengeAssessment || 'Retrieval returned no useful evidence. The pressure test could not evaluate the challenge against external information.'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--a4)', marginBottom: 14 }}>
        <i className="ti ti-refresh" style={{ fontSize: 10, verticalAlign: -1 }} /> You can retry by clicking "Pressure test" on the node again.
      </div>
      <button onClick={onDiscard} style={S.discardBtn}>Discard</button>
    </div>
  )
}

// ─── Assessment truncated / parse failed ─────────────────────────────────────
// Rendered only when automatic chunk continuation itself failed.
// Normal path: chunking runs transparently and DiffView receives a merged result.
function AssessmentTruncated({ ptResult, onDiscard }) {
  const isTruncated = ptResult.decision === 'assessment_truncated'
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 10 }}>
        Retrieval succeeded. Assessment output exceeded the limit.
        Continuing refinement in parseable chunks using the same evidence.
      </div>
      <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 14 }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 10, verticalAlign: -1 }} />{' '}
        {isTruncated
          ? 'The model response was cut off before the JSON completed (max_tokens).'
          : 'The model response could not be parsed as valid JSON.'
        }{' '}
        Chunk continuation also failed. Re-run the pressure test to try again.
      </div>
      <button onClick={onDiscard} style={S.discardBtn}>Discard</button>
    </div>
  )
}

// ─── Citation warning ─────────────────────────────────────────────────────────
// Rendered when inlineCitations reference evidenceIds not present in retrievedEvidence.
// Disables Apply to prevent accepting an assessment with unverifiable citations.
function CitationWarning({ orphaned }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '9px 12px', marginBottom: 14,
      background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.3)',
      borderRadius: 7,
    }}>
      <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#f87171', flexShrink: 0, marginTop: 1 }} />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#f87171', marginBottom: 3 }}>
          Citation integrity check failed — Apply disabled
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>
          {orphaned.length} citation{orphaned.length !== 1 ? 's' : ''} reference{orphaned.length === 1 ? 's' : ''} evidence{' '}
          {orphaned.length === 1 ? 'ID' : 'IDs'} not present in retrieved results:{' '}
          <span style={{ fontFamily: 'var(--fm)', color: '#f87171' }}>
            {orphaned.map(c => c.marker || c.evidenceId).join(', ')}
          </span>
          . Discard and re-run, or verify the assessment manually before applying.
        </div>
      </div>
    </div>
  )
}

// ─── Apply / Discard buttons ──────────────────────────────────────────────────
function ApplyDiscard({ decision, onAccept, onDiscard, disabled }) {
  const applyLabels = {
    revise_claim:      { label: 'Apply revision',          icon: 'ti-pencil' },
    preserve_original: { label: 'Apply — accept as-is',    icon: 'ti-shield-check' },
    mark_unresolved:   { label: 'Apply — mark unresolved', icon: 'ti-help' },
  }
  const cfg = applyLabels[decision] || { label: 'Apply assessment', icon: 'ti-check' }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        onClick={disabled ? undefined : onAccept}
        disabled={disabled}
        title={disabled ? 'Citation integrity check failed — cannot apply' : undefined}
        style={{
          flex: 1, padding: '9px 0', fontSize: 11, fontWeight: 600,
          background: disabled ? 'var(--border)' : 'var(--accent)',
          color: disabled ? 'var(--muted)' : '#0a0b0d',
          border: 'none', borderRadius: 7,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <i className={`ti ${cfg.icon}`} /> {cfg.label}
      </button>
      <button onClick={onDiscard} style={S.discardBtn}>
        Discard
      </button>
    </div>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────
function SectionLabel({ icon, label }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: '.08em',
      marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5,
    }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 10 }} />}
      {label}
    </div>
  )
}

const S = {
  discardBtn: {
    padding: '9px 16px', fontSize: 11,
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--muted2)', borderRadius: 7, cursor: 'pointer',
  },
}
