import React, { useState, useRef, useEffect, useMemo } from 'react'

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
  onRefineArtifact,
  onDeleteArtifact,
  onSetActiveArtifact,
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
  // while the panel is already mounted).
  const active = artifacts.find(a => a.id === activeId) || artifacts[0] || null

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

  return (
    <div style={{ maxWidth: 860, padding: 16 }}>
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{session.entity?.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>Stage 4 — strategy artifact workspace</div>
        </div>
        <button
          onClick={onBackToStage3}
          style={{ fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 10 }} /> Stage 3
        </button>
      </div>

      {artifacts.length === 0 ? <EmptyArtifactState /> : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Sidebar */}
          <div style={{ width: 220, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Artifacts ({artifacts.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {groups.map(group => {
                // Show a group header for real strategy groups always.
                // Show the "Ungrouped artifacts" header only when mixed with real groups.
                const isRealGroup = group.id !== '__ungrouped'
                const showHeader  = isRealGroup || hasRealGroups
                return (
                  <React.Fragment key={group.id}>
                    {showHeader && <StrategyGroupRow group={group} />}
                    {group.artifacts.map(a => (
                      <ArtifactTab
                        key={a.id}
                        artifact={a}
                        isActive={a.id === active?.id}
                        isChild={isRealGroup}
                        onClick={() => handleTabClick(a.id)}
                        onDelete={handleDeleteArtifact}
                      />
                    ))}
                  </React.Fragment>
                )
              })}
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
            ) : <EmptyArtifactState />}
          </div>
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
function ArtifactViewer({ artifact, onRefine }) {
  const [refinementCtx,    setRefinementCtx]   = useState('')
  const [showRefine,       setShowRefine]       = useState(false)
  const [showHistory,      setShowHistory]      = useState(false)
  const [viewingVersionId, setViewingVersionId] = useState(null)
  const [showHighlights,   setShowHighlights]   = useState(true)
  const [confirmMsg,       setConfirmMsg]       = useState(null)
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

  const versions          = getVersions(artifact)
  const activeVersion     = getActiveVersion(artifact)
  const displayVersion    = viewingVersionId
    ? (getVersionById(artifact, viewingVersionId) || activeVersion)
    : activeVersion

  if (!displayVersion?.data) return <EmptyArtifactState />

  const isRefining          = artifact.refineStatus === 'refining'
  const isViewingPrior      = !!(viewingVersionId && viewingVersionId !== activeVersion?.id)
  const hasMultipleVersions = versions.length > 1

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
