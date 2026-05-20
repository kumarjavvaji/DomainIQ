import React from 'react'
import NodeCard from './NodeCard'
import DiffView from './DiffView'
import { policyLabel } from '../v4utils'

export default function Stage1Panel({
  session,
  diff,
  regenerating,
  onNodeStatusChange,
  onChallengeClick,
  onRegenNode,
  onAcceptDiff,
  onDiscardDiff,
}) {
  const { stage1, generationPolicy, entity, intent } = session
  const nodes = stage1?.nodes || []

  const accepted     = nodes.filter(n => n.userStatus === 'accepted').length
  const challenged   = nodes.filter(n => n.userStatus === 'challenged').length
  const rejected     = nodes.filter(n => n.userStatus === 'rejected').length
  const needsReview  = nodes.filter(n => n.userStatus === 'needs_review').length
  const pending      = nodes.filter(n => n.userStatus === 'pending').length

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

      {/* Diff view (shown between inspection bar and nodes when a regen result is available) */}
      {diff && (
        <DiffView diff={diff} onAccept={onAcceptDiff} onDiscard={onDiscardDiff} />
      )}

      {/* Node list */}
      <div style={{ marginBottom: 14 }}>
        {nodes.map(node => (
          <NodeCard
            key={node.id}
            node={node}
            allNodes={nodes}
            onStatusChange={onNodeStatusChange}
            onChallengeClick={onChallengeClick}
            onRegenClick={onRegenNode}
          />
        ))}
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
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{p.title}</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{p.insight}</div>
            </div>
          ))}
        </div>
      )}

      {/* Deeper stages placeholder */}
      <div style={{
        padding: '10px 14px', background: 'var(--s2)',
        border: '1px solid var(--border)', borderRadius: 'var(--r)',
        fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <i className="ti ti-lock" style={{ fontSize: 12 }} />
        Stage 2–5 unlocks after the Stage 1 loop is proven — accept or challenge nodes above first
      </div>

      {/* Regeneration loading indicator */}
      {regenerating && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: 'var(--surface)', border: '1px solid rgba(251,146,60,.4)',
          borderRadius: 10, padding: '10px 16px', fontSize: 11, fontFamily: 'var(--fm)',
          color: '#fb923c', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          <i className="ti ti-refresh" style={{ animation: 'spin 1s linear infinite', fontSize: 13 }} />
          Regenerating impacted nodes…
        </div>
      )}
    </div>
  )
}

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
