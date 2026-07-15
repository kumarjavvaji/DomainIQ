import React, { useState } from 'react'
import {
  computePivotRecommendations, recommendTargetNodes,
  buildS2EvidenceCitations, buildS2ItemCitations,
  buildCitationRefs, buildInlineCitationSegments,
  buildStage2ReviewEvent,
} from '../v4utils'
import CitationMarker from './CitationMarker'

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
  stage1ChangeSeverity,
  onReconcileStage2,
  onUpdateBasisOnly,
  // Stage 2 item-level refine/challenge
  onS2Generate,    // async (sectionLabel, op, text) => { proposedText, assessment, citations }
  onS2ItemAccept,  // (itemKey, reviewEvent, acceptedText) => void
}) {
  const stage1Nodes = session.stage1?.nodes || []

  // Shared context threaded to every section renderer and EvidenceBearingItem
  const s2Ctx = {
    s2ReviewMap: stage2.s2ReviewMap || {},
    onGenerate:  onS2Generate  || (() => Promise.resolve({ proposedText: '', assessment: '', citations: [] })),
    onAccept:    onS2ItemAccept || (() => {}),
    stage1Nodes,
  }

  return (
    <div style={{ maxWidth: 720, padding: 16 }}>

      {/* Header */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{session.entity.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>
            Stage 2 — synthesis & reasoning artifact generation
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

      {/* Invalid-state banner — shown when key synthesis sections are absent */}
      {!stage2.strategicThemes && !stage2.readinessAssessment && (
        <InvalidStage2Banner stage2={stage2} onRerun={onRerunStage2} />
      )}

      {/* 1 — Strategic Themes */}
      {stage2.strategicThemes?.length > 0 && (
        <Section
          title="Strategic themes"
          icon="ti-bulb"
          count={stage2.strategicThemes.length}
          accentColor="var(--accent)"
        >
          <StrategicThemesSection items={stage2.strategicThemes} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 2 — Decision Frameworks */}
      {stage2.decisionFrameworks?.length > 0 && (
        <Section
          title="Decision frameworks"
          icon="ti-route"
          count={stage2.decisionFrameworks.length}
          accentColor="var(--a4)"
        >
          <DecisionFrameworksSection items={stage2.decisionFrameworks} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 3 — Scenario Models */}
      {stage2.scenarioModels?.length > 0 && (
        <Section
          title="Scenario models"
          icon="ti-timeline"
          count={stage2.scenarioModels.length}
          accentColor="var(--a2)"
          defaultOpen={false}
        >
          <ScenarioModelsSection items={stage2.scenarioModels} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 4 — Organizational Implications */}
      {stage2.organizationalImplications?.length > 0 && (
        <Section
          title="Organizational implications"
          icon="ti-building"
          count={stage2.organizationalImplications.length}
          accentColor="var(--a2)"
          defaultOpen={false}
        >
          <OrgImplicationsSection items={stage2.organizationalImplications} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 5 — Capability Gaps */}
      {stage2.capabilityGaps?.length > 0 && (
        <Section
          title="Capability gaps"
          icon="ti-alert-circle"
          count={stage2.capabilityGaps.length}
          accentColor="#fb923c"
        >
          <CapabilityGapsSection items={stage2.capabilityGaps} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 6 — Contradiction Analysis */}
      {stage2.contradictionAnalysis?.length > 0 && (
        <Section
          title="Contradiction analysis"
          icon="ti-arrows-opposite"
          count={stage2.contradictionAnalysis.length}
          accentColor="#fb923c"
        >
          <ContradictionAnalysisSection items={stage2.contradictionAnalysis} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 7 — Risk Models */}
      {stage2.riskModels?.length > 0 && (
        <Section
          title="Risk models"
          icon="ti-shield-exclamation"
          count={stage2.riskModels.length}
          accentColor="#f87171"
          defaultOpen={false}
        >
          <RiskModelsSection items={stage2.riskModels} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 8 — Opportunity Models */}
      {stage2.opportunityModels?.length > 0 && (
        <Section
          title="Opportunity models"
          icon="ti-sparkles"
          count={stage2.opportunityModels.length}
          accentColor="var(--a4)"
          defaultOpen={false}
        >
          <OpportunityModelsSection items={stage2.opportunityModels} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 9 — Next Actions */}
      {stage2.nextActions?.length > 0 && (
        <Section
          title="Next actions"
          icon="ti-checklist"
          count={stage2.nextActions.length}
          accentColor="var(--muted)"
          defaultOpen={false}
        >
          <NextActionsSection items={stage2.nextActions} s2Ctx={s2Ctx} />
        </Section>
      )}

      {/* 10 — Readiness Assessment */}
      {stage2.readinessAssessment && (
        <Section
          title="Readiness assessment"
          icon="ti-arrow-right-circle"
          accentColor="var(--accent)"
        >
          <ReadinessAssessmentSection data={stage2.readinessAssessment} s2Ctx={s2Ctx} />
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
        s2Ctx={s2Ctx}
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

// renderCitedText — renders text with inline CitationMarker for any text+citations pair.
// Returns a plain string when citations is empty so callers don't need to branch.
function renderCitedText(text, citations) {
  if (!text) return null
  if (!citations || citations.length === 0) return text
  const refs    = buildCitationRefs(citations)
  const byId    = Object.fromEntries(citations.map(c => [c.id, c]))
  const segs    = buildInlineCitationSegments(text, refs, citations)
  return segs.map((seg, i) => {
    if ('markers' in seg) {
      return seg.markers.map(m => {
        const ref  = refs.find(r => r.marker === m)
        const cite = ref ? byId[ref.citationId] : null
        return <CitationMarker key={`${i}_${m}`} marker={m} citation={cite} />
      })
    }
    return <React.Fragment key={`t${i}`}>{seg.text}</React.Fragment>
  })
}

// ── EvidenceBearingItem ────────────────────────────────────────────────────────
//
// One component applied across every eligible Stage 2 section.
// Provides: inline citation markers, hover tooltip, expandable source panel,
// inherited source-node lineage, Refine / Challenge controls, revision preview
// with inline citations before accept, Accept / Reject, durable review history.
//
// Usage:
//   Text item (no children):  renders `text` with inline markers
//   Complex item (children):  renders children as structured display + adds controls
//   `text` is always used for the prompt and for the original in the preview.
function EvidenceBearingItem({
  itemKey, sectionLabel, text,
  citations = [], sourceNodeIds = [],
  s2Ctx = {}, children,
}) {
  const { s2ReviewMap = {}, onGenerate, onAccept, stage1Nodes = [] } = s2Ctx
  const entry       = s2ReviewMap[itemKey]
  const acceptedText = entry?.acceptedText || null

  const [mode,      setMode]      = useState('idle')  // 'idle'|'generating'|'preview'|'error'
  const [proposal,  setProposal]  = useState(null)
  const [activeOp,  setActiveOp]  = useState(null)
  const [errMsg,    setErrMsg]    = useState(null)
  const [direction, setDirection] = useState('')

  async function handleGenerate(op) {
    if (!text) return
    setActiveOp(op)
    setMode('generating')
    setErrMsg(null)
    const capturedDirection = direction  // snapshot before any async gap
    try {
      const result = await onGenerate(sectionLabel, op, text, capturedDirection)
      setProposal({ ...result, userDirection: capturedDirection || null })
      setMode('preview')
    } catch (e) {
      setErrMsg(e?.message || 'Generation failed')
      setMode('error')
    }
  }

  function handleAccept() {
    const cites = proposal?.citations || []
    const reviewEvent = buildStage2ReviewEvent({
      targetId:        itemKey,
      targetSection:   sectionLabel,
      operation:       activeOp,
      outcome:         'accepted',
      originalText:    text,
      replacementText: proposal?.proposedText || null,
      citations:       cites,
    })
    reviewEvent.userDirection = proposal?.userDirection ?? null
    onAccept(itemKey, reviewEvent, proposal?.proposedText || null)
    setMode('idle')
    setProposal(null)
    setDirection('')
  }

  function handleReject() {
    setMode('idle')
    setProposal(null)
    setDirection('')
  }

  return (
    <div>
      {/* ── Structured (children) or text with markers ── */}
      {children
        ? children
        : text && (
            <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 4 }}>
              {acceptedText
                ? renderCitedText(acceptedText, entry?.latestReview?.citations || citations)
                : renderCitedText(text, citations)}
            </div>
          )
      }

      {/* ── Accepted overlay for complex items (children present) ── */}
      {acceptedText && children && (
        <div style={{
          marginTop: 6, padding: '6px 8px', borderRadius: 5,
          background: 'rgba(0,229,180,.04)', border: '1px solid rgba(0,229,180,.2)',
        }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', display: 'block', marginBottom: 2 }}>
            revised{entry?.latestReview?.createdAt ? ` · ${new Date(entry.latestReview.createdAt).toLocaleTimeString()}` : ''}
          </span>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65 }}>
            {renderCitedText(acceptedText, entry?.latestReview?.citations || [])}
          </div>
        </div>
      )}

      {/* ── Review timestamp for text-only items (no children) ── */}
      {acceptedText && !children && entry?.latestReview && (
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', marginBottom: 4 }}>
          <i className="ti ti-check" style={{ fontSize: 9 }} />{' '}
          revised · {new Date(entry.latestReview.createdAt).toLocaleTimeString()}
        </div>
      )}

      {/* ── Expandable citations source panel ── */}
      {citations.length > 0 && <EvidenceCitationPanel citations={citations} />}

      {/* ── Source-node lineage (no external citations, but nodeIds exist) ── */}
      {citations.length === 0 && sourceNodeIds.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>Source nodes:</span>
          {sourceNodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={stage1Nodes} />)}
        </div>
      )}

      {/* ── Idle: optional direction + Refine / Challenge ── */}
      {mode === 'idle' && (
        <div style={{ marginTop: 7 }}>
          <input
            type="text"
            value={direction}
            onChange={e => setDirection(e.target.value)}
            placeholder="Refinement note (optional)…"
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box',
              fontSize: 10, fontFamily: 'inherit', color: 'var(--text)',
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '3px 8px', outline: 'none',
              marginBottom: 5,
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleGenerate('refine')}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
                cursor: 'pointer', background: 'rgba(56,189,248,.06)',
                border: '1px solid rgba(56,189,248,.2)', color: 'var(--a4)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <i className="ti ti-sparkles" style={{ fontSize: 9 }} /> Refine
            </button>
            <button
              onClick={() => handleGenerate('challenge')}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4,
                cursor: 'pointer', background: 'transparent',
                border: '1px solid var(--border)', color: 'var(--muted)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <i className="ti ti-bolt" style={{ fontSize: 9 }} /> Challenge
            </button>
          </div>
        </div>
      )}

      {/* ── Generating ── */}
      {mode === 'generating' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, marginTop: 7,
          fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
        }}>
          <i className="ti ti-loader" style={{ fontSize: 9 }} />
          {activeOp === 'refine' ? 'Refining...' : 'Challenging...'}
        </div>
      )}

      {/* ── Error ── */}
      {mode === 'error' && (
        <div style={{ marginTop: 7 }}>
          <div style={{ fontSize: 9, color: '#f87171', marginBottom: 4 }}>{errMsg}</div>
          <button
            onClick={() => setMode('idle')}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3,
              cursor: 'pointer', background: 'transparent',
              border: '1px solid var(--border)', color: 'var(--muted)',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Preview: proposed text + inline citations + Accept / Reject ── */}
      {mode === 'preview' && proposal && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 5,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', marginBottom: 6 }}>
            {activeOp === 'refine' ? 'Refined version' : 'Challenge result'} — preview
            {direction && (
              <span style={{ color: 'var(--muted)', marginLeft: 5 }}>
                · directed: &ldquo;{direction}&rdquo;
              </span>
            )}
          </div>

          {/* Original */}
          <div style={{
            fontSize: 9, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 6,
            padding: '4px 6px', background: 'rgba(249,115,22,.04)',
            borderRadius: 4, border: '1px solid rgba(249,115,22,.15)',
          }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a3)', display: 'block', marginBottom: 1 }}>
              original:
            </span>
            {text}
          </div>

          {/* Proposed text — inline citation markers visible before accept */}
          {proposal.proposedText && (
            <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65, marginBottom: 5 }}>
              {renderCitedText(proposal.proposedText, proposal.citations || [])}
            </div>
          )}

          {/* Assessment */}
          {proposal.assessment && (
            <div style={{ fontSize: 10, color: 'var(--muted2)', fontStyle: 'italic', marginBottom: 6 }}>
              <i className="ti ti-info-circle" style={{ fontSize: 10, verticalAlign: -1 }} /> {proposal.assessment}
            </div>
          )}

          {/* Source panel for proposal citations */}
          {(proposal.citations || []).length > 0 && (
            <EvidenceCitationPanel citations={proposal.citations} />
          )}

          {/* Accept / Reject */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={handleAccept}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid rgba(0,229,180,.3)', background: 'rgba(0,229,180,.08)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <i className="ti ti-check" style={{ fontSize: 9 }} /> Accept
            </button>
            <button
              onClick={handleReject}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid rgba(248,113,113,.25)', background: 'transparent', color: '#f87171',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <i className="ti ti-x" style={{ fontSize: 9 }} /> Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Confidence badge ───────────────────────────────────────────────────────────
function ConfidenceBadge({ confidence }) {
  const cfg = {
    high:   { color: 'var(--accent)',  label: 'high confidence' },
    medium: { color: '#fb923c',        label: 'medium confidence' },
    low:    { color: '#f87171',        label: 'low confidence' },
  }[confidence] || { color: 'var(--muted)', label: confidence }
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color: cfg.color, background: `${cfg.color}14`, border: `1px solid ${cfg.color}30`,
    }}>
      {cfg.label}
    </span>
  )
}

// ── Severity badge ─────────────────────────────────────────────────────────────
function SeverityBadge({ severity }) {
  const cfg = {
    high:   { color: '#f87171',  label: 'high severity' },
    medium: { color: '#fb923c',  label: 'medium severity' },
    low:    { color: 'var(--muted)', label: 'low severity' },
  }[severity] || { color: 'var(--muted)', label: severity }
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color: cfg.color, background: `${cfg.color}14`, border: `1px solid ${cfg.color}30`,
    }}>
      {cfg.label}
    </span>
  )
}

// ── Time horizon badge ─────────────────────────────────────────────────────────
function HorizonBadge({ horizon }) {
  const cfg = {
    now:   { color: '#f87171',       label: 'now' },
    next:  { color: '#fb923c',       label: 'next' },
    later: { color: 'var(--muted)',  label: 'later' },
  }[horizon] || { color: 'var(--muted)', label: horizon || '—' }
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color: cfg.color, background: `${cfg.color}14`, border: `1px solid ${cfg.color}30`,
    }}>
      {cfg.label}
    </span>
  )
}

