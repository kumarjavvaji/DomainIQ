import React, { useState } from 'react'
import { NODE_TYPES, NODE_STATUS_CONFIG } from '../v4schema'
import { getTrust, confPct } from '../constants'
import { buildInlineCitationSegments } from '../v4utils'
import CitationMarker from './CitationMarker'

const STATUS_ACTIONS = [
  { status: 'accepted',     label: 'Accept',       icon: 'ti-check' },
  { status: 'challenged',   label: 'Challenge',     icon: 'ti-alert-triangle' },
  { status: 'needs_review', label: 'Needs review',  icon: 'ti-eye' },
  { status: 'rejected',     label: 'Reject',        icon: 'ti-x' },
]

export default function NodeCard({ node, allNodes, onStatusChange, onChallengeClick, onRegenClick, onNeedsReviewClick }) {
  const nodeType  = NODE_TYPES[node.type]         || NODE_TYPES.finding
  const statusCfg = NODE_STATUS_CONFIG[node.userStatus] || NODE_STATUS_CONFIG.pending
  const { pct, color } = confPct(node.confidence)
  const trustCfg  = getTrust(node.evidence_type)

  const depLabels = (node.dependsOn || []).filter(Boolean)

  const cardClass = [
    'node-card',
    node.userStatus === 'challenged'   ? 'is-challenged' : '',
    node.userStatus === 'accepted'     ? 'is-accepted'   : '',
    node.userStatus === 'rejected'     ? 'is-rejected'   : '',
  ].filter(Boolean).join(' ')

  function handleAction(status) {
    if (status === 'challenged')   { onChallengeClick(node.id) }
    else if (status === 'needs_review') { onNeedsReviewClick(node.id) }
    else { onStatusChange(node.id, status) }
  }

  // Effective review: prefer latestReview; fall back to most recent reviewHistory
  // entry that has at least one citation. Handles data created before this feature.
  const effectiveReview = (node.latestReview?.citations?.length > 0)
    ? node.latestReview
    : (node.reviewHistory || []).slice().reverse().find(e => e.citations?.length > 0) ?? null

  const citations    = effectiveReview?.citations         || []
  const rawRefs      = effectiveReview?.inlineCitationRefs || []
  const hasCitations = citations.length > 0

  // If citations exist but refs don't match any citation (ID mismatch from older data),
  // generate rendering-only refs from the citations array. Never mutates saved data.
  const citeById   = Object.fromEntries(citations.map(c => [c.id, c]))
  const refsHaveMatches = rawRefs.length > 0 && rawRefs.some(r => citeById[r.citationId] != null)
  const citationRefs = refsHaveMatches
    ? rawRefs
    : citations.map((c, i) => ({ citationId: c.id, marker: i + 1, sentenceIndex: null, claimText: null }))

  // Sentence-level placement: build renderable segments
  const segments = hasCitations
    ? buildInlineCitationSegments(node.statement, citationRefs, citations)
    : [{ text: node.statement }]

  return (
    <div className={cardClass}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0 }}>
          {node.id}
        </span>
        <span className={`node-type ${nodeType.cls}`}>
          <i className={`ti ${nodeType.icon}`} /> {nodeType.label}
        </span>
        <span className={`node-status ${statusCfg.cls}`}>
          <i className={`ti ${statusCfg.icon}`} /> {statusCfg.label}
        </span>
        {node.previousStatement && (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a3)', marginLeft: 'auto' }}>
            <i className="ti ti-refresh" style={{ fontSize: 9 }} /> modified
          </span>
        )}
      </div>

      {/* Statement with sentence-level inline citation markers.
          node.statement is NEVER mutated — markers are rendered from citationRefs. */}
      <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, marginBottom: 8 }}>
        {segments.map((seg, i) => {
          if ('markers' in seg) {
            return seg.markers.map(m => {
              const ref  = citationRefs.find(r => r.marker === m)
              const cite = ref ? citeById[ref.citationId] : null
              return <CitationMarker key={`${i}_${m}`} marker={m} citation={cite} />
            })
          }
          return <React.Fragment key={`t${i}`}>{seg.text}</React.Fragment>
        })}
      </div>

      {/* Before statement (if modified in a diff) */}
      {node.previousStatement && (
        <div style={{
          fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 8,
          padding: '6px 8px', background: 'rgba(249,115,22,.05)',
          border: '1px solid rgba(249,115,22,.15)', borderRadius: 6,
        }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a3)', display: 'block', marginBottom: 2 }}>
            previously:
          </span>
          {node.previousStatement}
        </div>
      )}

      {/* Change reason */}
      {node.changeReason && (
        <div style={{
          fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)',
          fontStyle: 'italic', marginBottom: 8,
        }}>
          <i className="ti ti-info-circle" style={{ fontSize: 10, verticalAlign: -1 }} /> {node.changeReason}
        </div>
      )}

      {/* Expandable citation panel — only when citations actually exist */}
      {hasCitations && (
        <CitationPanel
          citations={citations}
          refs={citationRefs}
          reviewHistory={node.reviewHistory}
        />
      )}

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 36, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)' }}>
            {node.confidence}
          </span>
        </div>
        <span className={`trust trust-${trustCfg.cls.replace('trust-', '')}`} style={{ fontSize: 9 }}>
          <i className={`ti ${trustCfg.icon}`} /> {trustCfg.label}
        </span>
        {depLabels.length > 0 && (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 'auto' }}>
            depends on: {depLabels.join(', ')}
          </span>
        )}
      </div>

      {/* Challenge note */}
      {node.userStatus === 'challenged' && (node.userNote || node.userPreset) && (
        <div style={{
          fontSize: 10, padding: '6px 8px', marginBottom: 8,
          background: 'rgba(251,146,60,.06)', border: '1px solid rgba(251,146,60,.2)',
          borderRadius: 6, lineHeight: 1.6,
        }}>
          {node.userPreset && (
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c', marginRight: 6 }}>
              [{node.userPreset}]
            </span>
          )}
          <span style={{ color: 'var(--muted2)' }}>{node.userNote}</span>
        </div>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {STATUS_ACTIONS.map(action => (
          <button
            key={action.status}
            onClick={() => handleAction(action.status)}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 8px',
              border: '1px solid', borderRadius: 5, cursor: 'pointer',
              background: node.userStatus === action.status ? getActionActiveBg(action.status) : 'transparent',
              color: node.userStatus === action.status ? getActionActiveColor(action.status) : 'var(--muted)',
              borderColor: node.userStatus === action.status ? getActionActiveBorder(action.status) : 'var(--border)',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <i className={`ti ${action.icon}`} style={{ fontSize: 9 }} /> {action.label}
          </button>
        ))}
        {node.userStatus === 'challenged' && onRegenClick && (
          <button
            onClick={() => onRegenClick(node.id)}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px',
              border: '1px solid rgba(251,146,60,.4)',
              borderRadius: 5, cursor: 'pointer', marginLeft: 'auto',
              background: 'rgba(251,146,60,.08)', color: '#fb923c',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <i className="ti ti-flask" style={{ fontSize: 9 }} /> Pressure test
          </button>
        )}
      </div>
    </div>
  )
}

