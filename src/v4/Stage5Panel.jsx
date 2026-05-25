import React, { useState } from 'react'

// ── Type → display config ──────────────────────────────────────────────────────
const SIGNAL_TYPES = {
  framing_signal:    { label: 'Framing',   color: 'var(--a4)'    },
  evidence_signal:   { label: 'Evidence',  color: 'var(--accent)' },
  synthesis_signal:  { label: 'Synthesis', color: '#fb923c'       },
  artifact_signal:   { label: 'Artifact',  color: 'var(--accent)' },
  refinement_signal: { label: 'Refinement',color: 'var(--a3)'    },
  readiness_signal:  { label: 'Readiness', color: '#fb923c'       },
  risk_signal:       { label: 'Risk',      color: '#f87171'       },
  audience_signal:   { label: 'Audience',  color: 'var(--a4)'    },
  scope_signal:      { label: 'Scope',     color: 'var(--muted)'  },
  quality_signal:    { label: 'Quality',   color: 'var(--a3)'    },
  negative_signal:   { label: 'Negative',  color: '#f87171'       },
  // Stage 4 signal types that may appear in cross-stage summary
  audience_framing_signal:       { label: 'Audience Framing',   color: 'var(--a4)'    },
  readiness_warning_signal:      { label: 'Readiness Warning',  color: '#f87171'       },
  validation_checkpoint_signal:  { label: 'Validation',         color: 'var(--accent)' },
  artifact_structure_signal:     { label: 'Artifact Structure', color: 'var(--accent)' },
  refinement_signal_s4:          { label: 'Refinement',         color: '#fb923c'       },
  decision_tag_signal:           { label: 'Decision Tag',       color: 'var(--a4)'    },
  artifact_quality_signal:       { label: 'Artifact Quality',   color: 'var(--a3)'    },
  negative_learning_signal:      { label: 'Negative Learning',  color: '#f87171'       },
  version_evolution_signal:      { label: 'Version Evolution',  color: 'var(--a3)'    },
  strategy_execution_signal:     { label: 'Execution',          color: '#fb923c'       },
}
const PATTERN_TYPES = {
  framing_pattern:             { label: 'Framing',              color: 'var(--a4)'    },
  evidence_quality_pattern:    { label: 'Evidence Quality',     color: 'var(--accent)' },
  synthesis_pattern:           { label: 'Synthesis',            color: '#fb923c'       },
  artifact_structure_pattern:  { label: 'Artifact Structure',   color: 'var(--accent)' },
  refinement_pattern:          { label: 'Refinement',           color: 'var(--a3)'    },
  readiness_pattern:           { label: 'Readiness',            color: '#fb923c'       },
  risk_pattern:                { label: 'Risk',                 color: '#f87171'       },
  audience_translation_pattern:{ label: 'Audience Translation', color: 'var(--a4)'    },
  scope_transfer_pattern:      { label: 'Scope Transfer',       color: 'var(--muted)'  },
  negative_learning_pattern:   { label: 'Negative Learning',    color: '#f87171'       },
}
const MATURITY = {
  seed:        { label: 'Seed',        color: 'var(--a4)'    },
  validated:   { label: 'Validated',   color: 'var(--accent)' },
  contradicted:{ label: 'Contradicted',color: '#f87171'       },
  retired:     { label: 'Retired',     color: 'var(--muted)'  },
}
const SEVERITY = {
  high:   { label: 'High',   color: '#f87171', bg: 'rgba(248,113,113,.07)',  border: 'rgba(248,113,113,.25)' },
  medium: { label: 'Medium', color: '#fb923c', bg: 'rgba(251,146,60,.06)',   border: 'rgba(251,146,60,.22)'  },
  low:    { label: 'Low',    color: 'var(--muted)', bg: 'var(--s2)',         border: 'var(--border)'         },
}
const STAGE_COLOR = {
  stage1: 'var(--a2)',
  stage2: 'var(--a4)',
  stage3: '#fb923c',
  stage4: 'var(--accent)',
}
const STAGE_LABEL = {
  stage1: 'Stage 1 — Orientation',
  stage2: 'Stage 2 — Evidence',
  stage3: 'Stage 3 — Synthesis',
  stage4: 'Stage 4 — Artifacts',
}
const CONF_DOT = { high: 'var(--accent)', medium: '#fb923c', low: 'var(--muted)' }