// ── Small label row ────────────────────────────────────────────────────────────
function LabelRow({ label, value, color }) {
  if (!value) return null
  const c = color || 'var(--muted)'
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: c, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{value}</div>
    </div>
  )
}

// ── Bullet list ────────────────────────────────────────────────────────────────
function BulletList({ items, color }) {
  if (!items?.length) return null
  const c = color || 'var(--muted)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 5 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
          <span style={{ color: c, fontSize: 9, flexShrink: 0, paddingTop: 2 }}>▸</span>
          <span style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.55 }}>{item}</span>
        </div>
      ))}
    </div>
  )
}

function EvidenceCitationPanel({ citations }) {
  const [open, setOpen] = useState(false)
  if (citations.length === 0) return null
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 8px',
          border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer',
          background: 'transparent', color: 'var(--muted)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <i className={`ti ti-${open ? 'chevron-up' : 'chevron-down'}`} style={{ fontSize: 9 }} />
        {open ? 'Hide' : 'View'} {citations.length} source{citations.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {citations.map((c, i) => (
            <div key={c.id} style={{
              fontSize: 10, padding: '6px 8px',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 5, display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)',
                  background: 'rgba(0,229,180,.1)', padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                }}>
                  [{i + 1}]
                </span>
                {c.url
                  ? <a href={c.url} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--a4)', fontSize: 10, fontWeight: 500, textDecoration: 'none' }}
                    >{c.title || c.url}</a>
                  : <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text)' }}>{c.title}</span>
                }
                {c.domain && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>{c.domain}</span>
                )}
                <RelBadge rel={c.supportsClaim === 'direct' ? 'supports' : c.supportsClaim === false ? 'contradicts' : 'qualifies'} />
              </div>
              {c.snippet && (
                <div style={{ fontSize: 9, color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                  "{c.snippet}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StrategicThemesSection({ items, s2Ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((t, i) => {
        const nodeIds = t.supportingNodeIds || []
        return (
          <div key={i} style={{ padding: 10, borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <EvidenceBearingItem
              itemKey={`theme:${i}`}
              sectionLabel="Strategic themes"
              text={t.whyItMatters || t.title}
              citations={[]}
              sourceNodeIds={nodeIds}
              s2Ctx={s2Ctx}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{t.title}</span>
                <ConfidenceBadge confidence={t.confidence} />
                {nodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={s2Ctx.stage1Nodes} />)}
              </div>
              <LabelRow label="Why it matters" value={t.whyItMatters} color="var(--accent)" />
              <LabelRow label="Downstream implications" value={t.downstreamImplications} color="#fb923c" />
            </EvidenceBearingItem>
          </div>
        )
      })}
    </div>
  )
}

function DecisionFrameworksSection({ items, s2Ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((f, i) => {
        const nodeIds = f.supportingNodeIds || []
        return (
          <div key={i} style={{ padding: 10, borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <EvidenceBearingItem
              itemKey={`df:${i}`}
              sectionLabel="Decision frameworks"
              text={f.tradeoffs || f.question}
              citations={[]}
              sourceNodeIds={nodeIds}
              s2Ctx={s2Ctx}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{f.title}</span>
                <ConfidenceBadge confidence={f.confidence} />
                {nodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={s2Ctx.stage1Nodes} />)}
              </div>
              {f.question && (
                <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 7 }}>{f.question}</div>
              )}
              {f.options?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Options</div>
                  {f.options.map((opt, j) => (
                    <div key={j} style={{ display: 'flex', gap: 5, alignItems: 'flex-start', marginBottom: 2 }}>
                      <span style={{ color: 'var(--a4)', fontSize: 9, flexShrink: 0, paddingTop: 2 }}>▸</span>
                      <span style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.55 }}>{opt}</span>
                    </div>
                  ))}
                </div>
              )}
              <LabelRow label="Tradeoffs" value={f.tradeoffs} color="#fb923c" />
              <LabelRow label="Recommended path" value={f.recommendedPath} color="var(--accent)" />
            </EvidenceBearingItem>
          </div>
        )
      })}
    </div>
  )
}

