import React, { useState } from 'react'

// ── Value display helpers ─────────────────────────────────────────────────────

function trunc(str, max = 90) {
  if (str == null) return ''
  const s = typeof str === 'string' ? str : JSON.stringify(str)
  return s.length > max ? s.slice(0, max) + '…' : s
}

function SummaryObjectDisplay({ value, expanded = false }) {
  if (!value || typeof value !== 'object') {
    return <em style={{ fontSize: 10, color: 'var(--muted)' }}>None</em>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: expanded ? 8 : 4 }}>
      {Object.entries(value).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
            minWidth: 120, flexShrink: 0, paddingTop: expanded ? 2 : 0,
          }}>
            {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
          </span>
          <span style={{ fontSize: expanded ? 11 : 10, color: 'var(--fg)', lineHeight: expanded ? 1.65 : 1.45 }}>
            {expanded
              ? (typeof v === 'string' ? v : JSON.stringify(v))
              : trunc(typeof v === 'string' ? v : JSON.stringify(v), 110)
            }
          </span>
        </div>
      ))}
    </div>
  )
}

function getItemPreview(item, section) {
  if (typeof item === 'string') return trunc(item)
  if (section === 'refinedAssertions')
    return trunc(item.revisedStatement || item.originalStatement || '')
  if (section === 'evidenceConsolidation')
    return trunc(item.evidenceSummary || item.observation || '')
  if (section === 'competitorMap')
    return trunc(`${item.name || ''} — ${item.strategicDivergence || item.segmentFit || ''}`)
  if (section === 'emergingEntrants')
    return trunc(`${item.name || ''} — ${item.strategicImplication || ''}`)
  if (section === 'contradictionMap')
    return trunc(`${item.tensionType || ''}: ${item.description || ''}`)
  if (section === 'adjacencyOpportunities')
    return trunc(`${item.area || ''}: ${item.partnershipLogic || ''}`)
  if (section === 'recommendedNextActions')
    return trunc(item.action || item.title || item.text || '')
  return trunc(JSON.stringify(item))
}