function sigTypeCfg(type) {
  return SIGNAL_TYPES[type] || { label: type, color: 'var(--muted2)' }
}
function patTypeCfg(type) {
  return PATTERN_TYPES[type] || { label: type, color: 'var(--muted2)' }
}
function matCfg(m) {
  return MATURITY[m] || { label: m, color: 'var(--muted)' }
}
function sevCfg(s) {
  return SEVERITY[s] || SEVERITY.low
}

// ── Small shared pieces ────────────────────────────────────────────────────────
function TypeBadge({ label, color }) {
  return (
    <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3, color, background: `${color}14`, border: `1px solid ${color}30`, flexShrink: 0 }}>
      {label}
    </span>
  )
}
function ConfDot({ confidence }) {
  const col = CONF_DOT[confidence] || 'var(--muted)'
  return (
    <span title={`Confidence: ${confidence}`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0, marginTop: 3 }} />
  )
}
function TransBadge({ value }) {
  return (
    <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3, color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)' }}>
      {value || 'general'}
    </span>
  )
}

// ── Tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            padding: '8px 14px', fontSize: 10, fontFamily: 'var(--fm)', cursor: 'pointer',
            border: 'none', background: 'none',
            borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            color: active === t.id ? 'var(--text)' : 'var(--muted)',
            fontWeight: active === t.id ? 600 : 400,
          }}
        >
          {t.label}{t.count != null ? ` (${t.count})` : ''}
        </button>
      ))}
    </div>
  )
}