function ScenarioModelsSection({ items, s2Ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((s, i) => {
        const nodeIds = s.supportingNodeIds || []
        return (
          <div key={i} style={{ padding: 10, borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <EvidenceBearingItem
              itemKey={`scen:${i}`}
              sectionLabel="Scenario models"
              text={s.recommendedResponse || s.title}
              citations={[]}
              sourceNodeIds={nodeIds}
              s2Ctx={s2Ctx}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{s.title}</span>
                <ConfidenceBadge confidence={s.confidence} />
                {nodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={s2Ctx.stage1Nodes} />)}
              </div>
              {s.drivers?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Drivers</div>
                  <BulletList items={s.drivers} color="var(--accent)" />
                </div>
              )}
              {s.risks?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Risks</div>
                  <BulletList items={s.risks} color="#fb923c" />
                </div>
              )}
              {s.leadingIndicators?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Leading indicators</div>
                  <BulletList items={s.leadingIndicators} color="var(--a4)" />
                </div>
              )}
              <LabelRow label="Recommended response" value={s.recommendedResponse} color="var(--muted2)" />
            </EvidenceBearingItem>
          </div>
        )
      })}
    </div>
  )
}

function OrgImplicationsSection({ items, s2Ctx }) {
  const funcColor = f => {
    if (f === 'engineering' || f === 'security') return '#f87171'
    if (f === 'product' || f === 'executive')    return 'var(--accent)'
    if (f === 'legal' || f === 'operations')     return '#fb923c'
    return 'var(--a4)'
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => {
        const nodeIds = item.supportingNodeIds || []
        const fc = funcColor(item.function)
        return (
          <div key={i} style={{ padding: 10, borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <EvidenceBearingItem
              itemKey={`org:${i}`}
              sectionLabel="Organizational implications"
              text={item.implication}
              citations={[]}
              sourceNodeIds={nodeIds}
              s2Ctx={s2Ctx}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3,
                  color: fc, background: `${fc}14`, border: `1px solid ${fc}30`, textTransform: 'uppercase', letterSpacing: '.06em',
                }}>
                  {item.function?.replace(/_/g, ' ')}
                </span>
                <SeverityBadge severity={item.severity} />
                {nodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={s2Ctx.stage1Nodes} />)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.65 }}>{item.implication}</div>
            </EvidenceBearingItem>
          </div>
        )
      })}
    </div>
  )
}

