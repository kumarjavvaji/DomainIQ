import React, { useState } from 'react'
import { computePivotRecommendations, recommendTargetNodes } from '../v4utils'

// ── Section wrapper with collapse toggle ──────────────────────────────────────
function Section({ title, icon, count, children, defaultOpen = true, accentColor }) {
  const [open, setOpen] = useState(defaultOpen)
  const color = accentColor || 'var(--accent)'
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', marginBottom: 10, overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 12px', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          userSelect: 'none',
        }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 12, color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{title}</span>
        {count != null && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
            color, background: `${color}14`, border: `1px solid ${color}30`,
          }}>
            {count}
          </span>
        )}
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)' }} />
      </div>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  )
}

// ── Node reference badge — links Stage 2 evidence back to Stage 1 ─────────────
function NodeRef({ nodeId, nodes }) {
  const node = nodes?.find(n => n.id === nodeId)
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color: 'var(--a2)', background: 'rgba(124,108,250,.1)', border: '1px solid rgba(124,108,250,.2)',
      whiteSpace: 'nowrap',
    }}
      title={node?.statement || nodeId}
    >
      {nodeId}
    </span>
  )
}

// ── Relationship badge ─────────────────────────────────────────────────────────
function RelBadge({ rel }) {
  const cfg = {
    supports:     { color: 'var(--accent)',  label: 'supports' },
    contradicts:  { color: '#f87171',        label: 'contradicts' },
    qualifies:    { color: '#fb923c',        label: 'qualifies' },
    unresolved:   { color: 'var(--muted)',   label: 'unresolved' },
  }[rel] || { color: 'var(--muted)', label: rel }
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color: cfg.color, background: `${cfg.color}14`, border: `1px solid ${cfg.color}30`,
    }}>
      {cfg.label}
    </span>
  )
}

// ── Refinement type badge ──────────────────────────────────────────────────────
function RefinementBadge({ type }) {
  const colors = {
    strengthened: 'var(--accent)',
    narrowed:     'var(--a4)',
    qualified:    '#fb923c',
    weakened:     '#f87171',
    contradicted: '#f87171',
    unresolved:   'var(--muted)',
  }
  const color = colors[type] || 'var(--muted)'
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color, background: `${color}14`, border: `1px solid ${color}30`,
    }}>
      {type}
    </span>
  )
}

// ── Main Stage 2 Panel ─────────────────────────────────────────────────────────
export default function Stage2Panel({
  session, stage2,
  isStale,
  onAcceptRefinement, onRejectRefinement,
  onBackToStage1,
  onRunPivot,
  onAcceptPivotUpdate, onRefinePivotUpdate, onRejectPivotUpdate,
  onRerunStage2,
  hasStage3, onRunStage3, onViewStage3,
  // Severity-aware stale banner props — present only when stage1Snapshot exists
  stage1ChangeSeverity,  // 'cosmetic'|'minor_clarification'|'substantive_refinement'|'material_reframing'|'major_basis_change'|null
  onReconcileStage2,     // () => void — triggers targeted reconcile generation
  onUpdateBasisOnly,     // () => void — marks Stage 2 current with no LLM call (cosmetic only)
}) {
  const stage1Nodes = session.stage1?.nodes || []

  return (
    <div style={{ maxWidth: 720, padding: 16 }}>

      {/* Header */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{session.entity.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>
            Stage 2 — research expansion & evidence consolidation
          </div>
        </div>
        <button
          onClick={onBackToStage1}
          style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
            background: 'var(--s2)', border: '1px solid var(--border)',
            borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 10 }} /> Stage 1
        </button>
      </div>

      {/* Stale banner — shown when Stage 1 has changed since Stage 2 was generated.
          Severity controls which action buttons are shown — see StaleBanner for details. */}
      {isStale && (
        <StaleBanner
          severity={stage1ChangeSeverity}
          onRerun={onRerunStage2}
          onReconcile={onReconcileStage2}
          onUpdateBasisOnly={onUpdateBasisOnly}
        />
      )}

      {/* Invalid-state banner — shown when summary is absent (truncation / wrapper drift / retrieval_failed fallback) */}
      {!stage2.summary && (
        <InvalidStage2Banner stage2={stage2} onRerun={onRerunStage2} />
      )}

      {/* 1 — Summary */}
      {stage2.summary && (
        <Section title="Stage 2 summary" icon="ti-chart-bar" accentColor="var(--accent)">
          <SummarySection summary={stage2.summary} />
        </Section>
      )}

      {/* 2 — Evidence Consolidation */}
      {stage2.evidenceConsolidation?.length > 0 && (
        <Section
          title="Evidence consolidation"
          icon="ti-list-search"
          count={stage2.evidenceConsolidation.length}
          accentColor="var(--accent)"
        >
          <EvidenceSection items={stage2.evidenceConsolidation} stage1Nodes={stage1Nodes} />
        </Section>
      )}

      {/* 3 — Competitor Map */}
      {stage2.competitorMap?.length > 0 && (
        <Section
          title="Competitor maturity map"
          icon="ti-git-compare"
          count={stage2.competitorMap.length}
          accentColor="var(--a4)"
        >
          <CompetitorSection items={stage2.competitorMap} />
        </Section>
      )}

      {/* 4 — Emerging Entrants */}
      {stage2.emergingEntrants?.length > 0 && (
        <Section
          title="Emerging entrants"
          icon="ti-rocket"
          count={stage2.emergingEntrants.length}
          accentColor="var(--a2)"
          defaultOpen={false}
        >
          <EntrantsSection items={stage2.emergingEntrants} stage1Nodes={stage1Nodes} />
        </Section>
      )}

      {/* 5 — Adjacency Opportunities */}
      {stage2.adjacencyOpportunities?.length > 0 && (
        <Section
          title="Adjacency & acquisition opportunities"
          icon="ti-arrows-join"
          count={stage2.adjacencyOpportunities.length}
          accentColor="var(--a2)"
          defaultOpen={false}
        >
          <AdjacencySection items={stage2.adjacencyOpportunities} stage1Nodes={stage1Nodes} />
        </Section>
      )}

      {/* 6 — Refined Assertions */}
      {stage2.refinedAssertions?.length > 0 && (
        <Section
          title="Refined assertions"
          icon="ti-pencil"
          count={stage2.refinedAssertions.length}
          accentColor="#fb923c"
        >
          <RefinedAssertionsSection
            items={stage2.refinedAssertions}
            stage1Nodes={stage1Nodes}
            onAccept={onAcceptRefinement}
            onReject={onRejectRefinement}
          />
        </Section>
      )}

      {/* 7 — Contradiction Map */}
      {stage2.contradictionMap?.length > 0 && (
        <Section
          title="Contradiction map"
          icon="ti-arrows-opposite"
          count={stage2.contradictionMap.length}
          accentColor="#fb923c"
        >
          <ContradictionSection items={stage2.contradictionMap} stage1Nodes={stage1Nodes} />
        </Section>
      )}

      {/* 8 — Unresolved Questions */}
      {stage2.unresolvedQuestions?.length > 0 && (
        <Section
          title="Unresolved questions"
          icon="ti-question-mark"
          count={stage2.unresolvedQuestions.length}
          accentColor="var(--muted)"
          defaultOpen={false}
        >
          <UnresolvedSection items={stage2.unresolvedQuestions} />
        </Section>
      )}

      {/* 9 — Stage 3 Readiness */}
      {stage2.stage3ReadinessSummary && (
        <Section
          title="Stage 3 readiness"
          icon="ti-arrow-right-circle"
          accentColor="var(--accent)"
        >
          <Stage3ReadinessSection data={stage2.stage3ReadinessSummary} />
        </Section>
      )}

      {/* 10 — Recommended Next Actions */}
      {stage2.recommendedNextActions?.length > 0 && (
        <Section
          title="Recommended next actions"
          icon="ti-checklist"
          count={stage2.recommendedNextActions.length}
          accentColor="var(--muted)"
          defaultOpen={false}
        >
          <NextActionsSection items={stage2.recommendedNextActions} />
        </Section>
      )}

      {/* Pivot context — surfaces completed pivots before the launcher */}
      <PivotContextSection
        stage2={stage2}
        onAcceptPivotUpdate={onAcceptPivotUpdate}
        onRefinePivotUpdate={onRefinePivotUpdate}
        onRejectPivotUpdate={onRejectPivotUpdate}
      />

      {/* Pivot launcher — for generating new pivots and reconfiguring existing ones */}
      <PivotLauncher
        session={session}
        stage2={stage2}
        onRunPivot={onRunPivot}
        onAcceptPivotUpdate={onAcceptPivotUpdate}
        onRefinePivotUpdate={onRefinePivotUpdate}
        onRejectPivotUpdate={onRejectPivotUpdate}
      />

      {/* Stage 3 trigger — rendered below pivot launcher */}
      <Stage3Trigger
        hasStage3={hasStage3}
        onRun={onRunStage3}
        onView={onViewStage3}
      />

    </div>
  )
}