// ── Signal card ────────────────────────────────────────────────────────────────
function SignalCard({ signal, showStage = false }) {
  const [open, setOpen] = useState(false)
  const typeCfg = sigTypeCfg(signal.signalType)
  const stageColor = signal.sourceStage ? STAGE_COLOR[signal.sourceStage] : 'var(--muted)'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 8 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '10px 14px', cursor: 'pointer', background: open ? 'rgba(0,229,180,.02)' : 'transparent' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
          <ConfDot confidence={signal.confidence} />
          <div style={{ flex: 1, fontSize: 11, fontWeight: 600, lineHeight: 1.4 }}>{signal.title}</div>
          <TypeBadge label={typeCfg.label} color={typeCfg.color} />
          {showStage && signal.sourceStage && (
            <TypeBadge label={STAGE_LABEL[signal.sourceStage] || signal.sourceStage} color={stageColor} />
          )}
          <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{signal.description}</div>
        <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <TransBadge value={signal.transferability} />
          {(signal.applicableScopes || []).map(s => (
            <span key={s} style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)' }}>{s}</span>
          ))}
        </div>
      </div>

      {open && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--s2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signal.applyForwardGuidance && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Apply-forward guidance</div>
              <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.6 }}>{signal.applyForwardGuidance}</div>
            </div>
          )}
          {signal.evidenceBasis && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Evidence basis</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{signal.evidenceBasis}</div>
            </div>
          )}
          {signal.provenance && signal.provenance !== signal.evidenceBasis && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Provenance</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{signal.provenance}</div>
            </div>
          )}
          {(signal.counterSignals || []).length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: '#fb923c', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Counter-signals</div>
              {signal.counterSignals.map((cs, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, paddingLeft: 10, borderLeft: '2px solid rgba(251,146,60,.35)', marginBottom: 3 }}>{cs}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Pattern card ───────────────────────────────────────────────────────────────
function PatternCard({ pattern, onUpdatePattern }) {
  const [open,      setOpen]      = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const typeCfg = patTypeCfg(pattern.patternType)
  const m       = pattern.patternMaturity || 'seed'
  const matC    = matCfg(m)

  function setMaturity(next) {
    onUpdatePattern?.({ patternId: pattern.patternId, updates: { patternMaturity: next, updatedAt: Date.now() } })
  }

  // Build context-sensitive maturity action buttons
  const maturityActions = []
  if (m === 'seed') {
    maturityActions.push({ label: '→ Validated', action: () => setMaturity('validated'), color: 'var(--accent)' })
    maturityActions.push({ label: 'Contradict',  action: () => setMaturity('contradicted'), color: '#f87171' })
    maturityActions.push({ label: 'Retire',       action: () => setMaturity('retired'), color: 'var(--muted)' })
  } else if (m === 'validated') {
    maturityActions.push({ label: 'Contradict', action: () => setMaturity('contradicted'), color: '#f87171' })
    maturityActions.push({ label: 'Retire',      action: () => setMaturity('retired'), color: 'var(--muted)' })
  } else if (m === 'contradicted') {
    maturityActions.push({ label: 'Retire',         action: () => setMaturity('retired'), color: 'var(--muted)' })
    maturityActions.push({ label: '↺ Reset → Seed', action: () => setMaturity('seed'),    color: 'var(--a4)' })
  } else if (m === 'retired') {
    maturityActions.push({ label: '↺ Reset → Seed', action: () => setMaturity('seed'), color: 'var(--a4)' })
  }

  const userNotes = pattern.userNotes || ''

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 10 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '12px 16px', cursor: 'pointer', background: open ? 'rgba(0,229,180,.02)' : 'transparent' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{pattern.patternTitle}</div>
          <TypeBadge label={typeCfg.label} color={typeCfg.color} />
          <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3, color: matC.color, background: `${matC.color}14`, border: `1px solid ${matC.color}30` }}>
            {matC.label}
          </span>
          {userNotes && <i className="ti ti-notes" title="Has notes" style={{ fontSize: 10, color: 'var(--a4)', flexShrink: 0 }} />}
          <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{pattern.reusableGuidance}</div>
        <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <TransBadge value={pattern.transferability} />
          {(pattern.applicableScopes || []).map(s => (
            <span key={s} style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)' }}>{s}</span>
          ))}
          {(pattern.sourceStages || []).map(s => (
            <TypeBadge key={s} label={STAGE_LABEL[s] || s} color={STAGE_COLOR[s] || 'var(--muted)'} />
          ))}
        </div>
      </div>

      {open && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--s2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pattern.whenToApply && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>When to apply</div>
              <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.6 }}>{pattern.whenToApply}</div>
            </div>
          )}
          {pattern.whenNotToApply && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: '#fb923c', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>When NOT to apply</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{pattern.whenNotToApply}</div>
            </div>
          )}
          {pattern.applyForwardGuidance && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Apply-forward guidance</div>
              <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.6, fontWeight: 500 }}>{pattern.applyForwardGuidance}</div>
            </div>
          )}
          {pattern.evidenceBasis && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Evidence basis</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{pattern.evidenceBasis}</div>
            </div>
          )}
          {pattern.patternVsClaimBoundary && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Pattern vs. domain claim</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, fontStyle: 'italic' }}>{pattern.patternVsClaimBoundary}</div>
            </div>
          )}
          {(pattern.counterSignals || []).length > 0 && (
            <div>
              <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: '#fb923c', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Counter-signals</div>
              {pattern.counterSignals.map((cs, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, paddingLeft: 10, borderLeft: '2px solid rgba(251,146,60,.35)', marginBottom: 3 }}>{cs}</div>
              ))}
            </div>
          )}

          {/* Maturity lifecycle row */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', marginRight: 2 }}>Maturity:</span>
            {onUpdatePattern && maturityActions.map((btn, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); btn.action() }}
                style={{
                  fontSize: 8, fontFamily: 'var(--fm)', padding: '2px 8px',
                  border: `1px solid ${btn.color}40`, borderRadius: 3,
                  background: `${btn.color}10`, color: btn.color,
                  cursor: 'pointer',
                }}
              >
                {btn.label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
              Confidence: {pattern.confidenceLevel || 'medium'}
            </span>
          </div>

          {/* Notes section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <button
              onClick={e => { e.stopPropagation(); setNotesOpen(o => !o) }}
              style={{
                fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0,
              }}
            >
              <i className={`ti ti-chevron-${notesOpen ? 'up' : 'down'}`} style={{ fontSize: 9 }} />
              {userNotes ? `Notes (${userNotes.length}/300)` : 'Add notes'}
            </button>
            {notesOpen && (
              <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
                <textarea
                  value={userNotes}
                  onChange={e => onUpdatePattern?.({ patternId: pattern.patternId, updates: { userNotes: e.target.value.slice(0, 300) } })}
                  placeholder="Add your observations about this pattern…"
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    minHeight: 72, padding: '7px 9px',
                    fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--text)',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 4, lineHeight: 1.55, outline: 'none',
                  }}
                />
                <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', textAlign: 'right', marginTop: 2 }}>
                  {userNotes.length}/300
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Trigger card ───────────────────────────────────────────────────────────────
function TriggerCard({ trigger }) {
  const sev = sevCfg(trigger.severity)
  return (
    <div style={{ padding: '12px 14px', border: `1px solid ${sev.border}`, borderRadius: 'var(--r)', background: sev.bg, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 8, fontFamily: 'var(--fm)', fontWeight: 700, padding: '1px 6px', borderRadius: 3, color: sev.color, background: `${sev.color}18`, border: `1px solid ${sev.color}35`, flexShrink: 0 }}>
          {sev.label}
        </span>
        <div style={{ flex: 1, fontSize: 11, fontWeight: 600, lineHeight: 1.4 }}>{trigger.title}</div>
        <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', padding: '1px 6px', borderRadius: 3, background: 'var(--s2)', border: '1px solid var(--border)' }}>
          {STAGE_LABEL[trigger.appliesToStage] || trigger.appliesToStage}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 8 }}>{trigger.description}</div>
      {trigger.recommendedAction && (
        <div style={{ padding: '8px 10px', background: 'rgba(0,229,180,.05)', border: '1px solid rgba(0,229,180,.2)', borderRadius: 5 }}>
          <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>Recommended action</div>
          <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.6 }}>{trigger.recommendedAction}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
        <TransBadge value={trigger.transferability} />
        <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', padding: '1px 5px', borderRadius: 3, background: 'var(--s2)', border: '1px solid var(--border)' }}>
          confidence: {trigger.confidence}
        </span>
      </div>
    </div>
  )
}

// ── Stage 4 signal card (compact, for Stage 5's "Stage 4 Signals" tab) ─────────
function S4SignalCard({ signal }) {
  return <SignalCard signal={signal} showStage={false} />
}

// ── Empty state ────────────────────────────────────────────────────────────────
function EmptyState({ onGenerate, isGenerating, hasArtifacts }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <i className="ti ti-brain" style={{ fontSize: 32, display: 'block', marginBottom: 12, color: 'var(--border2)' }} />
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Stage 5 Learning Signals</div>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', maxWidth: 400, margin: '0 auto 24px' }}>
        Stage 5 synthesises learning signals from all prior stages into reusable analysis patterns, refinement heuristics, and transferable reasoning structures.
        {!hasArtifacts && (
          <span style={{ display: 'block', marginTop: 8, color: '#fb923c' }}>
            Tip: generate at least one Stage 4 artifact first for richer Stage 5 output.
          </span>
        )}
      </div>
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        style={{
          fontSize: 11, fontFamily: 'var(--fm)', fontWeight: 600, padding: '8px 20px',
          borderRadius: 6, cursor: isGenerating ? 'not-allowed' : 'pointer',
          background: 'var(--accent)', color: '#000', border: 'none',
          opacity: isGenerating ? .5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <i className={`ti ${isGenerating ? 'ti-loader-2' : 'ti-brain'}`} style={{ fontSize: 12 }} />
        {isGenerating ? 'Generating Stage 5…' : 'Generate Stage 5 Learning Signals'}
      </button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
// ── Freshness banner ──────────────────────────────────────────────────────────
// Amber: Stage 5 is stale — one or more upstream stages have changed.
// Green: Stage 5 was just updated (most recent updateHistory entry, shown briefly).
function FreshnessBanner({ freshness, onUpdate, isGenerating, updateHistory }) {
  const isStale   = freshness?.isStale
  const lastEntry = (updateHistory || []).length > 0 ? updateHistory[updateHistory.length - 1] : null
  const justUpdated = !isStale && lastEntry && (Date.now() - (lastEntry.updatedAt || 0)) < 30000

  if (!isStale && !justUpdated) return null

  if (justUpdated && !isStale) {
    return (
      <div style={{
        margin: '0 0 12px 0', padding: '10px 14px',
        background: 'rgba(0,229,180,.06)', border: '1px solid rgba(0,229,180,.25)',
        borderRadius: 'var(--r)', display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <i className="ti ti-circle-check" style={{ fontSize: 13, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', marginBottom: 2 }}>Stage 5 updated from latest signals</div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)', lineHeight: 1.5 }}>
            {lastEntry.changeSummary || 'Reconciled from upstream stage changes.'}
          </div>
        </div>
      </div>
    )
  }

  const stageLabels = { stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3', stage4: 'Stage 4' }
  const staleList   = (freshness?.staleStages || []).map(s => stageLabels[s] || s).join(', ')

  return (
    <div style={{
      margin: '0 0 12px 0', padding: '10px 14px',
      background: 'rgba(251,146,60,.06)', border: '1px solid rgba(251,146,60,.3)',
      borderRadius: 'var(--r)', display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#fb923c', flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#fb923c', marginBottom: 3 }}>
          Stage 5 may be out of date
        </div>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)', lineHeight: 1.55, marginBottom: 8 }}>
          {staleList && `${staleList} ${(freshness?.staleStages || []).length === 1 ? 'has' : 'have'} changed since Stage 5 was generated. `}
          Stage 5 learning signals and patterns may not reflect the current analysis.
        </div>
        <button
          onClick={onUpdate}
          disabled={isGenerating}
          style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 12px',
            background: 'rgba(251,146,60,.12)', border: '1px solid rgba(251,146,60,.4)',
            borderRadius: 4, cursor: isGenerating ? 'not-allowed' : 'pointer',
            color: '#fb923c', display: 'inline-flex', alignItems: 'center', gap: 5,
            opacity: isGenerating ? .6 : 1,
          }}
        >
          <i className={`ti ${isGenerating ? 'ti-loader-2' : 'ti-refresh'}`} style={{ fontSize: 9 }} />
          {isGenerating ? 'Updating…' : 'Update Stage 5 from latest learning signals'}
        </button>
      </div>
    </div>
  )
}

// Transferability values that appear in filter bar
const TRANS_FILTER_OPTIONS = ['all', 'session-only', 'same-domain', 'same-industry', 'cross-domain', 'general']

export default function Stage5Panel({
  session,
  stage5,
  stage4Signals,
  onBackToStage4,
  onGenerate,
  isGenerating,
  freshness,
  onUpdate,
  onUpdatePattern,
}) {
  const [tab,            setTab]            = useState('signals')
  const [maturityFilter, setMaturityFilter] = useState('all')
  const [transFilter,    setTransFilter]    = useState('all')

  const signals  = stage5?.learningSignals     || []
  const patterns = stage5?.reusablePatterns    || []
  const triggers = stage5?.refinementTriggers  || []
  const s4sigs   = stage4Signals               || []

  // Group cross-stage signals by sourceStage
  const byStage = ['stage1', 'stage2', 'stage3', 'stage4'].reduce((acc, s) => {
    const group = signals.filter(sig => sig.sourceStage === s)
    if (group.length > 0) acc[s] = group
    return acc
  }, {})

  const hasArtifacts = (session.stage4?.artifacts || []).some(a => a.status === 'complete')
  const generatedAt  = stage5?.generatedAt

  const tabs = [
    { id: 'signals',  label: 'Cross-Stage Signals', count: signals.length  },
    { id: 's4',       label: 'Stage 4 Signals',      count: s4sigs.length  },
    { id: 'patterns', label: 'Reusable Patterns',    count: patterns.length },
    { id: 'triggers', label: 'Refinement Triggers',  count: triggers.length },
  ]

  return (
    <div style={{ maxWidth: 860, padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{session.entity?.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>Stage 5 — Learning signals &amp; reusable patterns</div>
          {generatedAt && (
            <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', marginTop: 3 }}>
              Generated {new Date(generatedAt).toLocaleString()} · {signals.length} signals · {patterns.length} patterns · {triggers.length} triggers
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {stage5 && (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
                background: 'var(--s2)', border: '1px solid var(--border)',
                borderRadius: 5, cursor: isGenerating ? 'not-allowed' : 'pointer',
                color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4,
                opacity: isGenerating ? .5 : 1,
              }}
            >
              <i className={`ti ${isGenerating ? 'ti-loader-2' : 'ti-refresh'}`} style={{ fontSize: 10 }} />
              {isGenerating ? 'Regenerating…' : 'Refresh'}
            </button>
          )}
          <button
            onClick={onBackToStage4}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 10 }} /> Stage 4
          </button>
        </div>
      </div>

      {/* Freshness banner — shown when Stage 5 is stale or just updated */}
      {stage5 && (
        <FreshnessBanner
          freshness={freshness}
          onUpdate={onUpdate}
          isGenerating={isGenerating}
          updateHistory={stage5?.updateHistory}
        />
      )}

      {/* Content */}
      {!stage5 ? (
        <EmptyState onGenerate={onGenerate} isGenerating={isGenerating} hasArtifacts={hasArtifacts} />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px' }}>
          <TabBar tabs={tabs} active={tab} onSelect={setTab} />

          {/* Cross-stage signals */}
          {tab === 'signals' && (
            <div>
              {signals.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--fm)' }}>No cross-stage signals generated.</div>
              ) : (
                Object.entries(byStage).map(([stageKey, stageSignals]) => (
                  <div key={stageKey} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 700, color: STAGE_COLOR[stageKey] || 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STAGE_COLOR[stageKey] || 'var(--muted)' }} />
                      {STAGE_LABEL[stageKey] || stageKey}
                      <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>({stageSignals.length})</span>
                    </div>
                    {stageSignals.map(sig => <SignalCard key={sig.signalId} signal={sig} showStage={false} />)}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Stage 4 signals */}
          {tab === 's4' && (
            <div>
              {session.stage4?.signalsMeta?.status === 'error' ? (
                <div style={{ padding: '16px', border: '1px solid rgba(248,113,113,.3)', borderRadius: 'var(--r)', background: 'rgba(248,113,113,.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#f87171' }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#fca5a5' }}>Stage 4 learning signals unavailable</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>
                    {session.stage4?.signalsMeta?.errorMessage || 'Stage 4 learning signal generation failed. Return to Stage 4 and retry signal generation.'}
                  </div>
                </div>
              ) : s4sigs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 10 }}>
                    No Stage 4 learning signals have been generated yet.
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted2)' }}>
                    Return to Stage 4 and use the Learning Signals drawer to generate them.
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 12 }}>
                    These signals were generated by Stage 4's artifact analysis and are used as the primary Stage 4 source for cross-stage patterns.
                  </div>
                  {s4sigs.map(sig => <S4SignalCard key={sig.signalId} signal={sig} />)}
                </div>
              )}
            </div>
          )}

          {/* Reusable patterns */}
          {tab === 'patterns' && (
            <div>
              {patterns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--fm)' }}>No reusable patterns generated.</div>
              ) : (
                <div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 10 }}>
                    Reusable patterns capture analytical frameworks, framing moves, and quality heuristics — not domain facts about {session.entity?.name}.
                  </div>

                  {/* Filter bar */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', padding: '8px 10px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 5 }}>
                    <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0 }}>Maturity:</span>
                    {['all', 'seed', 'validated', 'contradicted', 'retired'].map(m => (
                      <button
                        key={m}
                        onClick={() => setMaturityFilter(m)}
                        style={{
                          fontSize: 8, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                          border: `1px solid ${maturityFilter === m ? 'var(--accent)' : 'var(--border)'}`,
                          background: maturityFilter === m ? 'rgba(0,229,180,.1)' : 'transparent',
                          color: maturityFilter === m ? 'var(--accent)' : 'var(--muted)',
                          fontWeight: maturityFilter === m ? 600 : 400,
                        }}
                      >
                        {m === 'all' ? 'All' : MATURITY[m]?.label || m}
                      </button>
                    ))}
                    <span style={{ marginLeft: 8, fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0 }}>Transferability:</span>
                    {TRANS_FILTER_OPTIONS.map(t => (
                      <button
                        key={t}
                        onClick={() => setTransFilter(t)}
                        style={{
                          fontSize: 8, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3, cursor: 'pointer',
                          border: `1px solid ${transFilter === t ? 'var(--accent)' : 'var(--border)'}`,
                          background: transFilter === t ? 'rgba(0,229,180,.1)' : 'transparent',
                          color: transFilter === t ? 'var(--accent)' : 'var(--muted)',
                          fontWeight: transFilter === t ? 600 : 400,
                        }}
                      >
                        {t === 'all' ? 'All' : t}
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const filtered = patterns
                      .filter(p => maturityFilter === 'all' || (p.patternMaturity || 'seed') === maturityFilter)
                      .filter(p => transFilter === 'all' || (p.transferability || 'general') === transFilter)
                    return filtered.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--fm)' }}>
                        No patterns match the current filters.
                      </div>
                    ) : (
                      filtered.map(pat => (
                        <PatternCard key={pat.patternId} pattern={pat} onUpdatePattern={onUpdatePattern} />
                      ))
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Refinement triggers */}
          {tab === 'triggers' && (
            <div>
              {triggers.length === 0 ? (
                (stage5?.generationPartial || (stage5?.generationMeta?.truncationDetected && stage5?.generationMeta?.missingArrays?.includes('refinementTriggers'))) ? (
                  <div style={{
                    padding: '14px 16px', border: '1px solid rgba(251,146,60,.3)',
                    borderRadius: 'var(--r)', background: 'rgba(251,146,60,.05)',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#fb923c', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#fb923c', marginBottom: 4 }}>
                        {(stage5?.generationMeta?.truncationDetected && stage5?.generationMeta?.missingArrays?.includes('refinementTriggers'))
                          ? 'Refinement triggers were not generated — response truncated'
                          : 'Generation completed partially — refinement triggers may be incomplete'}
                      </div>
                      <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 10, lineHeight: 1.55 }}>
                        {(stage5?.generationMeta?.truncationDetected && stage5?.generationMeta?.missingArrays?.includes('refinementTriggers'))
                          ? 'The response was cut off before refinement triggers could be output. Refresh Stage 5 to retry.'
                          : 'The model response was truncated before refinement triggers were generated. Refresh Stage 5 to retry with tighter output limits.'}
                      </div>
                      <button
                        onClick={onGenerate}
                        disabled={isGenerating}
                        style={{
                          fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 12px',
                          background: 'rgba(251,146,60,.12)', border: '1px solid rgba(251,146,60,.4)',
                          borderRadius: 4, cursor: isGenerating ? 'not-allowed' : 'pointer',
                          color: '#fb923c', display: 'inline-flex', alignItems: 'center', gap: 5,
                          opacity: isGenerating ? .6 : 1,
                        }}
                      >
                        <i className={`ti ${isGenerating ? 'ti-loader-2' : 'ti-refresh'}`} style={{ fontSize: 9 }} />
                        {isGenerating ? 'Regenerating…' : 'Refresh Stage 5'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--fm)' }}>
                    No refinement triggers generated.
                  </div>
                )
              ) : (
                <div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 12 }}>
                    Refinement triggers are testable conditions that signal an artifact or synthesis is not yet decision-ready.
                  </div>
                  {triggers.map(trig => <TriggerCard key={trig.triggerId} trigger={trig} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