function CapabilityGapsSection({ items, s2Ctx }) {
  const valueColor = v => v === 'high' ? '#f87171' : v === 'medium' ? '#fb923c' : 'var(--muted)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((g, i) => (
        <div key={i} style={{ padding: 10, borderRadius: 6, background: 'rgba(251,146,60,.04)', border: '1px solid rgba(251,146,60,.2)' }}>
          <EvidenceBearingItem
            itemKey={`gap:${i}`}
            sectionLabel="Capability gaps"
            text={g.whyItMatters || g.gap}
            citations={[]}
            sourceNodeIds={[]}
            s2Ctx={s2Ctx}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{g.gap}</span>
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                color: valueColor(g.valueOfResolving), background: `${valueColor(g.valueOfResolving)}14`,
              }}>
                {g.valueOfResolving} value to resolve
              </span>
            </div>
            <LabelRow label="Why it matters" value={g.whyItMatters} color="#fb923c" />
            {g.blockedDecisions?.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Blocked decisions</div>
                <BulletList items={g.blockedDecisions} color="#f87171" />
              </div>
            )}
          </EvidenceBearingItem>
        </div>
      ))}
    </div>
  )
}

function ContradictionAnalysisSection({ items, s2Ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: '#fb923c', marginBottom: 2 }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 10, verticalAlign: -1 }} /> Contradictions are expanded into possible explanations — do not force resolution prematurely.
      </div>
      {items.map((c, i) => {
        const nodeIds = c.supportingNodeIds || []
        return (
          <div key={i} style={{ padding: 10, borderRadius: 6, background: 'rgba(251,146,60,.04)', border: '1px solid rgba(251,146,60,.2)' }}>
            <EvidenceBearingItem
              itemKey={`contra:${i}`}
              sectionLabel="Contradiction analysis"
              text={c.businessImpact || c.description}
              citations={[]}
              sourceNodeIds={nodeIds}
              s2Ctx={s2Ctx}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <ConfidenceBadge confidence={c.likelihood} />
                {nodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={s2Ctx.stage1Nodes} />)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65, marginBottom: 6 }}>{c.description}</div>
              {c.explanations?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Possible explanations</div>
                  <BulletList items={c.explanations} color="var(--muted)" />
                </div>
              )}
              <LabelRow label="Business impact" value={c.businessImpact} color="#fb923c" />
              <LabelRow label="Follow-up" value={c.followUp} color="var(--a4)" />
            </EvidenceBearingItem>
          </div>
        )
      })}
    </div>
  )
}

