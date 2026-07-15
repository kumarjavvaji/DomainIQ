import React, { useEffect, useMemo, useState } from 'react'
import NodeCard from './NodeCard'
import DiffView from './DiffView'
import { policyLabel, mergeResolvedCitations } from '../v4utils'

export default function Stage1Panel({
  session,
  diff,
  regenerating,
  isRefining,
  onNodeStatusChange,
  onChallengeClick,
  onRegenNode,
  onNeedsReviewClick,
  onAcceptDiff,
  onDiscardDiff,
  onRunStage2,
  onViewStage2,
  onRefine,
  onClearRefinement,
  onEnrich,
  isEnriching,
  enrichmentAvailable,
  enrichmentCount,
  refinementFailed,
  failedRefinementPrompt,
}) {
  const { stage1, generationPolicy, entity, intent } = session
  const nodes = stage1?.nodes || []
  const refinementLayer = stage1?.refinementLayer || null

  // hideSuppressed is lifted here so it can filter the node list rendered below.
  // DirectionalRefinementBar reads it as a prop and toggles via onToggleHideSuppressed.
  const [hideSuppressed, setHideSuppressed] = useState(false)

  // Build the session-level citation registry lookup
  const citationById = useMemo(() => {
    const map = new Map()
    ;(stage1?.citations || []).forEach(c => map.set(c.id, c))
    return map
  }, [stage1?.citations])

  // Resolve citations for a node: merge Stage 1 registry refs with pressure-test citations.
  // Registry takes precedence; pressure-test citations are merged and de-duplicated.
  function resolveNodeCitations(node) {
    const fromRegistry = (node.citationRefs || [])
      .map(id => citationById.get(id))
      .filter(Boolean)

    const reviewCitations = node.latestReview?.citations?.length > 0
      ? node.latestReview.citations
      : (node.reviewHistory || []).slice().reverse().find(e => e.citations?.length > 0)?.citations || []

    return mergeResolvedCitations(fromRegistry, reviewCitations)
  }

  // Auto-scroll to assessment panel whenever a new diff arrives
  useEffect(() => {
    if (!diff) return
    const el = document.getElementById('pt-assessment-panel')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [diff])

  // Reset hideSuppressed when refinement is cleared
  useEffect(() => {
    if (!refinementLayer) setHideSuppressed(false)
  }, [refinementLayer])

  const accepted     = nodes.filter(n => n.userStatus === 'accepted').length
  const challenged   = nodes.filter(n => n.userStatus === 'challenged').length
  const rejected     = nodes.filter(n => n.userStatus === 'rejected').length
  const needsReview  = nodes.filter(n => n.userStatus === 'needs_review').length
  const pending      = nodes.filter(n => n.userStatus === 'pending').length

  // Primary-node gate: respect emphasis when refinement is active.
  // Secondary and suppressed nodes must not block Stage 2 unlock.
  const primaryNodes = refinementLayer
    ? nodes.filter(n => {
        const ov = refinementLayer.nodeOverrides?.[n.id]
        return !ov || ov.emphasis === 'primary'
      })
    : nodes
  const primaryReviewed = primaryNodes.filter(n => n.userStatus !== 'pending').length
  const primaryCount    = primaryNodes.length

  // Sort nodes by refinement rank when active; preserve original array order otherwise.
  // Smaller rank = higher placement (confirmed from sort implementation).
  const sortedNodes = useMemo(() => {
    if (!refinementLayer) return nodes
    return [...nodes].sort((a, b) => {
      const ra = refinementLayer.nodeOverrides?.[a.id]?.rank ?? 999
      const rb = refinementLayer.nodeOverrides?.[b.id]?.rank ?? 999
      return ra - rb
    })
  }, [nodes, refinementLayer])

  return (
    <div style={{ maxWidth: 720, padding: 16 }}>

      {/* Session header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{entity.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>
            {entity.type} · Stage 1 orientation · {intent.role} · {intent.outcome}
          </div>
        </div>
        <div style={{
          fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
          padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--border)',
          borderRadius: 5, whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <i className="ti ti-shield-check" style={{ color: 'var(--accent)', fontSize: 10 }} />
          {policyLabel(generationPolicy)}
        </div>
      </div>

      {/* Summary */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r)', padding: 14, marginBottom: 14,
      }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--fm)', marginBottom: 7 }}>
          Orientation summary
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.8 }}>
          {stage1.summary}
        </div>
      </div>

      {/* Inspection bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 12px', background: 'var(--s2)', border: '1px solid var(--border)',
        borderRadius: 'var(--r)', marginBottom: 14, fontSize: 10, fontFamily: 'var(--fm)',
      }}>
        <span style={{ color: 'var(--muted)', marginRight: 4 }}>Inspection:</span>
        {accepted   > 0 && <Chip label={`${accepted} accepted`}   color="var(--accent)" />}
        {challenged > 0 && <Chip label={`${challenged} challenged`} color="#fb923c" />}
        {rejected   > 0 && <Chip label={`${rejected} rejected`}   color="#f87171" />}
        {needsReview > 0 && <Chip label={`${needsReview} needs review`} color="var(--a2)" />}
        {pending    > 0 && <Chip label={`${pending} pending`}     color="var(--muted)" />}
        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 9 }}>
          {nodes.length} nodes total
        </span>
      </div>

      {/* Directional refinement bar */}
      <DirectionalRefinementBar
        refinementLayer={refinementLayer}
        isRefining={isRefining}
        hideSuppressed={hideSuppressed}
        onToggleHideSuppressed={() => setHideSuppressed(v => !v)}
        onRefine={onRefine}
        onClear={onClearRefinement}
        refinementFailed={refinementFailed}
        failedRefinementPrompt={failedRefinementPrompt}
      />

      {/* DiffView fallback: rendered above the list only when challengedNodeId
          is null or does not match any node (e.g. synthetic retrieval_failed). */}
      {diff && !nodes.some(n => n.id === diff._ptResult?.challengedNodeId) && (
        <div id="pt-assessment-panel">
          <DiffView diff={diff} onAccept={onAcceptDiff} onDiscard={onDiscardDiff} />
        </div>
      )}

      {/* Node list — assessment panel rendered directly below the challenged node */}
      <div style={{ marginBottom: 14 }}>
        {sortedNodes.map(node => {
          const override = refinementLayer?.nodeOverrides?.[node.id] || null
          // Filter suppressed nodes only when user has explicitly enabled hideSuppressed
          if (hideSuppressed && override?.emphasis === 'suppressed') return null
          const resolvedCitations = resolveNodeCitations(node)
          return (
            <React.Fragment key={node.id}>
              <NodeCard
                node={node}
                allNodes={nodes}
                citations={resolvedCitations}
                refinementOverride={override}
                onStatusChange={onNodeStatusChange}
                onChallengeClick={onChallengeClick}
                onRegenClick={onRegenNode}
                onNeedsReviewClick={onNeedsReviewClick}
              />
              {diff && diff._ptResult?.challengedNodeId === node.id && (
                <div id="pt-assessment-panel">
                  <DiffView diff={diff} onAccept={onAcceptDiff} onDiscard={onDiscardDiff} />
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Open questions */}
      {stage1.openQuestions?.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: 12, marginBottom: 14,
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--fm)', marginBottom: 8 }}>
            Open questions
          </div>
          {stage1.openQuestions.map((q, i) => (
            <div key={i} style={{
              fontSize: 11, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 5,
              paddingLeft: 10, borderLeft: '2px solid var(--border2)',
            }}>
              {q}
            </div>
          ))}
        </div>
      )}

      {/* Inferred patterns */}
      {stage1.inferredPatterns?.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', padding: 12, marginBottom: 14,
        }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--fm)', marginBottom: 8 }}>
            Inferred patterns
          </div>
          {stage1.inferredPatterns.map((p, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{p.title}</div>
                {p.transferability && (
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                    color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)',
                  }}>
                    {p.transferability}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{p.insight}</div>
            </div>
          ))}
        </div>
      )}

      {/* Evidence enrichment button — only when there are citation gaps */}
      {(enrichmentAvailable || isEnriching) && (
        <div style={{
          padding: '8px 14px', marginBottom: 8,
          background: 'var(--s2)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <i className="ti ti-database-search" style={{ fontSize: 12, color: 'var(--a3)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--muted2)' }}>
              {isEnriching ? 'Enriching evidence…' : `Enrich evidence — ${enrichmentCount} primary gap${enrichmentCount !== 1 ? 's' : ''}`}
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 1 }}>
              {isEnriching
                ? 'Running bounded search pass — this may take a moment'
                : 'Run a bounded search pass to retrieve citations for uncited primary nodes'}
            </div>
          </div>
          <button
            onClick={enrichmentAvailable && !isEnriching ? onEnrich : undefined}
            disabled={!enrichmentAvailable || isEnriching}
            style={{
              fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
              padding: '5px 12px', borderRadius: 5,
              cursor: enrichmentAvailable && !isEnriching ? 'pointer' : 'not-allowed',
              background: enrichmentAvailable && !isEnriching ? 'var(--a3)' : 'var(--s2)',
              color: enrichmentAvailable && !isEnriching ? '#fff' : 'var(--muted)',
              border: `1px solid ${enrichmentAvailable && !isEnriching ? 'var(--a3)' : 'var(--border)'}`,
              opacity: isEnriching ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 5,
              flexShrink: 0,
            }}
          >
            {isEnriching
              ? <><i className="ti ti-loader-2" style={{ fontSize: 10 }} /> Running…</>
              : <><i className="ti ti-search" style={{ fontSize: 10 }} /> Enrich</>
            }
          </button>
        </div>
      )}

      {/* Stage 2 trigger */}
      <Stage2Trigger
        hasStage2={!!session.stage2}
        primaryReviewed={primaryReviewed}
        primaryCount={primaryCount}
        onRun={onRunStage2}
        onView={onViewStage2}
      />

      {/* Regeneration loading indicator */}
      {regenerating && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--surface)', border: '1px solid rgba(251,146,60,.4)',
          borderRadius: 10, padding: '10px 16px', fontSize: 11, fontFamily: 'var(--fm)',
          color: '#fb923c', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          <i className="ti ti-flask" style={{ animation: 'spin 1s linear infinite', fontSize: 13 }} />
          Pressure testing — retrieving evidence…
        </div>
      )}
    </div>
  )
}

