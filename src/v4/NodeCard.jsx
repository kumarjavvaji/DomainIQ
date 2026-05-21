import React from 'react'
import { NODE_TYPES, NODE_STATUS_CONFIG } from '../v4schema'
import { getTrust, confPct } from '../constants'

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

  // Identify dep labels for display
  const depLabels = (node.dependsOn || []).filter(Boolean)

  const cardClass = [
    'node-card',
    node.userStatus === 'challenged'   ? 'is-challenged' : '',
    node.userStatus === 'accepted'     ? 'is-accepted'   : '',
    node.userStatus === 'rejected'     ? 'is-rejected'   : '',
  ].filter(Boolean).join(' ')

  function handleAction(status) {
    if (status === 'challenged') {
      onChallengeClick(node.id)
    } else if (status === 'needs_review') {
      onNeedsReviewClick(node.id)
    } else {
      onStatusChange(node.id, status)
    }
  }

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

      {/* Statement */}
      <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, marginBottom: 8 }}>
        {node.statement}
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

      {/* Change reason (after regen) */}
      {node.changeReason && (
        <div style={{
          fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)',
          fontStyle: 'italic', marginBottom: 8,
        }}>
          <i className="ti ti-info-circle" style={{ fontSize: 10, verticalAlign: -1 }} /> {node.changeReason}
        </div>
      )}

      {/* Meta row: confidence + evidence type + deps */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {/* Confidence bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 36, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)' }}>
            {node.confidence}
          </span>
        </div>

        {/* Evidence type */}
        <span className={`trust trust-${trustCfg.cls.replace('trust-', '')}`} style={{ fontSize: 9 }}>
          <i className={`ti ${trustCfg.icon}`} /> {trustCfg.label}
        </span>

        {/* Dependencies */}
        {depLabels.length > 0 && (
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 'auto' }}>
            depends on: {depLabels.join(', ')}
          </span>
        )}
      </div>

      {/* Challenge note display */}
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
              border: '1px solid',
              borderRadius: 5, cursor: 'pointer',
              background: node.userStatus === action.status ? getActionActiveBg(action.status) : 'transparent',
              color: node.userStatus === action.status ? getActionActiveColor(action.status) : 'var(--muted)',
              borderColor: node.userStatus === action.status ? getActionActiveBorder(action.status) : 'var(--border)',
              display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            <i className={`ti ${action.icon}`} style={{ fontSize: 9 }} /> {action.label}
          </button>
        ))}

        {/* Pressure test button — only shown when this node is challenged */}
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