function RiskModelsSection({ items, s2Ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((r, i) => {
        const nodeIds = r.supportingNodeIds || []
        return (
          <div key={i} style={{ padding: 10, borderRadius: 6, background: 'rgba(248,113,113,.04)', border: '1px solid rgba(248,113,113,.2)' }}>
            <EvidenceBearingItem
              itemKey={`risk:${i}`}
              sectionLabel="Risk models"
              text={r.businessImpact || r.propagation}
              citations={[]}
              sourceNodeIds={nodeIds}
              s2Ctx={s2Ctx}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</span>
                {r.owner && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', padding: '1px 6px', borderRadius: 3, background: 'var(--s2)', border: '1px solid var(--border)' }}>
                    owner: {r.owner}
                  </span>
                )}
                {nodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={s2Ctx.stage1Nodes} />)}
              </div>
              <LabelRow label="Trigger" value={r.trigger} color="#f87171" />
              <LabelRow label="Propagation" value={r.propagation} color="#fb923c" />
              {r.affectedSystems?.length > 0 && (
                <div style={{ marginBottom: 5 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Affected systems</div>
                  <BulletList items={r.affectedSystems} color="var(--muted)" />
                </div>
              )}
              <LabelRow label="Customer impact" value={r.customerImpact} color="var(--muted2)" />
              <LabelRow label="Business impact" value={r.businessImpact} color="var(--muted2)" />
              <LabelRow label="Mitigation" value={r.mitigation} color="var(--accent)" />
            </EvidenceBearingItem>
          </div>
        )
      })}
    </div>
  )
}

