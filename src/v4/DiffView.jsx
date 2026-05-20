import React from 'react'
import { NODE_TYPES } from '../v4schema'

export default function DiffView({ diff, onAccept, onDiscard }) {
  const { preservedNodes, modifiedNodes, removedNodes, addedNodes, confidenceChanges } = diff

  const totalChanged = modifiedNodes.length + removedNodes.length + addedNodes.length

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid rgba(251,146,60,.3)',
      borderRadius: 'var(--r)', padding: 16, marginBottom: 16,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>
          Regeneration result
        </div>
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c', background: 'rgba(251,146,60,.08)', border: '1px solid rgba(251,146,60,.2)', padding: '2px 8px', borderRadius: 3 }}>
          {totalChanged} modified
        </span>
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)', background: 'var(--s2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 3 }}>
          {preservedNodes.length} preserved
        </span>
      </div>

      {/* Modified nodes */}
      {modifiedNodes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            Modified nodes
          </div>
          {modifiedNodes.map(({ before, after, reason }) => {
            const nodeType = NODE_TYPES[after.type] || NODE_TYPES.finding
            return (
              <div key={after.id} className="diff-modified">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>{after.id}</span>
                  <span className={`node-type ${nodeType.cls}`}>
                    <i className={`ti ${nodeType.icon}`} /> {nodeType.label}
                  </span>
                </div>

                {/* Before */}
                <div style={{
                  fontSize: 10, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 5,
                  padding: '5px 8px', background: 'rgba(248,113,113,.05)',
                  border: '1px solid rgba(248,113,113,.15)', borderRadius: 5,
                }}>
                  <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', display: 'block', marginBottom: 1 }}>before</span>
                  {before.statement}
                </div>

                {/* After */}
                <div style={{
                  fontSize: 10, color: 'var(--text)', lineHeight: 1.6, marginBottom: 5,
                  padding: '5px 8px', background: 'rgba(0,229,180,.04)',
                  border: '1px solid rgba(0,229,180,.15)', borderRadius: 5,
                }}>
                  <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', display: 'block', marginBottom: 1 }}>after</span>
                  {after.statement}
                </div>

                {/* Reason */}
                {reason && (
                  <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', fontStyle: 'italic' }}>
                    <i className="ti ti-info-circle" style={{ fontSize: 9, verticalAlign: -1 }} /> {reason}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Added nodes */}
      {addedNodes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            Added nodes
          </div>
          {addedNodes.map(n => (
            <div key={n.id} className="diff-added">
              <div style={{ fontSize: 10, color: 'var(--text)', lineHeight: 1.6 }}>{n.statement}</div>
            </div>
          ))}
        </div>
      )}

      {/* Removed nodes */}
      {removedNodes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            Removed nodes
          </div>
          {removedNodes.map(n => (
            <div key={n.id} className="diff-removed">
              <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.6 }}>{n.statement}</div>
            </div>
          ))}
        </div>
      )}

      {/* Confidence changes */}
      {confidenceChanges.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
            Confidence changes
          </div>
          {confidenceChanges.map(({ nodeId, before, after }) => (
            <div key={nodeId} style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 3 }}>
              <span style={{ color: 'var(--muted)' }}>{nodeId}</span>: {before} → {after}
            </div>
          ))}
        </div>
      )}

      {/* Preserved count */}
      {preservedNodes.length > 0 && (
        <div style={{
          fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)',
          padding: '6px 10px', background: 'var(--s2)', border: '1px solid var(--border)',
          borderRadius: 6, marginBottom: 14,
        }}>
          <i className="ti ti-lock" style={{ fontSize: 10, verticalAlign: -1 }} /> {preservedNodes.length} node{preservedNodes.length !== 1 ? 's' : ''} preserved without changes
        </div>
      )}

      {/* Accept / Discard */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onAccept}
          style={{
            flex: 1, padding: '9px 0', fontSize: 11, fontWeight: 600, fontFamily: 'var(--fd)',
            background: 'var(--accent)', color: '#0a0b0d', border: 'none',
            borderRadius: 7, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <i className="ti ti-check" /> Accept changes
        </button>
        <button
          onClick={onDiscard}
          style={{
            padding: '9px 16px', fontSize: 11, fontFamily: 'var(--fd)',
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--muted2)', borderRadius: 7, cursor: 'pointer',
          }}
        >
          Discard
        </button>
      </div>
    </div>
  )
}
