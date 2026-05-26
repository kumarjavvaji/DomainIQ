import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  buildStrategyBasisPackage,
  buildExportFilename,
  downloadStrategyBasisPackage,
} from '../utils/strategyBasisExport'

// ── Posture colour lookup ──────────────────────────────────────────────────────
const POSTURE_COLOR = {
  'double down':          'var(--accent)',
  'selective investment': 'var(--a4)',
  'maintain':             '#fb923c',
  'deprioritize':         'var(--muted)',
  'divest/reallocate':    '#f87171',
}

// ── Per-version provenance colours (muted, dark-UI safe) ──────────────────────
const VERSION_COLORS = {
  2: { bg: 'rgba(239,68,68,.13)',  span: 'rgba(239,68,68,.22)',  badge: '#fca5a5', badgeBg: 'rgba(239,68,68,.12)',  label: 'muted red'    },
  3: { bg: 'rgba(96,165,250,.13)', span: 'rgba(96,165,250,.22)', badge: '#93c5fd', badgeBg: 'rgba(96,165,250,.12)', label: 'muted blue'   },
  4: { bg: 'rgba(52,211,153,.13)', span: 'rgba(52,211,153,.22)', badge: '#6ee7b7', badgeBg: 'rgba(52,211,153,.12)', label: 'muted green'  },
  5: { bg: 'rgba(192,132,252,.13)',span: 'rgba(192,132,252,.22)',badge: '#e9d5ff', badgeBg: 'rgba(192,132,252,.12)',label: 'muted purple' },
}
function getVersionColor(vN) {
  const key = ((vN - 2) % 4) + 2
  return VERSION_COLORS[key]
}

// ── Version helpers ────────────────────────────────────────────────────────────
function getVersions(artifact) {
  if (artifact.versions?.length > 0) return artifact.versions
  if (artifact.data && artifact.status === 'complete') {
    return [{
      id:                artifact.id + '_v1',
      versionNumber:     1,
      createdAt:         artifact.generatedAt || Date.now(),
      refinementContext: null,
      changeSummary:     null,
      data:              artifact.data,
    }]
  }
  return []
}

function getActiveVersion(artifact) {
  const versions = getVersions(artifact)
  if (!versions.length) return null
  if (artifact.activeVersionId) {
    return versions.find(v => v.id === artifact.activeVersionId) || versions[versions.length - 1]
  }
  return versions[versions.length - 1]
}

function getVersionById(artifact, id) {
  return getVersions(artifact).find(v => v.id === id) || null
}

// ── Word-level provenance engine ───────────────────────────────────────────────

function tokenizeWords(text) {
  if (!text) return []
  return text.split(/\s+/).filter(t => t.length > 0)
}

function getSectionText(version, heading) {
  const sec = (version?.data?.sections || []).find(s => s.heading === heading)
  return sec?.body || ''
}

function lcsWordDiff(oldToks, newToks) {
  const m = oldToks.length
  const n = newToks.length
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldToks[i - 1] === newToks[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const ops = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldToks[i - 1] === newToks[j - 1]) {
      ops.unshift({ type: 'keep', token: newToks[j - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', token: newToks[j - 1] })
      j--
    } else {
      ops.unshift({ type: 'remove', token: oldToks[i - 1] })
      i--
    }
  }
  return ops
}

function groupProvenanceTokens(tokens) {
  if (!tokens.length) return []
  const spans = []
  let cur = { text: tokens[0].text, originVersion: tokens[0].originVersion }
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].originVersion === cur.originVersion) {
      cur = { ...cur, text: cur.text + ' ' + tokens[i].text }
    } else {
      spans.push(cur)
      cur = { text: tokens[i].text, originVersion: tokens[i].originVersion }
    }
  }
  spans.push(cur)
  return spans
}

const MAX_DIFF_TOKENS = 300

function computeSectionProvenance(versions, displayVersionNumber, heading) {
  const relevant = versions
    .filter(v => v.versionNumber <= displayVersionNumber)
    .sort((a, b) => a.versionNumber - b.versionNumber)

  if (relevant.length === 0) return []

  let provToks = tokenizeWords(getSectionText(relevant[0], heading))
    .map(text => ({ text, originVersion: 1 }))

  for (let vi = 1; vi < relevant.length; vi++) {
    const ver  = relevant[vi]
    const vN   = ver.versionNumber
    const prev = provToks.map(t => t.text)
    const curr = tokenizeWords(getSectionText(ver, heading))

    if (curr.length === 0) { provToks = []; continue }

    if (prev.length > MAX_DIFF_TOKENS || curr.length > MAX_DIFF_TOKENS) {
      provToks = curr.map(text => ({ text, originVersion: vN }))
      continue
    }

    const ops    = lcsWordDiff(prev, curr)
    const next   = []
    let prevIdx  = 0

    for (const op of ops) {
      if (op.type === 'keep') {
        next.push({ ...provToks[prevIdx], text: op.token })
        prevIdx++
      } else if (op.type === 'add') {
        next.push({ text: op.token, originVersion: vN })
      } else {
        prevIdx++
      }
    }
    provToks = next
  }

  return groupProvenanceTokens(provToks)
}

// ── Artifact grouping helper ───────────────────────────────────────────────────
// Groups artifacts by sourceStrategyId (Map preserves insertion order).
// Artifacts without a sourceStrategyId fall into an __ungrouped bucket
// that is only rendered as a labelled group when real strategy groups exist.
function groupArtifacts(artifacts) {
  const groupMap = new Map()
  const ungrouped = []

  for (const a of artifacts) {
    const key = a.sourceStrategyId || null
    if (key) {
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          id:       key,
          name:     a.sourceStrategyName || 'Unknown strategy',
          posture:  a.strategyPosture    || null,
          artifacts: [],
        })
      }
      groupMap.get(key).artifacts.push(a)
    } else {
      ungrouped.push(a)
    }
  }

  const groups = [...groupMap.values()]
  if (ungrouped.length > 0) {
    groups.push({ id: '__ungrouped', name: 'Ungrouped artifacts', posture: null, artifacts: ungrouped })
  }
  return groups
}