function OpportunityModelsSection({ items, s2Ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((o, i) => {
        const nodeIds = o.supportingNodeIds || []
        return (
          <div key={i} style={{ padding: 10, borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <EvidenceBearingItem
              itemKey={`opp:${i}`}
              sectionLabel="Opportunity models"
              text={o.rationale || o.title}
              citations={[]}
              sourceNodeIds={nodeIds}
              s2Ctx={s2Ctx}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{o.title}</span>
                <HorizonBadge horizon={o.timeHorizon} />
                <ConfidenceBadge confidence={o.confidence} />
                {nodeIds.map(id => <NodeRef key={id} nodeId={id} nodes={s2Ctx.stage1Nodes} />)}
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 7, flexWrap: 'wrap' }}>
                {[
                  { label: 'Value',      value: o.businessValue },
                  { label: 'Complexity', value: o.complexity },
                ].map(row => row.value ? (
                  <div key={row.label}>
                    <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 1 }}>{row.label}</div>
                    <SeverityBadge severity={row.value} />
                  </div>
                ) : null)}
              </div>
              {o.dependencies?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Dependencies</div>
                  <BulletList items={o.dependencies} color="var(--muted)" />
                </div>
              )}
              <LabelRow label="Rationale" value={o.rationale} color="var(--muted2)" />
            </EvidenceBearingItem>
          </div>
        )
      })}
    </div>
  )
}