// ── CitationPanel ─────────────────────────────────────────────────────────────
//
// Expandable Wikipedia-style footnote panel. `citations` and `refs` are derived
// in NodeCard (never passed as raw latestReview to avoid latestReview-only lock-in).
// `refs` are already validated / fallback-generated before being passed here.
function CitationPanel({ citations, refs, reviewHistory }) {
  const [open, setOpen] = useState(false)

  const citeById = Object.fromEntries(citations.map(c => [c.id, c]))

  // Count prior history events (those beyond the current effective event)
  const priorEventCount = reviewHistory ? Math.max(0, reviewHistory.length - 1) : 0

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Toggle button — explicit onClick, stopPropagation guards against card-level handlers */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
          fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}
      >
        <i
          className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'}`}
          style={{ fontSize: 10 }}
        />
        Sources / Review Evidence
        {priorEventCount > 0 && (
          <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 2 }}>
            (+{priorEventCount} prior)
          </span>
        )}
      </button>

      {/* Expanded body — unconditionally rendered when open; no height tricks */}
      {open && (
        <div style={{
          marginTop: 6,
          padding: '8px 10px',
          background: 'var(--s2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
        }}>
          {refs.map((ref, idx) => {
            const cite = citeById[ref.citationId]

            // If the ID lookup fails (edge case: legacy data mismatch), render a
            // minimal entry rather than returning null and making the panel look empty.
            if (!cite) {
              return (
                <div
                  key={ref.citationId || `ref_${idx}`}
                  style={{ fontSize: 9, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 4 }}
                >
                  [{ref.marker}] Source reference unavailable.
                </div>
              )
            }

            const isLast = idx === refs.length - 1
            return (
              <div
                key={ref.citationId}
                data-citation-entry={ref.marker}
                style={{
                  display: 'flex', gap: 8,
                  marginBottom: isLast ? 0 : 10,
                  paddingBottom: isLast ? 0 : 10,
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                }}
              >
                {/* [n] marker */}
                <span style={{
                  fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)',
                  background: 'rgba(0,229,180,.1)', padding: '1px 4px',
                  borderRadius: 3, flexShrink: 0, alignSelf: 'flex-start',
                  marginTop: 1,
                }}>
                  [{ref.marker}]
                </span>

                {/* Citation details */}
                <div style={{ flex: 1 }}>
                  {cite.url ? (
                    <a
                      href={cite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        fontSize: 10, color: 'var(--a4)',
                        textDecoration: 'none', display: 'block', marginBottom: 2,
                        fontWeight: 500,
                      }}
                    >
                      {cite.title || cite.url}
                    </a>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--muted2)', marginBottom: 2, fontWeight: 500 }}>
                      {cite.title || '(untitled)'}
                    </div>
                  )}

                  {/* Domain · Published · Accessed */}
                  <div style={{
                    fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
                    display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 3,
                  }}>
                    {cite.domain && <span>{cite.domain}</span>}
                    {cite.publishedAt && (
                      <>
                        <span style={{ color: 'var(--border2)' }}>·</span>
                        <span>Published: {cite.publishedAt}</span>
                      </>
                    )}
                    {cite.accessedAt && (
                      <>
                        <span style={{ color: 'var(--border2)' }}>·</span>
                        <span>Accessed: {formatAccessedDate(cite.accessedAt)}</span>
                      </>
                    )}
                  </div>

                  {/* Support level */}
                  {cite.supportsClaim !== null && cite.supportsClaim !== undefined && (
                    <div style={{
                      fontSize: 9, fontFamily: 'var(--fm)',
                      color: supportColor(cite.supportsClaim),
                      marginBottom: cite.snippet ? 3 : 0,
                    }}>
                      Supports: {formatSupportLevel(cite.supportsClaim)}
                    </div>
                  )}

                  {/* Snippet */}
                  {cite.snippet && (
                    <div style={{
                      fontSize: 9, color: 'var(--muted2)', lineHeight: 1.55,
                      fontStyle: 'italic',
                    }}>
                      "{cite.snippet}"
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {priorEventCount > 0 && (
            <div style={{
              fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
              paddingTop: refs.length > 0 ? 8 : 0, fontStyle: 'italic',
              borderTop: refs.length > 0 ? '1px solid var(--border)' : 'none',
            }}>
              {priorEventCount} earlier challenge event{priorEventCount !== 1 ? 's' : ''} also on record.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAccessedDate(isoString) {
  if (!isoString) return ''
  try {
    return new Date(isoString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch (_) { return isoString }
}

function formatSupportLevel(level) {
  if (level === 'direct')  return 'direct'
  if (level === 'partial') return 'partial'
  if (level === 'context') return 'context'
  if (level === false)     return 'contradicts'
  return String(level)
}

function supportColor(level) {
  if (level === 'direct')  return 'var(--accent)'
  if (level === 'partial') return 'var(--a3)'
  if (level === 'context') return 'var(--muted2)'
  if (level === false)     return '#f87171'
  return 'var(--muted)'
}

function getActionActiveBg(status) {
  if (status === 'accepted')     return 'rgba(0,229,180,.08)'
  if (status === 'challenged')   return 'rgba(251,146,60,.08)'
  if (status === 'rejected')     return 'rgba(248,113,113,.08)'
  if (status === 'needs_review') return 'rgba(124,108,250,.08)'
  return 'var(--s2)'
}
function getActionActiveColor(status) {
  if (status === 'accepted')     return 'var(--accent)'
  if (status === 'challenged')   return '#fb923c'
  if (status === 'rejected')     return '#f87171'
  if (status === 'needs_review') return 'var(--a2)'
  return 'var(--muted2)'
}
function getActionActiveBorder(status) {
  if (status === 'accepted')     return 'rgba(0,229,180,.3)'
  if (status === 'challenged')   return 'rgba(251,146,60,.3)'
  if (status === 'rejected')     return 'rgba(248,113,113,.3)'
  if (status === 'needs_review') return 'rgba(124,108,250,.3)'
  return 'var(--border2)'
}