// ── Section renderers ──────────────────────────────────────────────────────────

function SummarySection({ summary }) {
  if (!summary) return null
  const fields = [
    { key: 'whatChanged',       label: 'What changed',          color: 'var(--accent)' },
    { key: 'strongestEvidence', label: 'Strongest evidence',    color: 'var(--accent)' },
    { key: 'weakestAreas',      label: 'Weakest areas',         color: '#fb923c' },
    { key: 'dominantTensions',  label: 'Dominant tensions',     color: '#fb923c' },
    { key: 'likelyDirection',   label: 'Likely direction',      color: 'var(--a4)' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map(f => summary[f.key] ? (
        <div key={f.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: f.color,
            padding: '2px 6px', borderRadius: 3,
            background: `${f.color}14`, border: `1px solid ${f.color}25`,
            whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1,
          }}>
            {f.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.65 }}>
            {summary[f.key]}
          </div>
        </div>
      ) : null)}
    </div>
  )
}

function EvidenceSection({ items, stage1Nodes }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <NodeRef nodeId={item.nodeId} nodes={stage1Nodes} />
            <RelBadge rel={item.relationship} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 7, fontStyle: 'italic' }}>
            "{item.nodeStatement}"
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 8 }}>
            {item.evidenceSummary}
          </div>
          {item.sources?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {item.sources.map((src, j) => (
                <div key={j} style={{
                  fontSize: 10, padding: '6px 8px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--a4)', fontSize: 10, fontWeight: 500, textDecoration: 'none' }}
                    >
                      {src.title}
                    </a>
                    <RelBadge rel={src.relationship} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.55, fontStyle: 'italic' }}>
                    "{src.snippet}"
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function CompetitorSection({ items }) {
  const typeColor = t => t === 'mature' ? '#fb923c' : t === 'differentiated' ? 'var(--a2)' : 'var(--a4)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((c, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
            <span style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
              color: typeColor(c.type), background: `${typeColor(c.type)}14`,
              border: `1px solid ${typeColor(c.type)}30`,
            }}>
              {c.type}
            </span>
          </div>
          {[
            { label: 'Segment fit',          value: c.segmentFit },
            { label: 'Capability gaps',       value: c.capabilityGaps },
            { label: 'Strategic divergence',  value: c.strategicDivergence },
            { label: 'Implications',          value: c.implications },
          ].map(row => row.value ? (
            <div key={row.label} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 2 }}>
                {row.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{row.value}</div>
            </div>
          ) : null)}
        </div>
      ))}
    </div>
  )
}

function EntrantsSection({ items, stage1Nodes }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((e, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{e.name}</span>
            {e.relevantTo && e.relevantTo !== 'open_question' && (
              <NodeRef nodeId={e.relevantTo} nodes={stage1Nodes} />
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 5 }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginRight: 4 }}>Capability:</span>
            {e.capability}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c', marginRight: 4 }}>Implication:</span>
            {e.strategicImplication}
          </div>
        </div>
      ))}
    </div>
  )
}

function AdjacencySection({ items, stage1Nodes }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((a, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{a.area}</span>
            {(a.connectedNodeIds || []).map(id => (
              <NodeRef key={id} nodeId={id} nodes={stage1Nodes} />
            ))}
          </div>
          {[
            { label: 'Partnership logic', value: a.partnershipLogic },
            { label: 'Acquisition logic', value: a.acquisitionLogic },
            { label: 'Build vs buy',      value: a.buildVsBuy },
            { label: 'Risks',             value: a.risks },
          ].map(row => row.value ? (
            <div key={row.label} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 2 }}>
                {row.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{row.value}</div>
            </div>
          ) : null)}
        </div>
      ))}
    </div>
  )
}