function NextActionsSection({ items, s2Ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((a, i) => (
        <div key={i} style={{ padding: 10, borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--border)' }}>
          <EvidenceBearingItem
            itemKey={`act:${i}`}
            sectionLabel="Next actions"
            text={a.action}
            citations={[]}
            sourceNodeIds={[]}
            s2Ctx={s2Ctx}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
                flexShrink: 0, paddingTop: 3, minWidth: 14, textAlign: 'right',
              }}>
                {i + 1}.
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65, marginBottom: 6 }}>{a.action}</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Info gain',   value: a.expectedInfoGain },
                    { label: 'Cost',        value: a.cost },
                  ].map(row => row.value ? (
                    <div key={row.label} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>{row.label}:</span>
                      <SeverityBadge severity={row.value} />
                    </div>
                  ) : null)}
                </div>
                {a.confidenceImprovement && (
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 5 }}>
                    <i className="ti ti-trending-up" style={{ fontSize: 9, verticalAlign: -1, marginRight: 3 }} />
                    Resolves: {a.confidenceImprovement}
                  </div>
                )}
                {a.decisionImpact && (
                  <div style={{ fontSize: 9, color: 'var(--a4)', marginTop: 3 }}>
                    <i className="ti ti-arrow-right" style={{ fontSize: 9, verticalAlign: -1, marginRight: 3 }} />
                    Unblocks: {a.decisionImpact}
                  </div>
                )}
              </div>
            </div>
          </EvidenceBearingItem>
        </div>
      ))}
    </div>
  )
}

