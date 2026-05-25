import React, { useState, useRef, useEffect } from 'react'

// ── Posture colour lookup ──────────────────────────────────────────────────────
const POSTURE_COLOR = {
  'double down':          'var(--accent)',
  'selective investment': 'var(--a4)',
  'maintain':             '#fb923c',
  'deprioritize':         'var(--muted)',
  'divest/reallocate':    '#f87171',
}

// ── Version helpers ────────────────────────────────────────────────────────────
// Backward compat: artifacts created before versioning have no .versions array.
// Synthesize a single v1 from .data so all downstream code can assume versions
// is always a non-empty array when status === 'complete'.

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

// ── Main Stage 4 Panel ─────────────────────────────────────────────────────────
export default function Stage4Panel({
  session,
  stage4,
  onBackToStage3,
  onGenerateArtifact,
  onRefineArtifact,
}) {
  const artifacts = stage4?.artifacts || []
  const [activeId, setActiveId] = useState(artifacts[0]?.id || null)

  const active = artifacts.find(a => a.id === activeId) || artifacts[0] || null

  return (
    <div style={{ maxWidth: 860, padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{session.entity?.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>
            Stage 4 — strategy artifact workspace
          </div>
        </div>
        <button
          onClick={onBackToStage3}
          style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
            background: 'var(--s2)', border: '1px solid var(--border)',
            borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 10 }} /> Stage 3
        </button>
      </div>

      {artifacts.length === 0 ? (
        <EmptyArtifactState />
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Sidebar */}
          <div style={{
            width: 220, flexShrink: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '8px 12px', borderBottom: '1px solid var(--border)',
              fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '.07em',
            }}>
              Artifacts ({artifacts.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {artifacts.map(a => (
                <ArtifactTab
                  key={a.id}
                  artifact={a}
                  isActive={a.id === active?.id}
                  onClick={() => setActiveId(a.id)}
                />
              ))}
            </div>
          </div>

          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {active ? (
              <ArtifactViewer
                key={active.id}
                artifact={active}
                onRefine={({ refinementContext }) =>
                  onRefineArtifact({ artifactId: active.id, refinementContext })
                }
              />
            ) : (
              <EmptyArtifactState />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Artifact tab (sidebar) ─────────────────────────────────────────────────────

function ArtifactTab({ artifact, isActive, onClick }) {
  const posColor   = POSTURE_COLOR[artifact.strategyPosture] || 'var(--muted)'
  const isGenerating = artifact.status === 'generating'
  const isError      = artifact.status === 'error'
  const isRefining   = artifact.refineStatus === 'refining'
  const versions     = getVersions(artifact)
  const vCount       = versions.length

  return (
    <div
      onClick={onClick}
      style={{
        padding: '9px 12px', cursor: 'pointer', userSelect: 'none',
        borderBottom: '1px solid var(--border)',
        background: isActive ? 'rgba(0,229,180,.05)' : 'transparent',
        borderLeft:  isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      <div style={{
        fontSize: 10, fontWeight: isActive ? 600 : 400,
        color: isActive ? 'var(--text)' : 'var(--muted2)',
        lineHeight: 1.4, marginBottom: 4,
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {artifact.sourceStrategyName || 'Unnamed strategy'}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {artifact.persona?.role && (
          <span style={{
            fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3,
            color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)',
          }}>
            {artifact.persona.role}
          </span>
        )}
        {artifact.strategyPosture && (
          <span style={{
            fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3,
            color: posColor, background: `${posColor}12`, border: `1px solid ${posColor}28`,
          }}>
            {artifact.strategyPosture}
          </span>
        )}
        {vCount > 1 && (
          <span style={{
            fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3,
            color: 'var(--a4)', background: 'rgba(90,80,220,.07)', border: '1px solid rgba(90,80,220,.18)',
          }}>
            v{vCount}
          </span>
        )}
      </div>
      {isGenerating && (
        <div style={{ marginTop: 5, fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--a4)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <i className="ti ti-loader-2" style={{ fontSize: 9 }} /> Generating…
        </div>
      )}
      {isRefining && (
        <div style={{ marginTop: 5, fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--a3)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <i className="ti ti-loader-2" style={{ fontSize: 9 }} /> Refining…
        </div>
      )}
      {isError && (
        <div style={{ marginTop: 5, fontSize: 8, fontFamily: 'var(--fm)', color: '#f87171', display: 'flex', alignItems: 'center', gap: 3 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 9 }} /> Failed
        </div>
      )}
    </div>
  )
}

// ── Artifact viewer ────────────────────────────────────────────────────────────
// key={artifact.id} on the parent call ensures this remounts when tabs switch,
// resetting all local state automatically.

function ArtifactViewer({ artifact, onRefine }) {
  const [refinementCtx,   setRefinementCtx]   = useState('')
  const [showRefine,      setShowRefine]       = useState(false)
  const [showHistory,     setShowHistory]      = useState(false)
  const [viewingVersionId,  setViewingVersionId]  = useState(null)
  const [comparingVersionId, setComparingVersionId] = useState(null)
  const [confirmMsg,      setConfirmMsg]       = useState(null)
  const prevRefineStatusRef = useRef(artifact.refineStatus)

  // Detect refineStatus transition 'refining' → null to show confirmation
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

  if (artifact.status === 'generating') return <GeneratingState />
  if (artifact.status === 'error') {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16 }}>
        <div style={{ padding: '10px 14px', background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.25)', borderRadius: 'var(--r)', fontSize: 11, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-alert-triangle" />
          Artifact generation failed: {artifact.errorMessage || 'Unknown error'}
        </div>
      </div>
    )
  }

  const versions      = getVersions(artifact)
  const activeVersion = getActiveVersion(artifact)
  const displayVersion = viewingVersionId
    ? (getVersionById(artifact, viewingVersionId) || activeVersion)
    : activeVersion

  if (!displayVersion?.data) return <EmptyArtifactState />

  const isRefining    = artifact.refineStatus === 'refining'
  const isViewingPrior = !!(viewingVersionId && viewingVersionId !== activeVersion?.id)
  const isComparing   = !!comparingVersionId

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Main artifact card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>

        <ArtifactCardHeader
          data={displayVersion.data}
          artifact={artifact}
          displayVersion={displayVersion}
          activeVersion={activeVersion}
          totalVersions={versions.length}
        />

        {/* Prior-version viewing banner */}
        {isViewingPrior && (
          <ViewingBanner
            version={displayVersion}
            activeVersionNumber={activeVersion?.versionNumber}
            onBack={() => setViewingVersionId(null)}
            onCompare={() => { setComparingVersionId(viewingVersionId); setViewingVersionId(null) }}
          />
        )}

        {/* Either diff view or normal body */}
        {isComparing ? (
          <DiffView
            versionA={getVersionById(artifact, comparingVersionId) || versions[0]}
            versionB={activeVersion}
            onClose={() => setComparingVersionId(null)}
          />
        ) : (
          <ArtifactBody data={displayVersion.data} artifact={artifact} />
        )}
      </div>

      {/* Success confirmation */}
      {confirmMsg && (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(0,229,180,.08)', border: '1px solid rgba(0,229,180,.25)',
          borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--fm)',
        }}>
          <i className="ti ti-circle-check" style={{ fontSize: 12 }} />
          {confirmMsg}
          <button
            onClick={() => setConfirmMsg(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}
          >
            <i className="ti ti-x" />
          </button>
        </div>
      )}

      {/* Refinement panel — hidden while viewing prior or comparing */}
      {!isViewingPrior && !isComparing && (
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

      {/* Version history — only when multiple versions exist */}
      {versions.length > 1 && (
        <VersionHistoryPanel
          versions={versions}
          activeVersionId={activeVersion?.id}
          showHistory={showHistory}
          onToggle={() => setShowHistory(o => !o)}
          onView={id => { setViewingVersionId(id); setComparingVersionId(null); setShowRefine(false) }}
          onCompare={id => { setComparingVersionId(id); setViewingVersionId(null) }}
        />
      )}
    </div>
  )
}

// ── Artifact card header ───────────────────────────────────────────────────────

function ArtifactCardHeader({ data, artifact, displayVersion, activeVersion, totalVersions }) {
  const posColor = POSTURE_COLOR[artifact.strategyPosture] || 'var(--muted)'
  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35, marginBottom: 3 }}>
            {data.artifactTitle}
          </div>
          {data.subtitle && (
            <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>{data.subtitle}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          {totalVersions > 1 && (
            <span style={{
              fontSize: 8, fontFamily: 'var(--fm)', padding: '2px 7px', borderRadius: 3,
              color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)',
            }}>
              v{displayVersion.versionNumber} / {totalVersions}
            </span>
          )}
          <span style={{
            fontSize: 8, fontFamily: 'var(--fm)', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.06em', padding: '3px 8px', borderRadius: 3,
            color: posColor, background: `${posColor}14`, border: `1px solid ${posColor}30`,
          }}>
            {artifact.strategyPosture}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {artifact.persona && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 7px', borderRadius: 3,
            color: 'var(--a4)', background: 'rgba(90,80,220,.07)', border: '1px solid rgba(90,80,220,.18)',
          }}>
            {artifact.persona.side === 'customer' ? 'Customer-side' : 'Provider-side'} · {artifact.persona.role}
          </span>
        )}
        {artifact.persona?.toneEmphasis?.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {artifact.persona.toneEmphasis.map(t => (
              <span key={t} style={{
                fontSize: 8, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3,
                color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)',
              }}>
                {t}
              </span>
            ))}
          </div>
        )}
        {data.personaSummary && (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 'auto' }}>
            For: {data.personaSummary}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Artifact body ──────────────────────────────────────────────────────────────

function ArtifactBody({ data, artifact }) {
  return (
    <div style={{ padding: '14px 18px' }}>
      {(data.sections || []).map((section, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text)',
            textTransform: 'uppercase', letterSpacing: '.06em',
            marginBottom: 6, paddingBottom: 5, borderBottom: '1px solid var(--border)',
          }}>
            {section.heading}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.8 }}>
            {section.body}
          </div>
        </div>
      ))}

      {data.keyDecisions?.length > 0 && (
        <div style={{
          marginBottom: 14, padding: '10px 13px',
          background: 'rgba(0,229,180,.04)', border: '1px solid rgba(0,229,180,.2)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>
            Key decisions
          </div>
          {data.keyDecisions.map((d, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.65, marginBottom: 4, display: 'flex', gap: 7 }}>
              <span style={{ color: 'var(--accent)', fontFamily: 'var(--fm)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              {d}
            </div>
          ))}
        </div>
      )}

      {data.callToAction && (
        <div style={{
          marginBottom: 14, padding: '10px 13px',
          background: 'rgba(90,80,220,.05)', border: '1px solid rgba(90,80,220,.2)', borderRadius: 6,
        }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
            Call to action
          </div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, fontWeight: 500 }}>
            {data.callToAction}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {data.validationCheckpoints?.length > 0 && (
          <div style={{ padding: '8px 11px', borderRadius: 6, background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
              Validation checkpoints
            </div>
            {data.validationCheckpoints.map((v, i) => (
              <div key={i} style={{ fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 4, paddingLeft: 9, borderLeft: '2px solid var(--accent)40' }}>
                {v}
              </div>
            ))}
          </div>
        )}
        {data.readinessWarnings?.length > 0 && (
          <div style={{ padding: '8px 11px', borderRadius: 6, background: 'rgba(248,113,113,.03)', border: '1px solid rgba(248,113,113,.18)' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
              Readiness warnings
            </div>
            {data.readinessWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 4, paddingLeft: 9, borderLeft: '2px solid rgba(248,113,113,.35)' }}>
                {w}
              </div>
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

function ViewingBanner({ version, activeVersionNumber, onBack, onCompare }) {
  return (
    <div style={{
      padding: '8px 18px',
      background: 'rgba(251,146,60,.04)',
      borderTop: '1px solid rgba(251,146,60,.2)',
      borderBottom: '1px solid rgba(251,146,60,.2)',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <i className="ti ti-clock" style={{ fontSize: 11, color: '#fb923c', flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: '#fb923c', fontFamily: 'var(--fm)' }}>
        Viewing Version {version.versionNumber} (read-only) — active is Version {activeVersionNumber}
      </span>
      {version.changeSummary && (
        <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--fm)', fontStyle: 'italic', flex: 1 }}>
          "{version.changeSummary.length > 90 ? version.changeSummary.slice(0, 90) + '…' : version.changeSummary}"
        </span>
      )}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        <button
          onClick={onCompare}
          style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 8px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--muted)' }}
        >
          Compare with active
        </button>
        <button
          onClick={onBack}
          style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 8px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--muted)' }}
        >
          Back to active
        </button>
      </div>
    </div>
  )
}

// ── Side-by-side diff view ─────────────────────────────────────────────────────

function DiffView({ versionA, versionB, onClose }) {
  const sectionsA = versionA?.data?.sections || []
  const sectionsB = versionB?.data?.sections || []

  // Union of headings preserving order: A first, then B-only
  const headingsA = sectionsA.map(s => s.heading)
  const headingsBOnly = sectionsB.map(s => s.heading).filter(h => !headingsA.includes(h))
  const allHeadings = [...headingsA, ...headingsBOnly]

  return (
    <div style={{ padding: '14px 18px' }}>
      {/* Diff header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3,
          background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--muted)',
        }}>
          v{versionA.versionNumber}
        </span>
        <i className="ti ti-arrow-right" style={{ fontSize: 10, color: 'var(--muted)' }} />
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3,
          background: 'rgba(0,229,180,.08)', border: '1px solid rgba(0,229,180,.3)', color: 'var(--accent)',
        }}>
          v{versionB.versionNumber} (active)
        </span>
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
          · section-by-section comparison
        </span>
        <button
          onClick={onClose}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
        >
          <i className="ti ti-x" />
        </button>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Version {versionA.versionNumber} · {new Date(versionA.createdAt).toLocaleDateString()}
        </div>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Version {versionB.versionNumber} (active) · {new Date(versionB.createdAt).toLocaleDateString()}
        </div>
      </div>

      {/* Section comparisons */}
      {allHeadings.map(heading => {
        const sA = sectionsA.find(s => s.heading === heading)
        const sB = sectionsB.find(s => s.heading === heading)
        return (
          <div key={heading} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'var(--text)',
              textTransform: 'uppercase', letterSpacing: '.06em',
              marginBottom: 6, paddingBottom: 5, borderBottom: '1px solid var(--border)',
            }}>
              {heading}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{
                fontSize: 10, lineHeight: 1.75, padding: '7px 9px', borderRadius: 4,
                color:      sA ? 'var(--muted2)' : 'var(--muted)',
                fontStyle:  sA ? 'normal' : 'italic',
                background: sA ? 'var(--s2)' : 'transparent',
                border:     sA ? '1px solid var(--border)' : '1px dashed var(--border)',
              }}>
                {sA?.body || '— not present in this version —'}
              </div>
              <div style={{
                fontSize: 10, lineHeight: 1.75, padding: '7px 9px', borderRadius: 4,
                color:      sB ? 'var(--muted2)' : 'var(--muted)',
                fontStyle:  sB ? 'normal' : 'italic',
                background: sB ? 'rgba(0,229,180,.03)' : 'transparent',
                border:     sB ? '1px solid rgba(0,229,180,.15)' : '1px dashed var(--border)',
              }}>
                {sB?.body || '— not present in this version —'}
              </div>
            </div>
          </div>
        )
      })}

      {/* Call-to-action comparison */}
      {(versionA.data?.callToAction || versionB.data?.callToAction) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ padding: '7px 10px', borderRadius: 5, background: 'var(--s2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
              Call to action
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>
              {versionA.data?.callToAction || '—'}
            </div>
          </div>
          <div style={{ padding: '7px 10px', borderRadius: 5, background: 'rgba(0,229,180,.03)', border: '1px solid rgba(0,229,180,.15)' }}>
            <div style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
              Call to action
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>
              {versionB.data?.callToAction || '—'}
            </div>
          </div>
        </div>
      )}

      {/* Change summary from the newer version */}
      {versionB.changeSummary && (
        <div style={{
          padding: '8px 11px', borderRadius: 5,
          background: 'rgba(0,229,180,.04)', border: '1px solid rgba(0,229,180,.2)',
        }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
            What changed (v{versionB.versionNumber})
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{versionB.changeSummary}</div>
        </div>
      )}
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
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{
          padding: '9px 14px', cursor: 'pointer', userSelect: 'none',
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: showRefine ? '1px solid var(--border)' : 'none',
        }}
      >
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
          {/* Context type hints */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 5 }}>
              Click to append a context type:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {CONTEXT_HINTS.map(hint => (
                <button
                  key={hint}
                  onClick={() => onCtxChange(prev => prev ? prev + '\n' + hint + ': ' : hint + ': ')}
                  disabled={isRefining}
                  style={{
                    fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 7px', borderRadius: 3,
                    cursor: 'pointer', background: 'var(--s2)', border: '1px solid var(--border)',
                    color: 'var(--muted)', opacity: isRefining ? .5 : 1,
                  }}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={refinementCtx}
            onChange={e => onCtxChange(e.target.value)}
            disabled={isRefining}
            placeholder="Add context that should influence this artifact, such as internal constraints, customer realities, stakeholder concerns, implementation limits, or validation targets."
            rows={5}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 11, fontFamily: 'inherit', color: 'var(--text)',
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '7px 9px', resize: 'vertical',
              outline: 'none', lineHeight: 1.6, marginBottom: 10,
              opacity: isRefining ? .5 : 1,
            }}
          />

          {artifact.refineStatus === 'error' && (
            <div style={{ fontSize: 10, color: '#f87171', marginBottom: 8, fontFamily: 'var(--fm)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 11 }} />
              Refinement failed: {artifact.refineError || 'Unknown error'}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onRefine}
              disabled={isRefining || !refinementCtx.trim()}
              style={{
                fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
                padding: '5px 14px', borderRadius: 5,
                cursor: (isRefining || !refinementCtx.trim()) ? 'not-allowed' : 'pointer',
                background: 'var(--a4)', color: '#fff', border: 'none',
                opacity: (isRefining || !refinementCtx.trim()) ? .5 : 1,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
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

function VersionHistoryPanel({ versions, activeVersionId, showHistory, onToggle, onView, onCompare }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{
          padding: '9px 14px', cursor: 'pointer', userSelect: 'none',
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: showHistory ? '1px solid var(--border)' : 'none',
        }}
      >
        <i className="ti ti-history" style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 600, flex: 1 }}>Artifact evolution</span>
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
          {versions.length} version{versions.length !== 1 ? 's' : ''}
        </span>
        <i className={`ti ti-chevron-${showHistory ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)' }} />
      </div>

      {showHistory && (
        <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...versions].reverse().map(v => {
            const isActive = v.id === activeVersionId
            return (
              <div
                key={v.id}
                style={{
                  padding: '9px 11px', borderRadius: 6,
                  background: isActive ? 'rgba(0,229,180,.04)' : 'var(--s2)',
                  border: isActive ? '1px solid rgba(0,229,180,.25)' : '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: v.changeSummary || v.refinementContext ? 6 : 0 }}>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 700,
                    padding: '1px 6px', borderRadius: 3,
                    color: isActive ? 'var(--accent)' : 'var(--muted)',
                    background: isActive ? 'rgba(0,229,180,.1)' : 'var(--s2)',
                    border: isActive ? '1px solid rgba(0,229,180,.3)' : '1px solid var(--border)',
                  }}>
                    v{v.versionNumber}
                  </span>
                  {isActive && (
                    <span style={{ fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      Active
                    </span>
                  )}
                  <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 'auto' }}>
                    {new Date(v.createdAt).toLocaleString()}
                  </span>
                </div>

                {v.changeSummary && (
                  <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: v.refinementContext ? 4 : 0, fontStyle: 'italic' }}>
                    {v.changeSummary}
                  </div>
                )}

                {v.refinementContext && (
                  <div style={{
                    fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
                    marginBottom: !isActive ? 6 : 0,
                    paddingLeft: 8, borderLeft: '2px solid var(--border2)',
                    lineHeight: 1.5,
                  }}>
                    Context: "{v.refinementContext.length > 110 ? v.refinementContext.slice(0, 110) + '…' : v.refinementContext}"
                  </div>
                )}

                {!isActive && (
                  <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                    <button
                      onClick={() => onView(v.id)}
                      style={{
                        fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 4,
                        cursor: 'pointer', background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--muted)',
                      }}
                    >
                      View
                    </button>
                    <button
                      onClick={() => onCompare(v.id)}
                      style={{
                        fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 4,
                        cursor: 'pointer', background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--muted)',
                      }}
                    >
                      Compare with active
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Shared minor states ────────────────────────────────────────────────────────

function GeneratingState() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
        Generating artifact…
      </div>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 16 }}>
        Building a decision-basis document for this strategy posture
      </div>
      <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 200, margin: '0 auto' }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--accent),var(--a3))', borderRadius: 1, width: '60%', animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    </div>
  )
}

function EmptyArtifactState() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', padding: '40px 20px', textAlign: 'center',
    }}>
      <i className="ti ti-file-text" style={{ fontSize: 24, display: 'block', marginBottom: 10, color: 'var(--border2)' }} />
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>No artifacts yet</div>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', maxWidth: 280, margin: '0 auto' }}>
        Return to Stage 3 and click "Generate Stage 4 artifact" on any strategy menu card.
      </div>
    </div>
  )
}
