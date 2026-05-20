import React, { useState } from 'react'
import { CHALLENGE_PRESETS } from '../v4schema'

export default function ChallengeModal({ node, onSave, onCancel }) {
  const [selectedPreset, setSelectedPreset] = useState(node.userPreset || null)
  const [note, setNote]                     = useState(node.userNote || '')
  const [warnEmpty, setWarnEmpty]           = useState(false)

  function handleSave() {
    if (!note.trim() && !selectedPreset) {
      setWarnEmpty(true)
      return
    }
    onSave(node.id, selectedPreset, note.trim())
  }

  function handlePresetClick(preset) {
    setSelectedPreset(prev => prev === preset ? null : preset)
    setWarnEmpty(false)
  }

  return (
    <div className="v4-modal-backdrop" onClick={onCancel}>
      <div className="v4-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
              Challenge node <span style={{ fontFamily: 'var(--fm)', color: 'var(--a3)' }}>{node.id}</span>
            </div>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
              Your note will be injected into the regeneration prompt
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', padding: 2 }}
          >
            <i className="ti ti-x" />
          </button>
        </div>

        {/* Node statement (read-only context) */}
        <div style={{
          fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65, padding: '8px 10px',
          background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 14,
        }}>
          {node.statement}
        </div>

        {/* Preset chips */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Quick reason (optional)
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {CHALLENGE_PRESETS.map(preset => (
              <button
                key={preset}
                className={`preset-chip${selectedPreset === preset ? ' selected' : ''}`}
                onClick={() => handlePresetClick(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Note textarea */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Your note <span style={{ color: 'var(--a3)' }}>— strongly encouraged</span>
          </div>
          <textarea
            value={note}
            onChange={e => { setNote(e.target.value); setWarnEmpty(false) }}
            rows={3}
            placeholder="e.g. This assumes SaaS revenue but we have no evidence Finlytica charges recurring fees — they may be purely services-led..."
            style={{
              width: '100%', resize: 'vertical',
              background: 'var(--s2)', border: `1px solid ${warnEmpty ? 'rgba(251,146,60,.5)' : 'var(--border)'}`,
              borderRadius: 6, padding: '8px 10px',
              color: 'var(--text)', fontSize: 11, fontFamily: 'var(--fd)',
              lineHeight: 1.6, outline: 'none',
            }}
          />
          {warnEmpty && (
            <div style={{ fontSize: 10, color: '#fb923c', marginTop: 4, fontFamily: 'var(--fm)' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 10, verticalAlign: -1 }} /> A note helps Claude understand the specific concern. Add one or select a preset.
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 14px', fontSize: 11, fontFamily: 'var(--fd)', fontWeight: 500,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--muted2)', borderRadius: 7, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '7px 16px', fontSize: 11, fontFamily: 'var(--fd)', fontWeight: 600,
              background: 'rgba(251,146,60,.1)', border: '1px solid rgba(251,146,60,.35)',
              color: '#fb923c', borderRadius: 7, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <i className="ti ti-alert-triangle" style={{ fontSize: 11 }} /> Save challenge
          </button>
        </div>

      </div>
    </div>
  )
}