function ReadinessAssessmentSection({ data, s2Ctx }) {
  if (!data) return null
  const maturityColor = m => m === 'high' ? 'var(--accent)' : m === 'medium' ? '#fb923c' : '#f87171'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        {data.knowledgeMaturity && (
          <div>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 3 }}>Knowledge maturity</div>
            <span style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3,
              color: maturityColor(data.knowledgeMaturity), background: `${maturityColor(data.knowledgeMaturity)}14`,
              border: `1px solid ${maturityColor(data.knowledgeMaturity)}30`,
            }}>
              {data.knowledgeMaturity}
            </span>
          </div>
        )}
        {data.confidence && (
          <div>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 3 }}>Overall confidence</div>
            <ConfidenceBadge confidence={data.confidence} />
          </div>
        )}
      </div>
      <LabelRow label="Remaining uncertainty" value={data.remainingUncertainty} color="#fb923c" />
      {data.majorBlockers?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Major blockers</div>
          <BulletList items={data.majorBlockers} color="#f87171" />
        </div>
      )}
      {data.recommendation && (
        <div style={{
          marginTop: 4, padding: '8px 12px', borderRadius: 6,
          background: 'rgba(0,229,180,.05)', border: '1px solid rgba(0,229,180,.2)',
        }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', marginBottom: 3 }}>Recommendation</div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65 }}>
            <EvidenceBearingItem
              itemKey="readiness:recommendation"
              sectionLabel="Readiness assessment"
              text={data.recommendation}
              citations={[]}
              sourceNodeIds={[]}
              s2Ctx={s2Ctx}
            />
          </div>
        </div>
      )}
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
function PivotLauncher({ session, stage2, onRunPivot, onAcceptPivotUpdate, onRefinePivotUpdate, onRejectPivotUpdate, s2Ctx }) {
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
                s2Ctx={s2Ctx}
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
  card, stage1Nodes, pivotResult, s2Ctx,
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
          s2Ctx={s2Ctx}
          onAcceptUpdate={onAcceptUpdate}
          onRefineUpdate={onRefineUpdate}
          onRejectUpdate={onRejectUpdate}
        />
      )}
    </div>
  )
}

// ── PivotResultPanel ───────────────────────────────────────────────────────────
function PivotResultPanel({ pivot, s2Ctx, onAcceptUpdate, onRefineUpdate, onRejectUpdate }) {
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
        <EvidenceBearingItem
          itemKey={`pivot:${pivot.type}`}
          sectionLabel="Generated pivot outputs"
          text={pivot.displaySummary}
          citations={[]}
          sourceNodeIds={pivot.targetNodeIds || []}
          s2Ctx={s2Ctx || {}}
        />
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