// ── Main Stage 4 Panel ─────────────────────────────────────────────────────────
export default function Stage4Panel({
  session,
  stage4,
  onBackToStage3,
  onGenerateArtifact,
  onRefineArtifact,
  onDeleteArtifact,
  onSetActiveArtifact,
  onGenerateSignals,
  onViewStage5,
  isGeneratingSignals,
  hasStage5,
  stage5Freshness,
}) {
  const artifacts = stage4?.artifacts || []

  // Initialise from persisted activeArtifactId when available (e.g. after a
  // new artifact is generated and the user navigates here fresh).
  const [activeId, setActiveId] = useState(
    stage4?.activeArtifactId || artifacts[0]?.id || null
  )

  // Sync local tab selection when the persisted activeArtifactId changes
  // externally — e.g. Stage 3 generates a new artifact then navigates here.
  useEffect(() => {
    const desired = stage4?.activeArtifactId
    if (!desired || desired === activeId) return
    if ((stage4?.artifacts || []).find(a => a.id === desired)) setActiveId(desired)
  }, [stage4?.activeArtifactId]) // eslint-disable-line

  // Keep activeId valid when artifacts change externally (generation completes
  // while the panel is already mounted). Resolved below alongside isSignalsView.

  // ── Tab click — update local state AND persist to session ─────────────────
  function handleTabClick(artifactId) {
    setActiveId(artifactId)
    onSetActiveArtifact?.({ artifactId })
  }

  // ── Centralised delete handler ─────────────────────────────────────────────
  // Reassigns local selection before delegating persistence to SessionFlow.
  function handleDeleteArtifact(artifactId) {
    if (activeId === artifactId) {
      const remaining  = artifacts.filter(a => a.id !== artifactId)
      const deletedIdx = artifacts.findIndex(a => a.id === artifactId)
      // Prefer the item that was next; fall back to previous; then first remaining.
      const next = remaining[deletedIdx] ?? remaining[deletedIdx - 1] ?? remaining[0] ?? null
      setActiveId(next?.id || null)
      if (next?.id) onSetActiveArtifact?.({ artifactId: next.id })
    }
    onDeleteArtifact({ artifactId })
  }

  // Build grouped sidebar structure
  const groups        = groupArtifacts(artifacts)
  const hasRealGroups = groups.some(g => g.id !== '__ungrouped')

  // 'signals' is a virtual tab — not a real artifact id.
  const isSignalsView = activeId === 'signals'
  // When signals is active, don't fall back to artifacts[0].
  const active = isSignalsView ? null : (artifacts.find(a => a.id === activeId) || artifacts[0] || null)

  const signals     = stage4?.learningSignals || []
  const signalsMeta = stage4?.signalsMeta
  const signalCount = signals.length
  const showS5StaleHint = !!(stage5Freshness?.isStale && (stage5Freshness?.staleStages || []).includes('stage4'))

  return (
    <div style={{ maxWidth: 860, padding: 16 }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{session.entity?.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>Stage 4 — strategy artifact workspace</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={onBackToStage3}
            style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 10 }} /> Stage 3
          </button>
          {onViewStage5 && (
            <button
              onClick={onViewStage5}
              title={hasStage5 ? 'View Stage 5 learning patterns' : 'Generate Stage 5 learning patterns from all stage signals'}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600,
                padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                background: hasStage5 ? 'rgba(0,229,180,.12)' : 'var(--s2)',
                border: `1px solid ${hasStage5 ? 'rgba(0,229,180,.4)' : 'var(--border)'}`,
                color: hasStage5 ? 'var(--accent)' : 'var(--muted2)',
              }}
            >
              <i className="ti ti-brain" style={{ fontSize: 10 }} />
              {hasStage5 ? 'Stage 5 — Learning Patterns' : 'Continue to Stage 5'}
              <i className="ti ti-arrow-right" style={{ fontSize: 9 }} />
              {stage5Freshness?.isStale && (
                <i className="ti ti-alert-triangle" style={{ fontSize: 9, color: '#fb923c', marginLeft: 1 }} title="Stage 5 may be out of date" />
              )}
            </button>
          )}
        </div>
      </div>

      {artifacts.length === 0 ? <EmptyArtifactState /> : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <div style={{ width: 220, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Artifacts ({artifacts.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Artifact tabs (grouped by strategy) */}
              {groups.map(group => {
                const isRealGroup = group.id !== '__ungrouped'
                const showHeader  = isRealGroup || hasRealGroups
                return (
                  <React.Fragment key={group.id}>
                    {showHeader && <StrategyGroupRow group={group} />}
                    {group.artifacts.map(a => (
                      <ArtifactTab
                        key={a.id}
                        artifact={a}
                        isActive={!isSignalsView && a.id === active?.id}
                        isChild={isRealGroup}
                        onClick={() => handleTabClick(a.id)}
                        onDelete={handleDeleteArtifact}
                      />
                    ))}
                  </React.Fragment>
                )
              })}

              {/* ── Divider — Learning Signals + Stage 5 ────────────────── */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 2 }}>
                {/* Learning Signals tab — only rendered when handler is wired */}
                {onGenerateSignals && (
                  <button
                    onClick={() => setActiveId('signals')}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 12px',
                      background: isSignalsView ? 'rgba(139,92,246,.1)' : 'transparent',
                      borderLeft: isSignalsView ? '2px solid var(--a3)' : '2px solid transparent',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    <i className="ti ti-lightbulb" style={{ fontSize: 11, color: isSignalsView ? 'var(--a3)' : 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 10, color: isSignalsView ? 'var(--text)' : 'var(--muted2)', fontWeight: isSignalsView ? 600 : 400 }}>
                      Learning Signals
                    </span>
                    {signalCount > 0 && (
                      <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--a3)', background: 'rgba(139,92,246,.12)', border: '1px solid rgba(139,92,246,.25)' }}>
                        {signalCount}
                      </span>
                    )}
                    {showS5StaleHint && (
                      <i className="ti ti-alert-triangle" style={{ fontSize: 9, color: '#fb923c' }} title="Stage 5 may need update" />
                    )}
                  </button>
                )}

                {/* Stage 5 sidebar tab — always visible independent of onGenerateSignals */}
                {onViewStage5 && (
                  <button
                    onClick={onViewStage5}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 12px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      borderLeft: '2px solid transparent',
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    <i className="ti ti-brain" style={{ fontSize: 11, color: hasStage5 ? 'var(--accent)' : 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 10, color: hasStage5 ? 'var(--text)' : 'var(--muted2)' }}>
                      {hasStage5 ? 'Stage 5 — Patterns' : 'Stage 5 →'}
                    </span>
                    {!hasStage5 && (
                      <i className="ti ti-sparkles" style={{ fontSize: 9, color: 'var(--accent)' }} />
                    )}
                    {hasStage5 && stage5Freshness?.isStale && (
                      <i className="ti ti-alert-triangle" style={{ fontSize: 9, color: '#fb923c' }} title="May be out of date" />
                    )}
                    {hasStage5 && !stage5Freshness?.isStale && (
                      <i className="ti ti-chevron-right" style={{ fontSize: 9, color: 'var(--muted)' }} />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Main content ─────────────────────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {isSignalsView ? (
              <SignalsView
                signals={signals}
                signalsMeta={signalsMeta}
                isGenerating={!!isGeneratingSignals}
                onGenerate={onGenerateSignals}
                stage5Freshness={stage5Freshness}
                hasStage5={hasStage5}
                onViewStage5={onViewStage5}
              />
            ) : active ? (
              <ArtifactViewer
                key={active.id}
                artifact={active}
                session={session}
                onRefine={({ refinementContext }) =>
                  onRefineArtifact({ artifactId: active.id, refinementContext })
                }
              />
            ) : <EmptyArtifactState />}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Signal type → display config ─────────────────────────────────────────────
const S4_SIGNAL_TYPES = {
  artifact_structure_signal:    { label: 'Artifact Structure', color: 'var(--accent)' },
  audience_framing_signal:      { label: 'Audience Framing',   color: 'var(--a4)'    },
  refinement_signal:            { label: 'Refinement',         color: '#fb923c'       },
  version_evolution_signal:     { label: 'Version Evolution',  color: 'var(--a3)'    },
  readiness_warning_signal:     { label: 'Readiness Warning',  color: '#f87171'       },
  validation_checkpoint_signal: { label: 'Validation',         color: 'var(--accent)' },
  negative_learning_signal:     { label: 'Negative Learning',  color: '#f87171'       },
  decision_tag_signal:          { label: 'Decision Tag',       color: 'var(--a4)'    },
  artifact_quality_signal:      { label: 'Artifact Quality',   color: 'var(--a3)'    },
  strategy_execution_signal:    { label: 'Strategy Execution', color: '#fb923c'       },
}

// ── Signals view — rendered in the main content area when the Signals tab is active ──
function SignalsView({ signals, signalsMeta, isGenerating, onGenerate, stage5Freshness, hasStage5, onViewStage5 }) {
  const count    = signals.length
  const hasError = signalsMeta?.status === 'error'
  const showS5StaleHint = !!(stage5Freshness?.isStale && (stage5Freshness?.staleStages || []).includes('stage4'))

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="ti ti-lightbulb" style={{ fontSize: 12, color: 'var(--a3)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>Stage 4 Learning Signals</span>
          {count > 0 && <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 6 }}>{count} signal{count !== 1 ? 's' : ''}</span>}
          {signalsMeta?.generatedAt && !isGenerating && (
            <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 8 }}>
              {new Date(signalsMeta.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {showS5StaleHint && (
          <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3, color: '#fb923c', background: 'rgba(251,146,60,.1)', border: '1px solid rgba(251,146,60,.3)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 8 }} /> Stage 5 may need update
          </span>
        )}
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 10px', borderRadius: 4, cursor: isGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: hasError ? 'rgba(248,113,113,.1)' : 'var(--s2)', border: `1px solid ${hasError ? 'rgba(248,113,113,.35)' : 'var(--border)'}`, color: hasError ? '#fca5a5' : 'var(--muted)', opacity: isGenerating ? .6 : 1, flexShrink: 0 }}
        >
          <i className={`ti ${isGenerating ? 'ti-loader-2' : hasError ? 'ti-refresh' : count > 0 ? 'ti-refresh' : 'ti-sparkles'}`} style={{ fontSize: 9 }} />
          {isGenerating ? 'Generating…' : hasError ? 'Retry' : count > 0 ? 'Refresh' : 'Generate'}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px' }}>
        {isGenerating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: 'var(--muted2)' }}>
            <i className="ti ti-loader-2" style={{ fontSize: 16, color: 'var(--a3)' }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Analysing artifacts…</div>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>Extracting learning signals from artifact generation patterns</div>
            </div>
          </div>
        )}

        {!isGenerating && hasError && (
          <div style={{ padding: '12px 14px', border: '1px solid rgba(248,113,113,.3)', borderRadius: 'var(--r)', background: 'rgba(248,113,113,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 12, color: '#f87171' }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: '#fca5a5' }}>Signal generation failed</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>
              {signalsMeta?.errorMessage || 'The response was incomplete or could not be parsed.'}
            </div>
            {signalsMeta?.rawPreview && (
              <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', fontStyle: 'italic' }}>
                Preview: {signalsMeta.rawPreview.slice(0, 120)}{signalsMeta.rawPreview.length > 120 ? '…' : ''}
              </div>
            )}
          </div>
        )}

        {!isGenerating && !hasError && count === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <i className="ti ti-lightbulb" style={{ fontSize: 24, color: 'var(--muted)', display: 'block', marginBottom: 10 }} />
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>No learning signals yet</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto 14px' }}>
              Generate signals to capture what artifact creation taught you about effective strategy artifacts.
            </div>
            <button
              onClick={onGenerate}
              style={{ fontSize: 10, fontFamily: 'var(--fm)', padding: '6px 16px', background: 'var(--accent)', border: 'none', borderRadius: 5, cursor: 'pointer', color: '#000', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              <i className="ti ti-sparkles" style={{ fontSize: 10 }} /> Generate Learning Signals
            </button>
          </div>
        )}

        {!isGenerating && !hasError && count > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signals.map(sig => {
              const typeCfg   = S4_SIGNAL_TYPES[sig.signalType] || { label: sig.signalType, color: 'var(--muted2)' }
              const confColor = sig.confidence === 'high' ? 'var(--accent)' : sig.confidence === 'medium' ? '#fb923c' : 'var(--muted)'
              return (
                <div key={sig.signalId} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--s2)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span title={`Confidence: ${sig.confidence}`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: confColor, flexShrink: 0, marginTop: 4 }} />
                    <div style={{ flex: 1, fontSize: 10, fontWeight: 600, lineHeight: 1.4 }}>{sig.title}</div>
                    <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: typeCfg.color, background: `${typeCfg.color}14`, border: `1px solid ${typeCfg.color}30` }}>
                      {typeCfg.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: sig.applyForwardGuidance ? 6 : 0 }}>{sig.description}</div>
                  {sig.applyForwardGuidance && (
                    <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', paddingLeft: 8, borderLeft: '2px solid rgba(0,229,180,.35)', lineHeight: 1.5 }}>
                      → {sig.applyForwardGuidance}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      {sig.transferability || 'general'}
                    </span>
                    {(sig.applicableScopes || []).map(sc => (
                      <span key={sc} style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>{sc}</span>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Stage 5 nudge at the bottom of the signals list */}
            {onViewStage5 && (
              <div style={{ marginTop: 4, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="ti ti-brain" style={{ fontSize: 12, color: hasStage5 ? 'var(--accent)' : 'var(--a3)', flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)' }}>
                  {hasStage5 ? 'View cross-stage synthesis in Stage 5.' : 'Ready to synthesise cross-stage patterns in Stage 5.'}
                </div>
                <button
                  onClick={onViewStage5}
                  style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 12px', background: hasStage5 ? 'rgba(0,229,180,.1)' : 'var(--accent)', border: `1px solid ${hasStage5 ? 'rgba(0,229,180,.35)' : 'var(--accent)'}`, borderRadius: 4, cursor: 'pointer', color: hasStage5 ? 'var(--accent)' : '#000', fontWeight: hasStage5 ? 400 : 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                >
                  <i className={`ti ${hasStage5 ? 'ti-eye' : 'ti-sparkles'}`} style={{ fontSize: 9 }} />
                  {hasStage5 ? 'View Stage 5' : 'Generate Stage 5'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stage 4 learning signals drawer (kept for backward compat, no longer rendered in main panel) ──
function LearningSignalsDrawer({ signals, isGenerating, onGenerate, signalsMeta, stage5Freshness }) {
  // Auto-open when signals already exist at mount time (e.g. navigating back to Stage 4).
  const [open, setOpen] = useState(() => signals.length > 0)
  const count    = signals.length
  // Also auto-open when signals first arrive while the panel is mounted (generation just completed).
  const prevCount = useRef(signals.length)
  useEffect(() => {
    if (signals.length > 0 && prevCount.current === 0) setOpen(true)
    prevCount.current = signals.length
  }, [signals.length])
  const status   = isGenerating
    ? 'generating'
    : (signalsMeta?.status || (count > 0 ? 'current' : 'empty'))
  const hasError = status === 'error'
  const showS5StaleHint = !!(stage5Freshness?.isStale && (stage5Freshness?.staleStages || []).includes('stage4'))

  const STATUS_CFG = {
    empty:      { label: 'Empty',      color: 'var(--muted)'  },
    generating: { label: 'Generating', color: 'var(--a4)'    },
    current:    { label: 'Current',    color: 'var(--accent)' },
    stale:      { label: 'Stale',      color: '#fb923c'       },
    error:      { label: 'Error',      color: '#f87171'       },
  }
  const statusCfg  = STATUS_CFG[status] || { label: status, color: 'var(--muted)' }
  const generatedAt = signalsMeta?.generatedAt || null

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${hasError ? 'rgba(248,113,113,.4)' : 'var(--border)'}`,
      borderRadius: 'var(--r)', overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        style={{
          padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8,
          cursor: count > 0 ? 'pointer' : 'default', userSelect: 'none',
          borderBottom: open && count > 0 ? '1px solid var(--border)' : 'none',
          background: hasError ? 'rgba(248,113,113,.03)' : 'transparent',
        }}
        onClick={() => count > 0 && setOpen(o => !o)}
      >
        <i className="ti ti-lightbulb" style={{ fontSize: 11, color: hasError ? '#f87171' : 'var(--a4)', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 600, flex: 1 }}>
          Stage 4 Learning Signals
          {count > 0 && <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 5 }}>({count})</span>}
        </span>

        {/* Status badge */}
        {!isGenerating && (
          <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: statusCfg.color, background: `${statusCfg.color}14`, border: `1px solid ${statusCfg.color}30`, flexShrink: 0 }}>
            {statusCfg.label}
          </span>
        )}

        {/* Timestamp */}
        {generatedAt && !hasError && !isGenerating && (
          <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0 }}>
            {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}

        {/* Generating indicator */}
        {isGenerating && (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <i className="ti ti-loader-2" style={{ fontSize: 9 }} /> Generating…
          </span>
        )}

        {/* Retry button — only when error and not generating */}
        {hasError && !isGenerating && (
          <button
            onClick={e => { e.stopPropagation(); onGenerate() }}
            style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.35)', color: '#fca5a5', flexShrink: 0 }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 9 }} /> Retry
          </button>
        )}

        {/* Generate / Refresh button */}
        {!hasError && !isGenerating && (
          <button
            onClick={e => { e.stopPropagation(); onGenerate() }}
            style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--muted)', flexShrink: 0 }}
          >
            <i className={`ti ${count > 0 ? 'ti-refresh' : 'ti-sparkles'}`} style={{ fontSize: 9 }} />
            {count > 0 ? 'Refresh' : 'Generate'}
          </button>
        )}

        {/* Stage 5 stale hint */}
        {showS5StaleHint && !isGenerating && (
          <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3, color: '#fb923c', background: 'rgba(251,146,60,.1)', border: '1px solid rgba(251,146,60,.3)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 8 }} /> Stage 5 may need update
          </span>
        )}

        {/* Chevron when signals exist */}
        {count > 0 && (
          <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)' }} />
        )}
      </div>

      {/* Error body */}
      {hasError && !isGenerating && (
        <div style={{ padding: '10px 14px', minHeight: 60 }}>
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>
            {signalsMeta?.errorMessage || 'Learning signal generation failed because the response was incomplete or could not be parsed.'}
          </div>
          {signalsMeta?.rawPreview && (
            <div style={{ marginTop: 6, fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
              Preview: {signalsMeta.rawPreview.slice(0, 120)}{signalsMeta.rawPreview.length > 120 ? '…' : ''}
            </div>
          )}
        </div>
      )}

      {/* Generating body */}
      {isGenerating && (
        <div style={{ padding: '12px 14px', minHeight: 80, display: 'flex', alignItems: 'center', gap: 10 }}>
          <i className="ti ti-loader-2" style={{ fontSize: 16, color: 'var(--a4)' }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Analysing artifacts…</div>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>Extracting learning signals from artifact generation patterns</div>
          </div>
        </div>
      )}

      {/* Signal list */}
      {open && count > 0 && !isGenerating && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 220 }}>
          {signals.map(sig => {
            const typeCfg   = S4_SIGNAL_TYPES[sig.signalType] || { label: sig.signalType, color: 'var(--muted2)' }
            const confColor = sig.confidence === 'high' ? 'var(--accent)' : sig.confidence === 'medium' ? '#fb923c' : 'var(--muted)'
            return (
              <div key={sig.signalId} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--s2)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                  <span title={`Confidence: ${sig.confidence}`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: confColor, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, fontSize: 10, fontWeight: 600, lineHeight: 1.4 }}>{sig.title}</div>
                  <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: typeCfg.color, background: `${typeCfg.color}14`, border: `1px solid ${typeCfg.color}30` }}>
                    {typeCfg.label}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 6 }}>{sig.description}</div>
                {sig.applyForwardGuidance && (
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', paddingLeft: 8, borderLeft: '2px solid rgba(0,229,180,.35)', lineHeight: 1.5 }}>
                    → {sig.applyForwardGuidance}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    {sig.transferability || 'general'}
                  </span>
                  {(sig.applicableScopes || []).map(sc => (
                    <span key={sc} style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>{sc}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasError && !isGenerating && count === 0 && (
        <div style={{ padding: '6px 14px 10px', fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
          Generate signals to capture what artifact creation taught you about effective strategy artifacts.
        </div>
      )}
    </div>
  )
}

// ── Strategy group header row ──────────────────────────────────────────────────
// Non-interactive parent that labels a set of persona-variant child tabs.
// Shows the strategy name, its posture badge, and the variant count.
function StrategyGroupRow({ group }) {
  const posColor = group.posture
    ? (POSTURE_COLOR[group.posture] || 'var(--muted)')
    : 'var(--muted)'

  return (
    <div style={{
      padding: '7px 12px',
      background: 'var(--s2)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{
          flex: 1, fontSize: 9, fontWeight: 700,
          color: 'var(--muted2)', lineHeight: 1.35,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {group.name}
        </div>
        <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', flexShrink: 0, marginTop: 1 }}>
          {group.artifacts.length} variant{group.artifacts.length !== 1 ? 's' : ''}
        </span>
      </div>
      {group.posture && (
        <span style={{
          marginTop: 4, display: 'inline-block',
          fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3,
          color: posColor, background: `${posColor}12`, border: `1px solid ${posColor}28`,
        }}>
          {group.posture}
        </span>
      )}
    </div>
  )
}

// ── Artifact tab ───────────────────────────────────────────────────────────────
// isChild=true: indented 8px, shows persona role as primary label (side as badge),
//               omits posture badge (already shown in StrategyGroupRow parent).
// isChild=false: flat / ungrouped style — shows strategy name + posture badge.
function ArtifactTab({ artifact, isActive, isChild = false, onClick, onDelete }) {
  const [hovered,    setHovered]    = useState(false)
  const [confirming, setConfirming] = useState(false)

  const posColor     = POSTURE_COLOR[artifact.strategyPosture] || 'var(--muted)'
  const isGenerating = artifact.status === 'generating'
  const isError      = artifact.status === 'error'
  const isRefining   = artifact.refineStatus === 'refining'
  const vCount       = getVersions(artifact).length

  // Child tabs label by persona role; top-level tabs label by strategy name.
  const label = isChild
    ? (artifact.persona?.role || 'Unnamed variant')
    : (artifact.sourceStrategyName || 'Unnamed strategy')

  // Side label for child tabs (Customer / Provider)
  const sideLabel = isChild && artifact.persona?.side
    ? (artifact.persona.side === 'customer' ? 'Customer' : 'Provider')
    : null

  function handleTrashClick(e) {
    e.stopPropagation()
    setConfirming(true)
  }
  function handleConfirm(e) {
    e.stopPropagation()
    onDelete(artifact.id)
    // Tab disappears — no need to reset confirming.
  }
  function handleCancel(e) {
    e.stopPropagation()
    setConfirming(false)
  }

  return (
    <div
      onClick={confirming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirming(false) }}
      style={{
        padding: '9px 12px',
        paddingLeft: isChild ? 20 : 12,
        cursor: confirming ? 'default' : 'pointer',
        userSelect: 'none', borderBottom: '1px solid var(--border)',
        background: isActive ? 'rgba(0,229,180,.05)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        position: 'relative',
      }}
    >
      {confirming ? (
        /* ── Inline confirmation ── */
        <div>
          <div style={{ fontSize: 9, color: '#f87171', lineHeight: 1.5, marginBottom: 8 }}>
            Delete this artifact? Content, versions, refinements, and evolution history will be removed.
          </div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 8, fontStyle: 'italic',
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            "{label}"
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              onClick={handleCancel}
              style={{ flex: 1, fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 0', borderRadius: 4, cursor: 'pointer', background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{ flex: 1, fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600, padding: '3px 0', borderRadius: 4, cursor: 'pointer', background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.4)', color: '#fca5a5' }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        /* ── Normal tab content ── */
        <>
          {/* Title row + trash icon */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 4 }}>
            <div style={{
              flex: 1, fontSize: 10, fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--text)' : 'var(--muted2)',
              lineHeight: 1.4,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {label}
            </div>
            {/* Trash icon — visible on hover only */}
            <button
              onClick={handleTrashClick}
              title="Delete this artifact"
              style={{
                flexShrink: 0, marginTop: 1,
                background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
                color: hovered ? 'var(--muted)' : 'transparent',
                transition: 'color .15s',
                lineHeight: 1,
              }}
            >
              <i className="ti ti-trash" style={{ fontSize: 11 }} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Child: show persona side badge; non-child: show role + posture */}
            {isChild ? (
              sideLabel && (
                <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)' }}>
                  {sideLabel}
                </span>
              )
            ) : (
              <>
                {artifact.persona?.role && (
                  <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)' }}>
                    {artifact.persona.role}
                  </span>
                )}
                {artifact.strategyPosture && (
                  <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: posColor, background: `${posColor}12`, border: `1px solid ${posColor}28` }}>
                    {artifact.strategyPosture}
                  </span>
                )}
              </>
            )}
            {vCount > 1 && (
              <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--a4)', background: 'rgba(90,80,220,.07)', border: '1px solid rgba(90,80,220,.18)' }}>
                v{vCount}
              </span>
            )}
          </div>

          {isGenerating && <div style={{ marginTop: 5, fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--a4)', display: 'flex', alignItems: 'center', gap: 3 }}><i className="ti ti-loader-2" style={{ fontSize: 9 }} /> Generating…</div>}
          {isRefining   && <div style={{ marginTop: 5, fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--a3)', display: 'flex', alignItems: 'center', gap: 3 }}><i className="ti ti-loader-2" style={{ fontSize: 9 }} /> Refining…</div>}
          {isError      && <div style={{ marginTop: 5, fontSize: 8, fontFamily: 'var(--fm)', color: '#f87171', display: 'flex', alignItems: 'center', gap: 3 }}><i className="ti ti-alert-circle" style={{ fontSize: 9 }} /> Failed</div>}
        </>
      )}
    </div>
  )
}

// ── Artifact viewer ────────────────────────────────────────────────────────────
function ArtifactViewer({ artifact, session, onRefine }) {
  const [refinementCtx,    setRefinementCtx]   = useState('')
  const [showRefine,       setShowRefine]       = useState(false)
  const [showHistory,      setShowHistory]      = useState(false)
  const [viewingVersionId, setViewingVersionId] = useState(null)
  const [showHighlights,   setShowHighlights]   = useState(true)
  const [confirmMsg,       setConfirmMsg]       = useState(null)
  const [exportMsg,        setExportMsg]        = useState(null)
  const prevRefineStatusRef = useRef(artifact.refineStatus)

  useEffect(() => {
    const prev = prevRefineStatusRef.current
    prevRefineStatusRef.current = artifact.refineStatus
    if (prev === 'refining' && artifact.refineStatus == null) {
      const v = getVersions(artifact)
      setConfirmMsg(`Artifact revised. Version ${v.length} created.`)
      const t = setTimeout(() => setConfirmMsg(null), 6000)
      setRefinementCtx('')
      setShowRefine(false)
      return () => clearTimeout(t)
    }
  }, [artifact.refineStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derived values computed BEFORE useMemo and BEFORE early returns — satisfies
  // React's unconditional hook-ordering rule (useMemo is a hook and must not
  // appear after a conditional return).
  const versions          = getVersions(artifact)
  const activeVersion     = getActiveVersion(artifact)
  const displayVersion    = viewingVersionId
    ? (getVersionById(artifact, viewingVersionId) || activeVersion)
    : activeVersion
  const isRefining          = artifact.refineStatus === 'refining'
  const isViewingPrior      = !!(viewingVersionId && viewingVersionId !== activeVersion?.id)
  const hasMultipleVersions = versions.length > 1

  // useMemo must be unconditional — declared before all early returns
  const sectionSpans = useMemo(() => {
    if (!hasMultipleVersions || !displayVersion?.data) return {}
    const result = {}
    for (const sec of (displayVersion.data.sections || [])) {
      result[sec.heading] = computeSectionProvenance(
        versions,
        displayVersion.versionNumber,
        sec.heading,
      )
    }
    return result
  }, [displayVersion?.id, versions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExport() {
    const pkg      = buildStrategyBasisPackage(session, artifact, displayVersion)
    const filename = buildExportFilename(session, artifact, displayVersion)
    downloadStrategyBasisPackage(pkg, filename)
    setExportMsg('Strategy Basis Package exported.')
    setTimeout(() => setExportMsg(null), 4000)
  }

  // Early returns — all hooks (useState, useRef, useEffect, useMemo) called above
  if (artifact.status === 'generating') return <GeneratingState />
  if (artifact.status === 'error') {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }}>
        <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.25)', borderRadius: 'var(--r)', fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-alert-triangle" /> Artifact generation failed: {artifact.errorMessage || 'Unknown error'}
        </div>
      </div>
    )
  }
  if (!displayVersion?.data) return <EmptyArtifactState />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
        <ArtifactCardHeader
          data={displayVersion.data}
          artifact={artifact}
          displayVersion={displayVersion}
          totalVersions={versions.length}
          showHighlights={showHighlights}
          onToggleHighlights={() => setShowHighlights(o => !o)}
          hasMultipleVersions={hasMultipleVersions}
        />
        {isViewingPrior && (
          <ViewingBanner
            version={displayVersion}
            activeVersionNumber={activeVersion?.versionNumber}
            onBack={() => setViewingVersionId(null)}
          />
        )}
        <ArtifactBody
          data={displayVersion.data}
          artifact={artifact}
          sectionSpans={sectionSpans}
          showHighlights={showHighlights}
        />
      </div>

      {confirmMsg && (
        <div style={{ padding: '8px 12px', background: 'rgba(0,229,180,.08)', border: '1px solid rgba(0,229,180,.25)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--fm)' }}>
          <i className="ti ti-circle-check" style={{ fontSize: 12 }} />
          {confirmMsg}
          <button onClick={() => setConfirmMsg(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}><i className="ti ti-x" /></button>
        </div>
      )}

      {/* ── Export Strategy Basis Package ─────────────────────────────────── */}
      <div style={{
        padding: '10px 14px',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-package-export" style={{ fontSize: 13, color: 'var(--a4)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 1 }}>Export Strategy Basis Package</div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
            Download a structured JSON package with this artifact version + upstream strategy basis for use in Business Strategy Execution Studio.
          </div>
        </div>
        {exportMsg ? (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <i className="ti ti-circle-check" style={{ fontSize: 11 }} /> {exportMsg}
          </span>
        ) : (
          <button
            onClick={handleExport}
            style={{
              fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
              padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
              background: 'rgba(90,80,220,.12)', border: '1px solid rgba(90,80,220,.35)',
              color: 'var(--a4)', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            }}
          >
            <i className="ti ti-download" style={{ fontSize: 10 }} /> Export
          </button>
        )}
      </div>

      {!isViewingPrior && (
        <RefinementPanel
          artifact={artifact}
          refinementCtx={refinementCtx}
          onCtxChange={setRefinementCtx}
          isRefining={isRefining}
          showRefine={showRefine}
          onToggle={() => setShowRefine(o => !o)}
          onRefine={() => onRefine({ refinementContext: refinementCtx })}
        />
      )}

      {hasMultipleVersions && (
        <VersionHistoryPanel
          versions={versions}
          activeVersionId={activeVersion?.id}
          showHistory={showHistory}
          onToggle={() => setShowHistory(o => !o)}
          onView={id => { setViewingVersionId(id); setShowRefine(false) }}
        />
      )}
    </div>
  )
}

// ── Artifact card header ───────────────────────────────────────────────────────
function ArtifactCardHeader({ data, artifact, displayVersion, totalVersions, showHighlights, onToggleHighlights, hasMultipleVersions }) {
  const posColor = POSTURE_COLOR[artifact.strategyPosture] || 'var(--muted)'
  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, marginBottom: 3 }}>{data.artifactTitle}</div>
          {data.subtitle && <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>{data.subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          {totalVersions > 1 && (
            <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '2px 7px', borderRadius: 3, color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)' }}>
              v{displayVersion.versionNumber} / {totalVersions}
            </span>
          )}
          <span style={{ fontSize: 8, fontFamily: 'var(--fm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', padding: '3px 8px', borderRadius: 3, color: posColor, background: `${posColor}14`, border: `1px solid ${posColor}30` }}>
            {artifact.strategyPosture}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {artifact.persona && (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 7px', borderRadius: 3, color: 'var(--a4)', background: 'rgba(90,80,220,.07)', border: '1px solid rgba(90,80,220,.18)' }}>
            {artifact.persona.side === 'customer' ? 'Customer-side' : 'Provider-side'} · {artifact.persona.role}
          </span>
        )}
        {artifact.persona?.toneEmphasis?.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {artifact.persona.toneEmphasis.map(t => (
              <span key={t} style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3, color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)' }}>{t}</span>
            ))}
          </div>
        )}
        {data.personaSummary && (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>For: {data.personaSummary}</span>
        )}
        {hasMultipleVersions && (
          <button
            onClick={onToggleHighlights}
            title={showHighlights ? 'Hide word-level provenance highlights' : 'Show which words/phrases changed by version'}
            style={{
              marginLeft: 'auto', fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 9px', borderRadius: 3,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              border: showHighlights ? `1px solid ${VERSION_COLORS[2].span}` : '1px solid var(--border)',
              background: showHighlights ? VERSION_COLORS[2].badgeBg : 'var(--s2)',
              color: showHighlights ? VERSION_COLORS[2].badge : 'var(--muted)',
            }}
          >
            <i className={`ti ${showHighlights ? 'ti-eye' : 'ti-eye-off'}`} style={{ fontSize: 10 }} />
            {showHighlights ? 'Highlights on' : 'Highlights off'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Provenance text renderer ───────────────────────────────────────────────────
function ProvenanceText({ spans }) {
  return (
    <>
      {spans.map((span, i) => {
        const color = span.originVersion > 1 ? getVersionColor(span.originVersion) : null
        return (
          <React.Fragment key={i}>
            {color ? (
              <span
                title={`Introduced / changed in v${span.originVersion}`}
                style={{ background: color.span, borderRadius: 2, padding: '1px 2px', color: 'inherit' }}
              >
                {span.text}
              </span>
            ) : (
              span.text
            )}
            {i < spans.length - 1 ? ' ' : ''}
          </React.Fragment>
        )
      })}
    </>
  )
}

// ── Artifact body ──────────────────────────────────────────────────────────────
function ArtifactBody({ data, artifact, sectionSpans = {}, showHighlights = false }) {
  return (
    <div style={{ padding: '14px 18px' }}>
      {(data.sections || []).map((section, i) => {
        const spans        = sectionSpans[section.heading]
        const useProvenance = showHighlights && spans && spans.length > 0
        return (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>
              {section.heading}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.8 }}>
              {useProvenance ? <ProvenanceText spans={spans} /> : section.body}
            </div>
          </div>
        )
      })}

      {data.keyDecisions?.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 13px', background: 'rgba(0,229,180,.04)', border: '1px solid rgba(0,229,180,.2)', borderRadius: 6 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>Key decisions</div>
          {data.keyDecisions.map((d, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.65, marginBottom: 4, display: 'flex', gap: 7 }}>
              <span style={{ color: 'var(--accent)', fontFamily: 'var(--fm)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{d}
            </div>
          ))}
        </div>
      )}

      {data.callToAction && (
        <div style={{ marginBottom: 14, padding: '10px 13px', background: 'rgba(90,80,220,.05)', border: '1px solid rgba(90,80,220,.2)', borderRadius: 6 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Call to action</div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, fontWeight: 500 }}>{data.callToAction}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {data.validationCheckpoints?.length > 0 && (
          <div style={{ padding: '8px 11px', borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Validation checkpoints</div>
            {data.validationCheckpoints.map((v, i) => (
              <div key={i} style={{ fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 4, paddingLeft: 9, borderLeft: '2px solid var(--accent)40' }}>{v}</div>
            ))}
          </div>
        )}
        {data.readinessWarnings?.length > 0 && (
          <div style={{ padding: '8px 11px', borderRadius: 6, background: 'rgba(248,113,113,.03)', border: '1px solid rgba(248,113,113,.18)' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Readiness warnings</div>
            {data.readinessWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 4, paddingLeft: 9, borderLeft: '2px solid rgba(248,113,113,.35)' }}>{w}</div>
            ))}
          </div>
        )}
      </div>

      {artifact.sourceStrategyName && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
            Source strategy: <span style={{ color: 'var(--muted2)' }}>{artifact.sourceStrategyName}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ── Viewing-prior-version banner ───────────────────────────────────────────────
function ViewingBanner({ version, activeVersionNumber, onBack }) {
  return (
    <div style={{ padding: '8px 18px', background: 'rgba(251,146,60,.04)', borderTop: '1px solid rgba(251,146,60,.2)', borderBottom: '1px solid rgba(251,146,60,.2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <i className="ti ti-clock" style={{ fontSize: 11, color: '#fb923c', flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: '#fb923c', fontFamily: 'var(--fm)' }}>
        Viewing Version {version.versionNumber} (read-only) — active is Version {activeVersionNumber}
      </span>
      {version.changeSummary && (
        <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', fontStyle: 'italic', flex: 1 }}>
          "{version.changeSummary.length > 90 ? version.changeSummary.slice(0, 90) + '…' : version.changeSummary}"
        </span>
      )}
      <button onClick={onBack} style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 8px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--muted)', flexShrink: 0 }}>
        Back to active
      </button>
    </div>
  )
}

// ── Refinement panel ───────────────────────────────────────────────────────────
const CONTEXT_HINTS = [
  'Internal constraints', 'Budget limits', 'Stakeholder concerns',
  'Implementation realities', 'Customer feedback', 'Updated assumptions',
  'Stronger problem framing', 'Risk escalation', 'Missing evidence',
  'Measurable outcome targets',
]

function RefinementPanel({ artifact, refinementCtx, onCtxChange, isRefining, showRefine, onToggle, onRefine }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: '9px 14px', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8, borderBottom: showRefine ? '1px solid var(--border)' : 'none' }}>
        <i className="ti ti-pencil" style={{ fontSize: 11, color: 'var(--a4)', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 600, flex: 1 }}>Add context / refine artifact</span>
        {isRefining && (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <i className="ti ti-loader-2" style={{ fontSize: 10 }} /> Regenerating…
          </span>
        )}
        <i className={`ti ti-chevron-${showRefine ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)' }} />
      </div>
      {showRefine && (
        <div style={{ padding: 14 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 5 }}>Click to append a context type:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {CONTEXT_HINTS.map(hint => (
                <button key={hint} onClick={() => onCtxChange(prev => prev ? prev + '\n' + hint + ': ' : hint + ': ')} disabled={isRefining}
                  style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 7px', borderRadius: 3, cursor: 'pointer', background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--muted)', opacity: isRefining ? .5 : 1 }}>
                  {hint}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={refinementCtx} onChange={e => onCtxChange(e.target.value)} disabled={isRefining} rows={5}
            placeholder="Add context that should influence this artifact, such as internal constraints, customer realities, stakeholder concerns, implementation limits, or validation targets."
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, fontFamily: 'inherit', color: 'var(--text)', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 5, padding: '7px 9px', resize: 'vertical', outline: 'none', lineHeight: 1.6, marginBottom: 10, opacity: isRefining ? .5 : 1 }}
          />
          {artifact.refineStatus === 'error' && (
            <div style={{ fontSize: 10, color: '#f87171', marginBottom: 8, fontFamily: 'var(--fm)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 11 }} /> Refinement failed: {artifact.refineError || 'Unknown error'}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onRefine} disabled={isRefining || !refinementCtx.trim()}
              style={{ fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600, padding: '5px 14px', borderRadius: 5, cursor: (isRefining || !refinementCtx.trim()) ? 'not-allowed' : 'pointer', background: 'var(--a4)', color: '#fff', border: 'none', opacity: (isRefining || !refinementCtx.trim()) ? .5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className={`ti ${isRefining ? 'ti-loader-2' : 'ti-refresh'}`} style={{ fontSize: 10 }} />
              {isRefining ? 'Regenerating…' : 'Regenerate artifact with context'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Version history panel ──────────────────────────────────────────────────────
function VersionHistoryPanel({ versions, activeVersionId, showHistory, onToggle, onView }) {
  const nonBaseVersions = versions.filter(v => v.versionNumber > 1)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ padding: '9px 14px', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8, borderBottom: showHistory ? '1px solid var(--border)' : 'none' }}>
        <i className="ti ti-history" style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 600, flex: 1 }}>Artifact evolution</span>
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>{versions.length} version{versions.length !== 1 ? 's' : ''}</span>
        <i className={`ti ti-chevron-${showHistory ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)' }} />
      </div>

      {showHistory && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nonBaseVersions.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>Highlight key:</span>
              <span style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3, color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)' }}>v1 — base</span>
              {nonBaseVersions.map(v => {
                const c = getVersionColor(v.versionNumber)
                return (
                  <span key={v.id} style={{ fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3, color: c.badge, background: c.badgeBg, border: `1px solid ${c.span}` }}>
                    v{v.versionNumber} — {c.label}
                  </span>
                )
              })}
            </div>
          )}

          {[...versions].reverse().map(v => {
            const isActive = v.id === activeVersionId
            return (
              <div key={v.id} style={{ padding: '9px 11px', borderRadius: 6, background: isActive ? 'rgba(0,229,180,.04)' : 'var(--s2)', border: isActive ? '1px solid rgba(0,229,180,.25)' : '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: v.changeSummary || v.refinementContext ? 6 : 0 }}>
                  <span style={{ fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 700, padding: '1px 6px', borderRadius: 3, color: isActive ? 'var(--accent)' : 'var(--muted)', background: isActive ? 'rgba(0,229,180,.1)' : 'var(--s2)', border: isActive ? '1px solid rgba(0,229,180,.3)' : '1px solid var(--border)' }}>
                    v{v.versionNumber}
                  </span>
                  {isActive && <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Active</span>}
                  <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 'auto' }}>{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                {v.changeSummary && (
                  <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: v.refinementContext ? 4 : 0, fontStyle: 'italic' }}>{v.changeSummary}</div>
                )}
                {v.refinementContext && (
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: !isActive ? 6 : 0, paddingLeft: 8, borderLeft: '2px solid var(--border2)', lineHeight: 1.5 }}>
                    Context: "{v.refinementContext.length > 110 ? v.refinementContext.slice(0, 110) + '…' : v.refinementContext}"
                  </div>
                )}
                {!isActive && (
                  <button onClick={() => onView(v.id)} style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    View v{v.versionNumber}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Shared states ──────────────────────────────────────────────────────────────
function GeneratingState() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Generating artifact…</div>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 16 }}>Building a decision-basis document for this strategy posture</div>
      <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 200, margin: '0 auto' }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--accent),var(--a3))', borderRadius: 1, width: '60%', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    </div>
  )
}

function EmptyArtifactState() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center' }}>
      <i className="ti ti-file-text" style={{ fontSize: 24, display: 'block', marginBottom: 10, color: 'var(--border2)' }} />
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>No artifacts yet</div>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', maxWidth: 280, margin: '0 auto' }}>
        Return to Stage 3 and click "Generate Stage 4 artifact" on any strategy menu card.
      </div>
    </div>
  )
}