function RefinedAssertionsSection({ items, stage1Nodes, onAccept, onReject }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 2 }}>
        <i className="ti ti-info-circle" style={{ fontSize: 10, verticalAlign: -1 }} /> Accepted refinements are approved for downstream synthesis. Stage 1 remains preserved as the original research basis.
      </div>
      {items.map((r, i) => {
        const status = r.userStatus || 'pending'
        return (
          <div key={i} style={{
            padding: 10, borderRadius: 6,
            background: status === 'accepted' ? 'rgba(0,229,180,.05)' :
                        status === 'rejected'  ? 'rgba(248,113,113,.04)' : 'var(--s2)',
            border: `1px solid ${status === 'accepted' ? 'rgba(0,229,180,.25)' :
                                  status === 'rejected'  ? 'rgba(248,113,113,.2)' : 'var(--border)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
              <NodeRef nodeId={r.nodeId} nodes={stage1Nodes} />
              <RefinementBadge type={r.refinementType} />
              {r.confidenceChange !== 'unchanged' && (
                <span style={{
                  fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                  color: r.confidenceChange === 'increased' ? 'var(--accent)' : '#f87171',
                  background: r.confidenceChange === 'increased' ? 'rgba(0,229,180,.1)' : 'rgba(248,113,113,.08)',
                }}>
                  confidence {r.confidenceChange}
                </span>
              )}
            </div>

            {r.originalStatement && (
              <div style={{
                fontSize: 10, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 6,
                padding: '5px 8px', background: 'rgba(249,115,22,.04)',
                border: '1px solid rgba(249,115,22,.15)', borderRadius: 5,
              }}>
                <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a3)', display: 'block', marginBottom: 2 }}>original:</span>
                {r.originalStatement}
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65, marginBottom: 6 }}>
              {r.revisedStatement}
            </div>

            {r.reason && (
              <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', fontStyle: 'italic', marginBottom: 8 }}>
                <i className="ti ti-info-circle" style={{ fontSize: 10, verticalAlign: -1 }} /> {r.reason}
              </div>
            )}

            {status === 'pending' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => onAccept(r.nodeId)}
                  style={{
                    fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px',
                    border: '1px solid rgba(0,229,180,.3)', borderRadius: 5, cursor: 'pointer',
                    background: 'rgba(0,229,180,.08)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}
                >
                  <i className="ti ti-check" style={{ fontSize: 9 }} /> Accept proposal
                </button>
                <button
                  onClick={() => onReject(r.nodeId)}
                  style={{
                    fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px',
                    border: '1px solid rgba(248,113,113,.25)', borderRadius: 5, cursor: 'pointer',
                    background: 'transparent', color: '#f87171',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}
                >
                  <i className="ti ti-x" style={{ fontSize: 9 }} /> Reject
                </button>
              </div>
            )}
            {status !== 'pending' && (
              <div style={{
                fontSize: 9, fontFamily: 'var(--fm)',
                color: status === 'accepted' ? 'var(--accent)' : '#f87171',
              }}>
                <i className={`ti ti-${status === 'accepted' ? 'check' : 'x'}`} style={{ fontSize: 9 }} /> {status}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ContradictionSection({ items, stage1Nodes }) {
  const resColor = r => r === 'resolved' ? 'var(--accent)' : r === 'partial' ? 'var(--a3)' : '#fb923c'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: '#fb923c', marginBottom: 2 }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 10, verticalAlign: -1 }} /> Tensions preserved intentionally — do not force resolution prematurely.
      </div>
      {items.map((c, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'rgba(251,146,60,.04)', border: '1px solid rgba(251,146,60,.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
              color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)',
            }}>
              {c.tensionType?.replace(/_/g, ' ')}
            </span>
            <span style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
              color: resColor(c.resolution), background: `${resColor(c.resolution)}14`,
            }}>
              {c.resolution}
            </span>
            {(c.nodeIds || []).map(id => (
              <NodeRef key={id} nodeId={id} nodes={stage1Nodes} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65, marginBottom: 5 }}>
            {c.description}
          </div>
          {c.resolutionNote && (
            <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', fontStyle: 'italic' }}>
              {c.resolutionNote}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function UnresolvedSection({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((q, i) => (
        <div key={i} style={{
          fontSize: 11, color: 'var(--muted2)', lineHeight: 1.65,
          padding: '6px 10px', borderLeft: '2px solid var(--border2)',
        }}>
          {q}
        </div>
      ))}
    </div>
  )
}

function Stage3ReadinessSection({ data }) {
  const groups = [
    { key: 'highConfidenceFindings', label: 'High-confidence findings', color: 'var(--accent)' },
    { key: 'strongestThemes',        label: 'Strongest themes',         color: 'var(--accent)' },
    { key: 'capabilityGaps',         label: 'Capability gaps',          color: '#fb923c' },
    { key: 'refinedTensions',        label: 'Refined tensions',         color: '#fb923c' },
    { key: 'unresolvedBlockers',     label: 'Unresolved blockers',      color: '#f87171' },
    { key: 'strategicImplications',  label: 'Strategic implications',   color: 'var(--a4)' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {groups.map(g => (data[g.key]?.length > 0) ? (
        <div key={g.key}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: g.color,
            textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5,
          }}>
            {g.label}
          </div>
          {data[g.key].map((item, i) => (
            <div key={i} style={{
              fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 3,
              paddingLeft: 10, borderLeft: `2px solid ${g.color}40`,
            }}>
              {item}
            </div>
          ))}
        </div>
      ) : null)}
    </div>
  )
}

function NextActionsSection({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
            flexShrink: 0, paddingTop: 2,
          }}>
            {i + 1}.
          </span>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.65 }}>{a}</div>
        </div>
      ))}
    </div>
  )
}

// ── Stale Stage 2 banner ───────────────────────────────────────────────────────
//
// Severity-aware: button set changes based on the type of Stage 1 change detected.
//
//   severity === null          → no stage1Snapshot (pre-feature session)
//                                Shows single "Regenerate" button (original behavior).
//
//   'cosmetic'                 → only status/accept-reject changed, no text edits.
//                                Primary: "Update basis only" (no LLM call).
//                                Secondary: "Reconcile" + "Full rerun".
//
//   'minor_clarification'
//   'substantive_refinement'   → statement or confidence changes on 1-3 nodes.
//                                Primary: "Reconcile impacted sections" (targeted LLM).
//                                Secondary: "Full rerun".
//
//   'material_reframing'
//   'major_basis_change'       → 4+ statement changes or structural add/remove.
//                                Primary: "Full Stage 2 rerun — recommended" (prominent).
//                                Secondary: "Reconcile instead" (escape hatch).

function StaleBanner({ severity, onRerun, onReconcile, onUpdateBasisOnly }) {
  const SEVERITY_COPY = {
    null:                    { msg: 'Stage 2 was generated from an older Stage 1 basis.',                                           color: '#fb923c' },
    cosmetic:                { msg: 'Stage 1 has minor status-only changes. Stage 2 content is likely still valid.',                color: 'var(--a4)'  },
    minor_clarification:     { msg: 'Stage 1 has confidence or status changes that may affect a few Stage 2 sections.',            color: '#fb923c' },
    substantive_refinement:  { msg: 'Stage 1 has statement changes on 1–3 nodes. Some Stage 2 sections may need updating.',        color: '#fb923c' },
    material_reframing:      { msg: 'Stage 1 has broad statement changes across multiple nodes. A full rerun is recommended.',      color: '#f87171' },
    major_basis_change:      { msg: 'Stage 1 has structural changes (nodes added or removed). A full Stage 2 rerun is recommended.', color: '#f87171' },
  }

  const cfg   = SEVERITY_COPY[severity ?? null] || SEVERITY_COPY[null]
  const color = cfg.color

  const btnBase = {
    fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
    padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
  }

  let buttons
  if (!severity) {
    // No snapshot — legacy session; single rerun button (original behavior)
    buttons = (
      <button onClick={onRerun} style={{ ...btnBase, background: '#fb923c', color: '#fff', border: 'none' }}>
        <i className="ti ti-refresh" style={{ fontSize: 11 }} /> Regenerate Stage 2 from updated basis
      </button>
    )
  } else if (severity === 'cosmetic') {
    buttons = (
      <>
        <button
          onClick={onUpdateBasisOnly}
          style={{ ...btnBase, background: 'var(--a4)', color: '#fff', border: 'none' }}
          title="Marks Stage 2 as current with this basis — no LLM call"
        >
          <i className="ti ti-database-check" style={{ fontSize: 11 }} /> Update basis only
        </button>
        {onReconcile && (
          <button
            onClick={onReconcile}
            style={{ ...btnBase, background: 'none', border: '1px solid rgba(90,80,220,.35)', color: 'var(--a4)' }}
          >
            <i className="ti ti-git-merge" style={{ fontSize: 11 }} /> Reconcile
          </button>
        )}
        <button
          onClick={onRerun}
          style={{ ...btnBase, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <i className="ti ti-refresh" style={{ fontSize: 11 }} /> Full rerun
        </button>
      </>
    )
  } else if (severity === 'minor_clarification' || severity === 'substantive_refinement') {
    buttons = (
      <>
        <button
          onClick={onReconcile}
          style={{ ...btnBase, background: '#fb923c', color: '#fff', border: 'none' }}
        >
          <i className="ti ti-git-merge" style={{ fontSize: 11 }} /> Reconcile impacted sections
        </button>
        <button
          onClick={onRerun}
          style={{ ...btnBase, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <i className="ti ti-refresh" style={{ fontSize: 11 }} /> Full rerun
        </button>
      </>
    )
  } else {
    // material_reframing | major_basis_change
    buttons = (
      <>
        <button
          onClick={onRerun}
          style={{ ...btnBase, background: '#f87171', color: '#fff', border: 'none' }}
        >
          <i className="ti ti-refresh" style={{ fontSize: 11 }} /> Full Stage 2 rerun — recommended
        </button>
        {onReconcile && (
          <button
            onClick={onReconcile}
            style={{ ...btnBase, background: 'none', border: '1px solid rgba(248,113,113,.3)', color: '#f87171' }}
          >
            <i className="ti ti-git-merge" style={{ fontSize: 11 }} /> Reconcile instead
          </button>
        )}
      </>
    )
  }

  return (
    <div style={{
      padding: '10px 14px',
      background: `${color}08`,
      border: `1px solid ${color}40`,
      borderRadius: 'var(--r)',
      marginBottom: 14,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 13, color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color, fontFamily: 'var(--fm)', flex: 1 }}>
        {cfg.msg}
      </span>
      {buttons}
    </div>
  )
}

// ── Invalid Stage 2 state banner ───────────────────────────────────────────────
// Rendered when stage2.summary is absent — surfaces the failure cause instead of
// crashing silently. Does not dump raw JSON. Shows only actionable diagnostic info.

function InvalidStage2Banner({ stage2, onRerun }) {
  const isRetrievalFailed = stage2.decision === 'retrieval_failed'

  // Strip internal bookkeeping keys — show only schema-level keys
  const metaKeys = new Set(['id', 'stageNumber', 'generatedAt', '_rawSearchBlocks'])
  const presentKeys = Object.keys(stage2).filter(k => !metaKeys.has(k))

  let cause
  if (isRetrievalFailed) {
    cause = 'The retrieval pipeline returned a pressure-test fallback object instead of a Stage 2 response. This typically means the response JSON could not be extracted — likely due to response truncation or a parse error in the final text block.'
  } else if (presentKeys.length > 0 && !presentKeys.includes('summary')) {
    cause = 'Response JSON parsed successfully but uses an unexpected shape — possibly wrapped under a container key, or missing required top-level fields. The expected top-level key "summary" was not found.'
  } else {
    cause = 'Stage 2 response parsed but produced an empty or unrecognised schema. Re-running Stage 2 may resolve this.'
  }

  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(248,113,113,.05)',
      border: '1px solid rgba(248,113,113,.3)',
      borderRadius: 'var(--r)',
      marginBottom: 14,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#f87171', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#f87171' }}>
          Stage 2 response did not match expected schema
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>

        {/* decision badge */}
        {isRetrievalFailed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0 }}>
              decision:
            </span>
            <span style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 7px', borderRadius: 3,
              color: '#f87171', background: 'rgba(248,113,113,.1)',
              border: '1px solid rgba(248,113,113,.25)',
            }}>
              retrieval_failed
            </span>
          </div>
        )}

        {/* Present keys */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0 }}>
            available keys:
          </span>
          {presentKeys.length > 0
            ? presentKeys.map(k => (
                <span key={k} style={{
                  fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                  color: 'var(--muted2)', background: 'var(--s2)', border: '1px solid var(--border)',
                }}>
                  {k}
                </span>
              ))
            : <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', fontStyle: 'italic' }}>none</span>
          }
        </div>

        {/* Cause explanation */}
        <div style={{
          fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65,
          padding: '7px 9px',
          background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 5,
        }}>
          {cause}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={onRerun}
            style={{
              fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
              padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', border: 'none',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 11 }} /> Re-run Stage 2
          </button>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
            If this recurs, check the API token limit or inspect the raw session in localStorage.
          </span>
        </div>

      </div>
    </div>
  )
}

// ── Pivot system ───────────────────────────────────────────────────────────────

const PIVOT_TYPE_META = {
  contextual_competition:   { label: 'Competitor context',       icon: 'ti-git-compare' },
  operational_constraints:  { label: 'Operational constraints',  icon: 'ti-settings-cog' },
  adoption_dynamics:        { label: 'Adoption dynamics',        icon: 'ti-users' },
  business_model_pressures: { label: 'Business model pressures', icon: 'ti-currency-dollar' },
  emerging_disruption:      { label: 'Emerging disruption',      icon: 'ti-rocket' },
  adjacent_capabilities:    { label: 'Adjacent capabilities',    icon: 'ti-arrows-join-2' },
}

const SECTION_COLORS = {
  evidenceConsolidation:  'var(--accent)',
  competitorMap:          'var(--a4)',
  adjacencyOpportunities: 'var(--a2)',
  contradictionMap:       '#fb923c',
  unresolvedQuestions:    'var(--muted)',
  stage3ReadinessSummary: 'var(--accent)',
  general:                'var(--muted2)',
}

function CountBadge({ count, color }) {
  const c = color || 'var(--muted)'
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color: c, background: `${c}14`, border: `1px solid ${c}30`,
    }}>
      {count}
    </span>
  )
}

// ── PivotContextSection — surfaces completed pivot work in the main Stage 2 flow ──
//
// Rendered above PivotLauncher so approved/pending pivot work is visible without
// opening the "Add pivot" launcher. Only shows pivots with status === 'complete'.
// Reuses ProposedUpdateCard for the per-update approve/refine/reject controls.

function PivotContextCard({ pivot, onAcceptUpdate, onRefineUpdate, onRejectUpdate }) {
  const meta     = PIVOT_TYPE_META[pivot.type] || { label: pivot.type, icon: 'ti-bolt' }
  const pending  = (pivot.proposedUpdates || []).filter(u => u.status === 'proposed').length
  const accepted = (pivot.proposedUpdates || []).filter(u => ['accepted', 'refined'].includes(u.status)).length
  const rejected = (pivot.proposedUpdates || []).filter(u => u.status === 'rejected').length

  return (
    <div style={{ marginBottom: 12 }}>
      {/* Pivot header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
        <i className={`ti ${meta.icon}`} style={{ fontSize: 12, color: 'var(--a2)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>{meta.label}</span>
        {pending  > 0 && <CountBadge count={`${pending} pending`}  color="#fb923c"       />}
        {accepted > 0 && <CountBadge count={`${accepted} accepted`} color="var(--accent)"/>}
        {rejected > 0 && <CountBadge count={`${rejected} rejected`} color="#f87171"       />}
      </div>

      {/* Finding summary */}
      {pivot.displaySummary && (
        <div style={{
          padding: '8px 10px', borderRadius: 5, marginBottom: 10,
          background: 'rgba(124,108,250,.05)', border: '1px solid rgba(124,108,250,.15)',
          fontSize: 11, color: 'var(--text)', lineHeight: 1.65,
        }}>
          {pivot.displaySummary}
        </div>
      )}

      {/* Proposed updates */}
      {(pivot.proposedUpdates || []).length > 0 && (
        <>
          <div style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 6,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            Proposed updates
            {accepted > 0 && <CountBadge count={`${accepted} accepted`} color="var(--accent)" />}
            {rejected > 0 && <CountBadge count={`${rejected} rejected`} color="#f87171"       />}
            {pending  > 0 && <CountBadge count={`${pending} pending`}   color="var(--muted)"  />}
          </div>
          {pivot.proposedUpdates.map(u => (
            <ProposedUpdateCard
              key={u.id}
              update={u}
              onAccept={() => onAcceptUpdate(u.id)}
              onRefine={text => onRefineUpdate(u.id, text)}
              onReject={() => onRejectUpdate(u.id)}
            />
          ))}
        </>
      )}
    </div>
  )
}

function PivotContextSection({ stage2, onAcceptPivotUpdate, onRefinePivotUpdate, onRejectPivotUpdate }) {
  const completedPivots = (stage2.pivots || []).filter(p => p.status === 'complete')
  if (completedPivots.length === 0) return null

  const totalPending = completedPivots.reduce(
    (n, p) => n + (p.proposedUpdates || []).filter(u => u.status === 'proposed').length,
    0
  )
  const sectionCount = totalPending > 0 ? `${totalPending} pending` : completedPivots.length

  return (
    <Section
      title="Pivot context"
      icon="ti-bolt"
      accentColor="var(--a2)"
      count={sectionCount}
      defaultOpen={true}
    >
      {completedPivots.map(pivot => (
        <PivotContextCard
          key={pivot.id || pivot.type}
          pivot={pivot}
          onAcceptUpdate={updateId => onAcceptPivotUpdate(pivot.type, updateId)}
          onRefineUpdate={(updateId, text) => onRefinePivotUpdate(pivot.type, updateId, text)}
          onRejectUpdate={updateId => onRejectPivotUpdate(pivot.type, updateId)}
        />
      ))}
    </Section>
  )
}

// ── PivotLauncher ──────────────────────────────────────────────────────────────
function PivotLauncher({ session, stage2, onRunPivot, onAcceptPivotUpdate, onRefinePivotUpdate, onRejectPivotUpdate }) {
  const stage1Nodes = session.stage1?.nodes || []
  const recs        = computePivotRecommendations(session)

  const [open, setOpen]               = useState(false)
  const [addingPivot, setAddingPivot] = useState(false)
  const [cards, setCards]             = useState(() =>
    recs.map(r => ({
      type:          r.type,
      priority:      r.priority,
      targetNodeIds: recommendTargetNodes(r.type, stage1Nodes, stage2),
      selectorOpen:  false,
      direction:     '',
    }))
  )

  function updateTargets(idx, newIds) {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, targetNodeIds: newIds } : c))
  }

  function updateDirection(idx, value) {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, direction: value } : c))
  }

  function toggleSelector(idx) {
    setCards(prev => prev.map((c, i) =>
      i === idx ? { ...c, selectorOpen: !c.selectorOpen }
                : { ...c, selectorOpen: false }
    ))
  }

  function addPivotCard(type) {
    if (cards.some(c => c.type === type)) return
    setCards(prev => [...prev, {
      type,
      priority:      'manual',
      targetNodeIds: recommendTargetNodes(type, stage1Nodes, stage2),
      selectorOpen:  false,
      direction:     '',
    }])
    setAddingPivot(false)
  }

  const indicatorText = recs.length > 0
    ? `${recs.length} recommended investigative pivot${recs.length > 1 ? 's' : ''} available`
    : null
  const generatingCount = (stage2.pivots || []).filter(p => p.status === 'generating').length

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', marginTop: 10, overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 12px', cursor: 'pointer', userSelect: 'none',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
      >
        <i className="ti ti-bolt" style={{ fontSize: 12, color: 'var(--a2)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>Investigative pivots</span>
        {generatingCount > 0 && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 8px', borderRadius: 3,
            color: '#fb923c', background: 'rgba(251,146,60,.1)', border: '1px solid rgba(251,146,60,.25)',
          }}>
            running…
          </span>
        )}
        {!open && indicatorText && generatingCount === 0 && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 8px', borderRadius: 3,
            color: 'var(--a2)', background: 'rgba(124,108,250,.1)', border: '1px solid rgba(124,108,250,.2)',
          }}>
            {indicatorText}
          </span>
        )}
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)' }} />
      </div>

      {open && (
        <div style={{ padding: 12 }}>
          {recs.length > 0 && (
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 10 }}>
              Recommended based on orientation findings:
            </div>
          )}
          {recs.length === 0 && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
              No pivots recommended from orientation pass — add one manually below.
            </div>
          )}

          {cards.map((card, idx) => {
            // Reload-safe: latest result for this pivot type from persisted stage2.pivots
            const pivotResult = [...(stage2.pivots || [])].reverse().find(p => p.type === card.type) ?? null
            return (
              <PivotCard
                key={`${card.type}_${idx}`}
                card={card}
                stage1Nodes={stage1Nodes}
                pivotResult={pivotResult}
                onToggleSelector={() => toggleSelector(idx)}
                onUpdateTargets={ids => updateTargets(idx, ids)}
                onUpdateDirection={val => updateDirection(idx, val)}
                onRun={() => onRunPivot && onRunPivot({
                  type:          card.type,
                  title:         PIVOT_TYPE_META[card.type]?.label || card.type,
                  targetNodeIds: card.targetNodeIds,
                  userDirection: card.direction,
                })}
                onAcceptUpdate={updateId => onAcceptPivotUpdate(card.type, updateId)}
                onRefineUpdate={(updateId, text) => onRefinePivotUpdate(card.type, updateId, text)}
                onRejectUpdate={updateId => onRejectPivotUpdate(card.type, updateId)}
              />
            )
          })}

          {addingPivot ? (
            <PivotTypePicker
              existingTypes={cards.map(c => c.type)}
              onSelect={addPivotCard}
              onCancel={() => setAddingPivot(false)}
            />
          ) : (
            <button
              onClick={() => setAddingPivot(true)}
              style={{
                marginTop: 8, fontSize: 9, fontFamily: 'var(--fm)',
                padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                background: 'var(--s2)', border: '1px solid var(--border)',
                color: 'var(--muted2)', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 9 }} /> Add pivot
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── PivotCard ──────────────────────────────────────────────────────────────────
function PivotCard({
  card, stage1Nodes, pivotResult,
  onToggleSelector, onUpdateTargets, onUpdateDirection,
  onRun, onAcceptUpdate, onRefineUpdate, onRejectUpdate,
}) {
  const meta         = PIVOT_TYPE_META[card.type] || { label: card.type, icon: 'ti-bolt' }
  const priorityMeta = {
    high:   { color: 'var(--accent)', label: 'high priority' },
    medium: { color: 'var(--a3)',     label: 'medium priority' },
    low:    { color: 'var(--muted)',  label: 'available' },
    manual: { color: 'var(--muted)', label: 'manual' },
  }[card.priority] || { color: 'var(--muted)', label: card.priority }

  const isGenerating = pivotResult?.status === 'generating'
  const isError      = pivotResult?.status === 'error'
  const isComplete   = pivotResult?.status === 'complete'

  return (
    <div style={{
      padding: 10, borderRadius: 6, marginBottom: 8,
      background: 'var(--s2)',
      border: `1px solid ${isComplete ? 'rgba(124,108,250,.25)' : 'var(--border)'}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <i className={`ti ${meta.icon}`} style={{ fontSize: 12, color: priorityMeta.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{meta.label}</span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
          color: priorityMeta.color, background: `${priorityMeta.color}14`,
          border: `1px solid ${priorityMeta.color}30`,
        }}>
          {priorityMeta.label}
        </span>
        {isGenerating ? (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
            background: 'rgba(251,146,60,.1)', color: '#fb923c',
            border: '1px solid rgba(251,146,60,.3)',
          }}>
            <i className="ti ti-loader" style={{ fontSize: 9 }} /> Running…
          </span>
        ) : (
          <button
            onClick={onRun}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
              cursor: 'pointer', background: 'var(--a2)', color: '#fff', border: 'none',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <i className="ti ti-player-play" style={{ fontSize: 9 }} /> {isComplete ? 'Re-run' : 'Run pivot'}
          </button>
        )}
      </div>

      {/* Direction textarea */}
      <div style={{ marginTop: 8 }}>
        <textarea
          value={card.direction}
          onChange={e => onUpdateDirection(e.target.value)}
          placeholder="Optional: describe what to focus on or what question to answer (leave blank for autonomous analysis)"
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontSize: 10, fontFamily: 'var(--fm)',
            padding: '6px 8px', borderRadius: 4,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--muted2)', resize: 'vertical', lineHeight: 1.5,
          }}
        />
      </div>

      {/* Target nodes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0 }}>
          Targets:
        </span>
        {card.targetNodeIds.length > 0
          ? card.targetNodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={stage1Nodes} />)
          : <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', fontStyle: 'italic' }}>none selected</span>
        }
        <button
          onClick={onToggleSelector}
          style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
            cursor: 'pointer', background: 'none',
            border: '1px solid var(--border)', color: 'var(--muted)',
          }}
        >
          {card.selectorOpen ? 'close' : 'edit'}
        </button>
      </div>

      {card.selectorOpen && (
        <TargetNodeSelector
          stage1Nodes={stage1Nodes}
          selectedIds={card.targetNodeIds}
          onConfirm={ids => { onUpdateTargets(ids); onToggleSelector() }}
        />
      )}

      {/* Error state */}
      {isError && (
        <div style={{
          marginTop: 10, padding: '8px 10px', borderRadius: 5,
          background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.25)',
          fontSize: 10, color: '#f87171', lineHeight: 1.55,
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 10, verticalAlign: -1 }} /> {pivotResult.errorMessage || 'Pivot failed — try re-running.'}
        </div>
      )}

      {/* Result panel */}
      {isComplete && (
        <PivotResultPanel
          pivot={pivotResult}
          onAcceptUpdate={onAcceptUpdate}
          onRefineUpdate={onRefineUpdate}
          onRejectUpdate={onRejectUpdate}
        />
      )}
    </div>
  )
}