// Full-content item card for review-mode arrays.
// Shows primary text + labelled secondary fields with no truncation.
function ExpandedItemCard({ item, section }) {
  if (typeof item === 'string') {
    return (
      <div style={{
        padding: '7px 10px', borderRadius: 4,
        background: 'var(--s2)', border: '1px solid var(--border)',
        fontSize: 11, color: 'var(--fg)', lineHeight: 1.65,
      }}>
        {item}
      </div>
    )
  }

  const primaryField = {
    refinedAssertions:      'revisedStatement',
    evidenceConsolidation:  'evidenceSummary',
    competitorMap:          'name',
    emergingEntrants:       'name',
    contradictionMap:       'description',
    adjacencyOpportunities: 'area',
  }[section]

  const secondaryRows = ({
    refinedAssertions: [
      item.originalStatement && { label: 'original',   value: item.originalStatement },
      item.refinementType    && { label: 'type',       value: item.refinementType    },
      item.reason            && { label: 'reason',     value: item.reason            },
      item.confidenceChange  && item.confidenceChange !== 'unchanged'
                             && { label: 'confidence', value: item.confidenceChange  },
    ],
    evidenceConsolidation: [
      item.nodeId       && { label: 'node',         value: item.nodeId         },
      item.relationship && { label: 'relationship', value: item.relationship   },
      item.observation  && { label: 'observation',  value: item.observation    },
    ],
    competitorMap: [
      item.type                && { label: 'type',                value: item.type                },
      item.segmentFit          && { label: 'segment fit',         value: item.segmentFit          },
      item.capabilityGaps      && { label: 'capability gaps',     value: item.capabilityGaps      },
      item.strategicDivergence && { label: 'strategic divergence', value: item.strategicDivergence },
      item.implications        && { label: 'implications',        value: item.implications        },
    ],
    emergingEntrants: [
      item.capability           && { label: 'capability',  value: item.capability           },
      item.strategicImplication && { label: 'implication', value: item.strategicImplication },
    ],
    contradictionMap: [
      item.tensionType    && { label: 'tension type', value: String(item.tensionType).replace(/_/g, ' ') },
      item.resolution     && { label: 'resolution',   value: item.resolution     },
      item.resolutionNote && { label: 'note',         value: item.resolutionNote },
    ],
    adjacencyOpportunities: [
      item.partnershipLogic && { label: 'partnership',  value: item.partnershipLogic },
      item.acquisitionLogic && { label: 'acquisition',  value: item.acquisitionLogic },
      item.buildVsBuy       && { label: 'build vs buy', value: item.buildVsBuy       },
      item.risks            && { label: 'risks',        value: item.risks            },
    ],
  }[section] || []).filter(Boolean)

  const primary = primaryField ? item[primaryField] : null

  // Generic fallback for unrecognised sections
  if (!primaryField && secondaryRows.length === 0) {
    return (
      <div style={{ padding: '8px 10px', borderRadius: 4, background: 'var(--s2)', border: '1px solid var(--border)' }}>
        {Object.entries(item)
          .filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
          .map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 3, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', minWidth: 100, flexShrink: 0 }}>
                {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
              </span>
              <span style={{ fontSize: 10, color: 'var(--fg)', lineHeight: 1.6 }}>{String(v)}</span>
            </div>
          ))
        }
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 10px', borderRadius: 4, background: 'var(--s2)', border: '1px solid var(--border)' }}>
      {primary && (
        <div style={{ fontSize: 11, color: 'var(--fg)', lineHeight: 1.65, marginBottom: secondaryRows.length ? 6 : 0 }}>
          {primary}
        </div>
      )}
      {secondaryRows.map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', minWidth: 90, flexShrink: 0, paddingTop: 1 }}>
            {label}
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

function ArrayDisplay({ value, section, expanded = false }) {
  if (!Array.isArray(value) || value.length === 0) {
    return <em style={{ fontSize: 10, color: 'var(--muted)' }}>Empty</em>
  }

  if (expanded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 2 }}>
          {value.length} item{value.length !== 1 ? 's' : ''}
        </span>
        {value.map((item, i) => (
          <ExpandedItemCard key={i} item={item} section={section} />
        ))}
      </div>
    )
  }

  // Compact fallback — only used if expanded=false (kept for potential future reuse)
  const preview  = value.slice(0, 2)
  const overflow = value.length - preview.length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)' }}>
        {value.length} item{value.length !== 1 ? 's' : ''}
      </span>
      {preview.map((item, i) => (
        <div key={i} style={{
          fontSize: 10, color: 'var(--fg)', lineHeight: 1.45,
          padding: '3px 7px', background: 'var(--s2)', borderRadius: 3,
        }}>
          {getItemPreview(item, section)}
        </div>
      ))}
      {overflow > 0 && (
        <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>
          +{overflow} more
        </span>
      )}
    </div>
  )
}