// ── DirectionalRefinementBar ──────────────────────────────────────────────────

function DirectionalRefinementBar({ refinementLayer, isRefining, hideSuppressed, onToggleHideSuppressed, onRefine, onClear, refinementFailed, failedRefinementPrompt }) {
  const [editing, setEditing] = useState(false)
  const [prompt, setPrompt]   = useState('')

  function handleSubmit() {
    const trimmed = prompt.trim()
    if (!trimmed || isRefining) return
    onRefine(trimmed)
    setEditing(false)
  }

  function handleEdit() {
    setPrompt(refinementLayer?.prompt || failedRefinementPrompt || '')
    setEditing(true)
  }

  function handleClear() {
    onClear()
    setPrompt('')
    setEditing(false)
  }

  // Active direction chip
  if (refinementLayer && !editing) {
    const overrides  = refinementLayer.nodeOverrides || {}
    const ids        = Object.keys(overrides)
    const primary    = ids.filter(id => overrides[id].emphasis === 'primary').length
    const suppressed = ids.filter(id => overrides[id].emphasis === 'suppressed').length

    return (
      <div style={{
        background: 'rgba(124,108,250,.06)', border: '1px solid rgba(124,108,250,.3)',
        borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <i className="ti ti-adjustments-horizontal" style={{ fontSize: 13, color: 'var(--a2)', marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--a2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
              Direction active
            </div>
            <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.55, marginBottom: 6 }}>
              "{refinementLayer.prompt}"
            </div>
            {refinementLayer.refinementSummary && (
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.55, marginBottom: 6, fontStyle: 'italic' }}>
                {refinementLayer.refinementSummary}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {primary    > 0 && <Chip label={`${primary} primary`}    color="var(--a2)" />}
              {suppressed > 0 && <Chip label={`${suppressed} suppressed`} color="var(--muted)" />}
              <button
                onClick={onToggleHideSuppressed}
                style={{
                  fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 7px',
                  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
                  background: hideSuppressed ? 'rgba(124,108,250,.1)' : 'transparent',
                  color: 'var(--muted)',
                }}
              >
                {hideSuppressed ? 'Show suppressed' : 'Hide suppressed'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={handleEdit}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 9px',
                border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
                background: 'transparent', color: 'var(--muted)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <i className="ti ti-pencil" style={{ fontSize: 9 }} /> Edit
            </button>
            <button
              onClick={handleClear}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 9px',
                border: '1px solid rgba(248,113,113,.3)', borderRadius: 4, cursor: 'pointer',
                background: 'rgba(248,113,113,.06)', color: '#f87171',
                display: 'flex', alignItems: 'center', gap: 3,
              }}
            >
              <i className="ti ti-x" style={{ fontSize: 9 }} /> Clear
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Direction failed state — show between active-chip and entry form
  if (!refinementLayer && refinementFailed && !editing) {
    return (
      <div style={{
        background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.3)',
        borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 13, color: '#f87171', marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600, color: '#f87171', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
              Direction failed to apply
            </div>
            {failedRefinementPrompt && (
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 4 }}>
                "{failedRefinementPrompt}"
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>
              The response was cut off or invalid. Click Retry to resubmit.
            </div>
          </div>
          <button
            onClick={handleEdit}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 9px',
              border: '1px solid rgba(248,113,113,.4)', borderRadius: 4, cursor: 'pointer',
              background: 'rgba(248,113,113,.08)', color: '#f87171',
              display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
            }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 9 }} /> Retry
          </button>
        </div>
      </div>
    )
  }

  // Entry / edit mode
  if (editing || !refinementLayer) {
    return (
      <div style={{
        background: 'var(--s2)', border: '1px solid var(--border)',
        borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 14,
      }}>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-adjustments-horizontal" style={{ fontSize: 10 }} />
          Refine node direction
        </div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={`e.g. "Lean toward CIAM relevance." · "Focus on product strategy." · "Prioritize competitor gaps." · "Emphasize interview talking points."`}
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--text)',
            background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 5, padding: '7px 10px', resize: 'vertical',
            outline: 'none', lineHeight: 1.55,
          }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit() }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isRefining}
            style={{
              fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
              padding: '5px 14px', borderRadius: 5, cursor: (!prompt.trim() || isRefining) ? 'not-allowed' : 'pointer',
              background: (!prompt.trim() || isRefining) ? 'var(--s2)' : 'var(--a2)',
              color: (!prompt.trim() || isRefining) ? 'var(--muted)' : '#fff',
              border: `1px solid ${(!prompt.trim() || isRefining) ? 'var(--border)' : 'var(--a2)'}`,
              opacity: (!prompt.trim() || isRefining) ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {isRefining
              ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite', fontSize: 10 }} /> Refining…</>
              : <><i className="ti ti-adjustments-horizontal" style={{ fontSize: 10 }} /> Apply direction</>
            }
          </button>
          {editing && (
            <button
              onClick={handleClear}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
                border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
                background: 'transparent', color: 'var(--muted)',
              }}
            >
              Cancel &amp; clear
            </button>
          )}
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 4 }}>
            ⌘↵ to apply
          </span>
        </div>
      </div>
    )
  }

  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', color,
      padding: '2px 7px', borderRadius: 3,
      background: `${color}14`,
      border: `1px solid ${color}40`,
    }}>
      {label}
    </span>
  )
}