// ── PivotResultPanel ───────────────────────────────────────────────────────────
function PivotResultPanel({ pivot, onAcceptUpdate, onRefineUpdate, onRejectUpdate }) {
  const accepted = (pivot.proposedUpdates || []).filter(u => ['accepted', 'refined'].includes(u.status)).length
  const rejected = (pivot.proposedUpdates || []).filter(u => u.status === 'rejected').length
  const pending  = (pivot.proposedUpdates || []).filter(u => u.status === 'proposed').length

  return (
    <div style={{ marginTop: 12 }}>

      {/* Display summary — always visible */}
      <div style={{
        padding: '8px 10px', borderRadius: 5, marginBottom: 10,
        background: 'rgba(124,108,250,.05)', border: '1px solid rgba(124,108,250,.2)',
      }}>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a2)', marginBottom: 4 }}>
          Pivot finding
        </div>
        <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65 }}>
          {pivot.displaySummary}
        </div>
      </div>

      {/* Proposed updates */}
      {pivot.proposedUpdates?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
            marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            Proposed updates
            {accepted > 0 && <CountBadge count={`${accepted} accepted`} color="var(--accent)" />}
            {rejected > 0 && <CountBadge count={`${rejected} rejected`} color="#f87171" />}
            {pending  > 0 && <CountBadge count={`${pending} pending`} color="var(--muted)" />}
          </div>
          {pivot.proposedUpdates.map(u => (
            <ProposedUpdateCard
              key={u.id}
              update={u}
              onAccept={() => onAcceptUpdate(u.id)}
              onRefine={text => onRefineUpdate(u.id, text)}
              onReject={() => onRejectUpdate(u.id)}
            />
          ))}
        </div>
      )}

      {/* Analysis foundation — collapsed by default */}
      {pivot.analysisFoundation && (
        <Section
          title="Analysis foundation"
          icon="ti-layers-difference"
          accentColor="var(--a2)"
          defaultOpen={false}
        >
          <FoundationBlock foundation={pivot.analysisFoundation} />
        </Section>
      )}

      {/* Unresolved questions — collapsed */}
      {pivot.unresolvedQuestions?.length > 0 && (
        <Section
          title="Unresolved questions"
          icon="ti-question-mark"
          count={pivot.unresolvedQuestions.length}
          accentColor="var(--muted)"
          defaultOpen={false}
        >
          <UnresolvedSection items={pivot.unresolvedQuestions} />
        </Section>
      )}

      {/* Stage 3 implications — collapsed */}
      {pivot.stage3Implications?.length > 0 && (
        <Section
          title="Stage 3 implications"
          icon="ti-arrow-right-circle"
          count={pivot.stage3Implications.length}
          accentColor="var(--accent)"
          defaultOpen={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {pivot.stage3Implications.map((s, i) => (
              <div key={i} style={{
                fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65,
                paddingLeft: 10, borderLeft: '2px solid rgba(0,229,180,.3)',
              }}>
                {s}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Additional search directions — collapsed */}
      {pivot.additionalSearchSuggestions?.length > 0 && (
        <Section
          title="Additional search directions"
          icon="ti-search"
          count={pivot.additionalSearchSuggestions.length}
          accentColor="var(--muted)"
          defaultOpen={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {pivot.additionalSearchSuggestions.map((s, i) => (
              <div key={i} style={{
                fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65,
                padding: '5px 8px', background: 'var(--s2)',
                border: '1px solid var(--border)', borderRadius: 4,
              }}>
                {s}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

// ── FoundationBlock ────────────────────────────────────────────────────────────
function FoundationBlock({ foundation }) {
  const fields = [
    { key: 'userDirectionInterpretation', label: 'Direction interpretation', color: 'var(--muted2)' },
    { key: 'deeperFinding',               label: 'Deeper finding',           color: 'var(--a2)'     },
    { key: 'evidenceSynthesis',           label: 'Evidence synthesis',       color: 'var(--accent)' },
    { key: 'strategicTension',            label: 'Strategic tension',        color: '#fb923c'       },
    { key: 'implicationsForStage3',       label: 'Stage 3 implications',     color: 'var(--accent)' },
    { key: 'recommendedStage3Angle',      label: 'Recommended Stage 3 angle', color: 'var(--a4)'   },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {fields.map(f => foundation[f.key] ? (
        <div key={f.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: f.color,
            padding: '2px 6px', borderRadius: 3, flexShrink: 0,
            background: `${f.color}14`, border: `1px solid ${f.color}25`,
            whiteSpace: 'nowrap', marginTop: 1,
          }}>
            {f.label}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>
            {foundation[f.key]}
          </div>
        </div>
      ) : null)}
      {foundation.assumptionsToTest?.length > 0 && (
        <div>
          <div style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5,
          }}>
            Assumptions to test
          </div>
          {foundation.assumptionsToTest.map((a, i) => (
            <div key={i} style={{
              fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 4,
              paddingLeft: 10, borderLeft: '2px solid rgba(251,146,60,.3)',
            }}>
              {a}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ProposedUpdateCard ─────────────────────────────────────────────────────────
function ProposedUpdateCard({ update, onAccept, onRefine, onReject }) {
  const [refining, setRefining]   = useState(false)
  const [refinedText, setRefined] = useState(update.proposedText || '')

  const sectionColor = SECTION_COLORS[update.targetSection] || 'var(--muted2)'
  const confColor    = update.confidence === 'high' ? 'var(--accent)' : update.confidence === 'low' ? '#f87171' : 'var(--a3)'
  const statusConfig = {
    accepted: { color: 'var(--accent)', label: 'accepted' },
    refined:  { color: 'var(--a4)',     label: 'refined'  },
    rejected: { color: '#f87171',       label: 'rejected' },
    proposed: { color: 'var(--muted)', label: 'pending'  },
  }[update.status] || { color: 'var(--muted)', label: update.status }
  const isDecided = update.status !== 'proposed'

  return (
    <div style={{
      padding: 10, borderRadius: 5, marginBottom: 7,
      background: isDecided ? 'var(--s2)' : 'var(--surface)',
      border: `1px solid ${isDecided ? statusConfig.color + '30' : 'var(--border)'}`,
      opacity: isDecided ? 0.8 : 1,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
          color: sectionColor, background: `${sectionColor}14`, border: `1px solid ${sectionColor}30`,
        }}>
          {update.targetSection?.replace(/_/g, ' ')}
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
          color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          {update.updateType}
        </span>
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
          color: confColor, background: `${confColor}14`, border: `1px solid ${confColor}30`,
        }}>
          {update.confidence}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'var(--fm)', color: statusConfig.color }}>
          {statusConfig.label}
        </span>
      </div>

      {update.title && (
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 5 }}>
          {update.title}
        </div>
      )}

      {/* Current text — only if modifying */}
      {update.currentText && update.updateType !== 'add' && (
        <div style={{
          fontSize: 10, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 5,
          padding: '5px 8px', background: 'rgba(248,113,113,.04)',
          border: '1px solid rgba(248,113,113,.15)', borderRadius: 4,
        }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', display: 'block', marginBottom: 2 }}>
            current:
          </span>
          {update.currentText}
        </div>
      )}

      {/* Proposed or refined text */}
      {update.status === 'refined' && update.userRefinedText ? (
        <div style={{
          fontSize: 10, color: 'var(--text)', lineHeight: 1.65, marginBottom: 5,
          padding: '5px 8px', background: 'rgba(90,80,220,.05)',
          border: '1px solid rgba(90,80,220,.15)', borderRadius: 4,
        }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a2)', display: 'block', marginBottom: 2 }}>
            your revision:
          </span>
          {update.userRefinedText}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65, marginBottom: 5 }}>
          {update.proposedText}
        </div>
      )}

      {update.rationale && (
        <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', fontStyle: 'italic', marginBottom: 4 }}>
          <i className="ti ti-info-circle" style={{ fontSize: 9, verticalAlign: -1 }} /> {update.rationale}
        </div>
      )}
      {update.evidenceBasis && (
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 4 }}>
          Evidence: {update.evidenceBasis}
        </div>
      )}
      {update.stage3Relevance && (
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', marginBottom: 6 }}>
          Stage 3: {update.stage3Relevance}
        </div>
      )}

      {/* Refine textarea */}
      {refining && (
        <div style={{ marginBottom: 8 }}>
          <textarea
            value={refinedText}
            onChange={e => setRefined(e.target.value)}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 10, fontFamily: 'var(--fm)',
              padding: '6px 8px', borderRadius: 4,
              background: 'var(--surface)', border: '1px solid var(--a2)',
              color: 'var(--text)', resize: 'vertical', lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              onClick={() => { onRefine(refinedText); setRefining(false) }}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
                background: 'var(--a2)', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              Save refined
            </button>
            <button
              onClick={() => setRefining(false)}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
                background: 'none', border: '1px solid var(--border)',
                color: 'var(--muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isDecided && !refining && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onAccept}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
              background: 'rgba(0,229,180,.08)', color: 'var(--accent)',
              border: '1px solid rgba(0,229,180,.3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <i className="ti ti-check" style={{ fontSize: 9 }} /> Accept
          </button>
          <button
            onClick={() => { setRefined(update.proposedText || ''); setRefining(true) }}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
              background: 'rgba(124,108,250,.08)', color: 'var(--a2)',
              border: '1px solid rgba(124,108,250,.25)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <i className="ti ti-pencil" style={{ fontSize: 9 }} /> Refine
          </button>
          <button
            onClick={onReject}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
              background: 'transparent', color: '#f87171',
              border: '1px solid rgba(248,113,113,.25)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 9 }} /> Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ── TargetNodeSelector — inline checkbox list; max 3 selections ──────────────
function TargetNodeSelector({ stage1Nodes, selectedIds, onConfirm }) {
  const MAX = 3
  const [selected, setSelected] = useState(new Set(selectedIds))

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) }
      else if (next.size < MAX) { next.add(id) }
      return next
    })
  }

  return (
    <div style={{
      marginTop: 8, padding: 10,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5,
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 8 }}>
        Select target assertions (max {MAX})
      </div>
      {stage1Nodes.map(n => {
        const checked  = selected.has(n.id)
        const disabled = !checked && selected.size >= MAX
        return (
          <label
            key={n.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 5,
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(n.id)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <div style={{ lineHeight: 1.5 }}>
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '0 5px', borderRadius: 2,
                color: 'var(--a2)', background: 'rgba(124,108,250,.1)', marginRight: 4,
              }}>
                {n.id}
              </span>
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '0 4px', borderRadius: 2,
                background: 'var(--s2)', color: 'var(--muted)', marginRight: 4,
              }}>
                {n.type}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted2)' }}>
                {n.statement.length > 60 ? n.statement.slice(0, 60) + '…' : n.statement}
              </span>
            </div>
          </label>
        )
      })}
      <button
        onClick={() => onConfirm([...selected])}
        style={{
          marginTop: 6, fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px',
          borderRadius: 4, background: 'var(--accent)', color: '#fff',
          border: 'none', cursor: 'pointer',
        }}
      >
        Confirm
      </button>
    </div>
  )
}

// ── Stage 3 trigger — rendered below PivotLauncher ───────────────────────────
function Stage3Trigger({ hasStage3, onRun, onView }) {
  if (hasStage3) {
    return (
      <div style={{
        marginTop: 10, padding: '10px 14px', background: 'var(--s2)',
        border: '1px solid var(--accent)', borderRadius: 'var(--r)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-layers-intersect" style={{ fontSize: 13, color: 'var(--accent)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--accent)' }}>
            Stage 3 — Strategic Synthesis
          </div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 1 }}>
            Thesis, insight clusters, and readiness assessment generated
          </div>
        </div>
        <button
          onClick={onRun}
          style={{
            fontSize: 10, fontFamily: 'var(--fm)',
            padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
            background: 'none', color: 'var(--muted)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <i className="ti ti-refresh" style={{ fontSize: 10 }} />
          Re-run
        </button>
        <button
          onClick={onView}
          style={{
            fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
            padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', border: 'none',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          View Stage 3
          <i className="ti ti-arrow-right" style={{ fontSize: 10 }} />
        </button>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 10, padding: '10px 14px', background: 'var(--s2)',
      border: '1px solid var(--border)', borderRadius: 'var(--r)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <i className="ti ti-layers-intersect" style={{ fontSize: 13, color: 'var(--muted2)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--muted2)' }}>
          Stage 3 — Strategic Synthesis
        </div>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 1 }}>
          Synthesize evidence into thesis, insight clusters, strategic options, and readiness assessment
        </div>
      </div>
      <button
        onClick={onRun}
        style={{
          fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
          padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
          background: 'var(--a2)', color: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <i className="ti ti-player-play" style={{ fontSize: 10 }} />
        Run Stage 3
      </button>
    </div>
  )
}

// ── PivotTypePicker ────────────────────────────────────────────────────────────
function PivotTypePicker({ existingTypes, onSelect, onCancel }) {
  return (
    <div style={{
      marginTop: 8, padding: 10,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5,
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 8 }}>
        Choose a pivot direction
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(PIVOT_TYPE_META).map(([type, meta]) => {
          const already = existingTypes.includes(type)
          return (
            <button
              key={type}
              onClick={() => !already && onSelect(type)}
              disabled={already}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px', borderRadius: 4,
                background: already ? 'var(--s2)' : 'var(--surface)',
                border: '1px solid var(--border)',
                cursor: already ? 'not-allowed' : 'pointer',
                color: already ? 'var(--muted)' : 'var(--muted2)',
                opacity: already ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <i className={`ti ${meta.icon}`} style={{ fontSize: 9 }} />
              {meta.label}
            </button>
          )
        })}
      </div>
      <button
        onClick={onCancel}
        style={{
          marginTop: 8, fontSize: 9, fontFamily: 'var(--fm)',
          color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}