function ReadinessDisplay({ value, expanded = false }) {
  if (!value || typeof value !== 'object') {
    return <em style={{ fontSize: 10, color: 'var(--muted)' }}>None</em>
  }

  if (expanded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Object.entries(value).map(([k, v]) => {
          const isArr = Array.isArray(v)
          return (
            <div key={k}>
              <div style={{
                fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4,
              }}>
                {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
              </div>
              {isArr ? (
                v.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {v.map((item, i) => (
                      <div key={i} style={{
                        fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6,
                        padding: '3px 8px', background: 'var(--s2)', borderRadius: 3,
                        border: '1px solid var(--border)',
                      }}>
                        {typeof item === 'string' ? item : JSON.stringify(item)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <em style={{ fontSize: 10, color: 'var(--muted)' }}>None</em>
                )
              ) : (
                <div style={{ fontSize: 10, color: 'var(--fg)', lineHeight: 1.65 }}>
                  {String(v)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Compact fallback
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {Object.entries(value).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
            minWidth: 110, flexShrink: 0,
          }}>
            {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
          </span>
          <span style={{ fontSize: 10, color: 'var(--fg)' }}>
            {Array.isArray(v) ? `[${v.length}]` : trunc(String(v), 70)}
          </span>
        </div>
      ))}
    </div>
  )
}

function ValueDisplay({ value, section, artifactType, expanded = false }) {
  if (section === 'stage3ReadinessSummary') return <ReadinessDisplay value={value} expanded={expanded} />
  if (artifactType === 'object')            return <SummaryObjectDisplay value={value} expanded={expanded} />
  return <ArrayDisplay value={value} section={section} expanded={expanded} />
}

// ── Single artifact card ──────────────────────────────────────────────────────

function ArtifactCard({ artifact, onDecide }) {
  const [showRefine, setShowRefine] = useState(artifact.userStatus === 'refined')
  const [refineText, setRefineText] = useState(() => {
    const src = artifact.refinedValue ?? artifact.proposedValue
    return src == null ? '' : typeof src === 'string' ? src : JSON.stringify(src, null, 2)
  })

  const STATUS_COLOR = {
    approved: 'var(--accent)',
    refined:  '#fb923c',
    rejected: '#f87171',
    pending:  'var(--muted)',
  }
  const statusColor = STATUS_COLOR[artifact.userStatus] || 'var(--muted)'

  const STATUS_LABEL = { approved: 'Approved', refined: 'Refined', rejected: 'Rejected', pending: 'Pending' }

  function decide(userStatus, extra = {}) {
    onDecide(artifact.id, { userStatus, ...extra })
  }

  function handleApprove() { setShowRefine(false); decide('approved', { refinedValue: null }) }
  function handleReject()  { setShowRefine(false); decide('rejected', { refinedValue: null }) }
  function handleReset()   { setShowRefine(false); decide('pending',  { refinedValue: null }) }
  // Opening refine toggles the textarea but does NOT commit yet — status stays as-is
  // until the user explicitly clicks "Commit refinement". This prevents a misleading
  // 'refined' badge when the textarea is open but no text has been committed.
  function handleRefine()  { setShowRefine(prev => !prev) }

  function handleCommitRefine() {
    let parsed
    try   { parsed = JSON.parse(refineText) }
    catch { parsed = refineText }
    decide('refined', { refinedValue: parsed })
  }

  const btn = (label, icon, active, activeColor, onClick) => (
    <button
      onClick={onClick}
      style={{
        fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600,
        padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
        border: `1px solid ${active ? activeColor : activeColor + '30'}`,
        background: active ? activeColor : 'var(--s2)',
        color: active ? '#fff' : activeColor,
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 10 }} /> {label}
    </button>
  )

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: 'var(--r)', marginBottom: 8, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{artifact.label}</span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
          background: `${statusColor}14`, color: statusColor, border: `1px solid ${statusColor}30`,
        }}>
          {STATUS_LABEL[artifact.userStatus] || 'Pending'}
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
          background: 'var(--s2)', color: 'var(--muted)', border: '1px solid var(--border)',
        }}>
          {artifact.artifactType}
        </span>
      </div>

      {/* Impact row */}
      <div style={{
        padding: '5px 12px', fontSize: 10, color: '#fb923c',
        fontFamily: 'var(--fm)', background: 'rgba(251,146,60,.04)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <i className="ti ti-arrow-right" style={{ fontSize: 10, flexShrink: 0 }} />
        {artifact.impactSummary}
      </div>

      {/* Comparison — stacked layout for full readability (current above, proposed below) */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
        }}>Current</div>
        <ValueDisplay
          value={artifact.currentValue}
          section={artifact.section}
          artifactType={artifact.artifactType}
          expanded={true}
        />
      </div>
      <div style={{ padding: '8px 12px', background: 'rgba(0,229,180,.025)' }}>
        <div style={{
          fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--accent)',
          textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8,
        }}>Proposed</div>
        <ValueDisplay
          value={artifact.proposedValue}
          section={artifact.section}
          artifactType={artifact.artifactType}
          expanded={true}
        />
      </div>

      {/* Refine textarea */}
      {showRefine && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 4 }}>
            Edit proposed value — JSON for objects/arrays, plain text for strings:
          </div>
          <textarea
            value={refineText}
            onChange={e => setRefineText(e.target.value)}
            rows={6}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 10, fontFamily: 'var(--fm)',
              background: 'var(--s2)', color: 'var(--fg)',
              border: '1px solid var(--border)', borderRadius: 4,
              padding: '6px 8px', resize: 'vertical', outline: 'none',
            }}
          />
          <button
            onClick={handleCommitRefine}
            style={{
              marginTop: 6, fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600,
              padding: '3px 12px', borderRadius: 4, cursor: 'pointer', border: 'none',
              background: '#fb923c', color: '#fff',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <i className="ti ti-check" style={{ fontSize: 10 }} /> Commit refinement
          </button>
        </div>
      )}

      {/* Decision buttons */}
      <div style={{
        padding: '7px 12px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
      }}>
        {btn('Approve', 'ti-check',  artifact.userStatus === 'approved', 'var(--accent)', handleApprove)}
        {btn('Refine',  'ti-edit',   artifact.userStatus === 'refined',  '#fb923c',      handleRefine)}
        {btn('Reject',  'ti-x',      artifact.userStatus === 'rejected', '#f87171',      handleReject)}
        {artifact.userStatus !== 'pending' && (
          <button
            onClick={handleReset}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 8px',
              background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer',
            }}
          >
            Reset
          </button>
        )}
        {artifact.section === 'refinedAssertions' && artifact.userStatus === 'approved' && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
            marginLeft: 'auto', fontStyle: 'italic',
          }}>
            Prior accept/reject decisions will reset to pending
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function Stage2RerunReview({
  session, candidate,
  onDecide, onApply, onDiscard,
}) {
  const comparison = candidate.comparison || []
  const total    = comparison.length
  const approved = comparison.filter(a => a.userStatus === 'approved' || a.userStatus === 'refined').length
  const rejected = comparison.filter(a => a.userStatus === 'rejected').length
  const pending  = comparison.filter(a => a.userStatus === 'pending').length

  // Apply is always available once there are artifacts — pending = keep current.
  // This lets the user approve a subset and preserve the rest without blocking.
  const canApply = total > 0

  const applyLabel = approved === 0
    ? 'Acknowledge — keep current Stage 2'
    : `Apply ${approved} approved change${approved !== 1 ? 's' : ''}`

  return (
    <div style={{ maxWidth: 720, padding: 16 }}>

      {/* Header */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
            {session.entity?.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>
            {candidate.mode === 'reconcile'
              ? 'Stage 2 reconcile review — targeted section update'
              : 'Stage 2 update review — Stage 1 basis has changed'}
          </div>
        </div>
        <button
          onClick={onDiscard}
          style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
            background: 'var(--s2)', border: '1px solid var(--border)',
            borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <i className="ti ti-x" style={{ fontSize: 10 }} /> Discard
        </button>
      </div>

      {/* Preservation banner */}
      <div style={{
        padding: '10px 14px', marginBottom: 12,
        background: 'rgba(99,179,237,.05)', border: '1px solid rgba(99,179,237,.25)',
        borderRadius: 'var(--r)', fontSize: 10, color: '#63b3ed',
        fontFamily: 'var(--fm)', lineHeight: 1.55,
      }}>
        <i className="ti ti-shield-check" style={{ fontSize: 11, marginRight: 6, verticalAlign: -1 }} />
        The existing Stage 2 has <strong>not been changed</strong>. Review each proposed section
        below — approve, refine, or reject individually. Existing pivots and prior assertion
        decisions are preserved regardless of your choices here.
      </div>

      {/* Reconcile context banner — shown only for reconcile candidates */}
      {candidate.mode === 'reconcile' && (
        <div style={{
          padding: '10px 14px', marginBottom: 12,
          background: 'rgba(124,108,250,.05)', border: '1px solid rgba(124,108,250,.2)',
          borderRadius: 'var(--r)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 7,
            fontSize: 10, color: 'var(--a2)', fontFamily: 'var(--fm)', lineHeight: 1.55,
          }}>
            <i className="ti ti-git-merge" style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Targeted reconcile</strong> — only impacted sections were regenerated.{' '}
              <strong>{(candidate.impactedSections || []).length} section{(candidate.impactedSections || []).length !== 1 ? 's' : ''}</strong> updated
              based on <strong>{(candidate.changedStage1Nodes || []).length} Stage 1 change{(candidate.changedStage1Nodes || []).length !== 1 ? 's' : ''}</strong>.
              Sections not listed below are <em>unchanged</em> — only listed sections are eligible for update.
            </div>
          </div>
          {(candidate.impactedSections || []).length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingLeft: 19 }}>
              {candidate.impactedSections.map(s => (
                <span key={s} style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(124,108,250,.1)', color: 'var(--a2)',
                  border: '1px solid rgba(124,108,250,.2)', fontFamily: 'var(--fm)',
                }}>
                  {s.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: `${total} section${total !== 1 ? 's' : ''} changed`, color: 'var(--muted2)' },
          { label: `${approved} approved`,                               color: 'var(--accent)'  },
          { label: `${rejected} rejected`,                               color: '#f87171'        },
          { label: `${pending} pending`,                                 color: 'var(--muted)'   },
        ].map(({ label, color }) => (
          <span key={label} style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3,
            background: `${color}12`, color, border: `1px solid ${color}25`,
          }}>
            {label}
          </span>
        ))}
      </div>

      {/* No-change state */}
      {total === 0 && (
        <div style={{
          padding: 24, textAlign: 'center',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', marginBottom: 12,
        }}>
          <i className="ti ti-circle-check" style={{
            fontSize: 24, display: 'block', marginBottom: 8, color: 'var(--accent)',
          }} />
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            No content changes detected
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>
            The new run produced output identical to the current Stage 2.
            Confirming will update the Stage 1 basis reference.
          </div>
        </div>
      )}

      {/* Artifact cards */}
      {comparison.map(artifact => (
        <ArtifactCard
          key={artifact.id}
          artifact={artifact}
          onDecide={onDecide}
        />
      ))}

      {/* Action bar */}
      <div style={{
        display: 'flex', gap: 8, marginTop: 12, padding: '12px 14px', flexWrap: 'wrap',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r)', alignItems: 'center',
      }}>
        <button
          onClick={onApply}
          disabled={!canApply && total !== 0}
          style={{
            fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
            padding: '6px 16px', borderRadius: 5, cursor: 'pointer', border: 'none',
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <i className="ti ti-check-all" style={{ fontSize: 11 }} />
          {total === 0 ? 'Confirm — update basis' : applyLabel}
        </button>
        <button
          onClick={onDiscard}
          style={{
            fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
            padding: '6px 14px', borderRadius: 5, cursor: 'pointer',
            background: 'var(--s2)', color: 'var(--muted)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <i className="ti ti-x" style={{ fontSize: 10 }} /> Discard rerun candidate
        </button>
        {pending > 0 && total > 0 && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
            marginLeft: 'auto',
          }}>
            {pending} pending → will keep current
          </span>
        )}
        {pending === 0 && total > 0 && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
            marginLeft: 'auto',
          }}>
            All sections decided
          </span>
        )}
      </div>
    </div>
  )
}