function Stage2Trigger({ hasStage2, primaryReviewed, primaryCount, onRun, onView }) {
  const canRun = primaryCount > 0 && primaryReviewed === primaryCount

  if (hasStage2) {
    return (
      <div style={{
        padding: '10px 14px', background: 'var(--s2)',
        border: '1px solid var(--accent)', borderRadius: 'var(--r)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <i className="ti ti-chart-dots-2" style={{ fontSize: 13, color: 'var(--accent)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600, color: 'var(--accent)' }}>
            Stage 2 — Research Expansion
          </div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 1 }}>
            Evidence consolidated and competitors mapped
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
          View Stage 2
          <i className="ti ti-arrow-right" style={{ fontSize: 10 }} />
        </button>
      </div>
    )
  }

  return (
    <div style={{
      padding: '10px 14px', background: 'var(--s2)',
      border: `1px solid ${canRun ? 'var(--border2)' : 'var(--border)'}`,
      borderRadius: 'var(--r)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <i
        className={`ti ${canRun ? 'ti-chart-dots-2' : 'ti-lock'}`}
        style={{ fontSize: 13, color: canRun ? 'var(--muted2)' : 'var(--muted)' }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600, color: canRun ? 'var(--muted2)' : 'var(--muted)' }}>
          Stage 2 — Research Expansion
        </div>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 1 }}>
          {canRun
            ? `All ${primaryCount} primary nodes reviewed — ready to deepen with live retrieval`
            : `${primaryReviewed} of ${primaryCount} primary nodes reviewed — review all primary nodes to unlock`}
        </div>
      </div>
      <button
        onClick={canRun ? onRun : undefined}
        disabled={!canRun}
        style={{
          fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
          padding: '5px 12px', borderRadius: 5,
          cursor: canRun ? 'pointer' : 'not-allowed',
          background: canRun ? 'var(--a2)' : 'var(--s2)',
          color: canRun ? '#fff' : 'var(--muted)',
          border: `1px solid ${canRun ? 'var(--a2)' : 'var(--border)'}`,
          opacity: canRun ? 1 : 0.6,
          display: 'flex', alignItems: 'center', gap: 5,
        }}
      >
        <i className="ti ti-player-play" style={{ fontSize: 10 }} />
        Run Stage 2
      </button>
    </div>
  )
}
