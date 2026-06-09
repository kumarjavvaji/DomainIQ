import React, { useState } from 'react'
import { ENTITY_TYPES, ROLE_LENSES, DEPTH_OPTIONS, RESEARCH_OUTCOMES } from '../v4schema'
import { policyLabel } from '../v4utils'

export default function IntentCapture({ policy, apiKeySet, onSubmit, onUpdatePolicy }) {
  const [entityType, setEntityType] = useState('company')
  const [entityName, setEntityName] = useState('')
  const [entityContext, setEntityContext] = useState('')
  const [what, setWhat]       = useState('')
  const [why, setWhy]         = useState('')
  const [role, setRole]       = useState('Product Manager')
  const [depth, setDepth]     = useState('orientation')
  const [outcome, setOutcome] = useState('Interview prep')

  const canSubmit = entityName.trim() && what.trim()

  function handleSubmit() {
    if (!canSubmit) return
    onSubmit(
      { type: entityType, name: entityName.trim(), context: entityContext.trim() },
      { what: what.trim(), why: why.trim(), role, depth, outcome }
    )
  }

  return (
    <div style={{ maxWidth: 640, padding: 16 }}>

      {/* Title */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>New research session</div>
        <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>
          Stage 1 — orientation · governed inference · inspectable nodes
        </div>
      </div>

      {!apiKeySet && (
        <div style={{
          background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)',
          borderRadius: 'var(--r)', padding: 10, marginBottom: 14,
          fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--a4)',
        }}>
          <i className="ti ti-info-circle" style={{ fontSize: 11, verticalAlign: -1 }} /> No API key — analysis will run on demo data for Finlytica.ai
        </div>
      )}

      {/* Entity type selector */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 7, fontFamily: 'var(--fm)' }}>
          What are you analyzing?
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.entries(ENTITY_TYPES).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setEntityType(key)}
              style={{
                flex: 1, padding: '8px 6px', fontSize: 10, fontFamily: 'var(--fd)', fontWeight: 500,
                border: `1px solid ${entityType === key ? 'var(--accent)' : 'var(--border)'}`,
                background: entityType === key ? 'rgba(0,229,180,.07)' : 'var(--surface)',
                color: entityType === key ? 'var(--accent)' : 'var(--muted2)',
                borderRadius: 7, cursor: 'pointer', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <i className={`ti ${cfg.icon}`} style={{ fontSize: 14 }} />
              <span>{cfg.label}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 5 }}>
          {ENTITY_TYPES[entityType].hint}
        </div>
      </div>

      {/* Entity name */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 10 }}>
        <label style={labelStyle}>Name</label>
        <input
          value={entityName}
          onChange={e => setEntityName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder={ENTITY_TYPES[entityType].hint}
          style={inputStyle}
        />
      </div>

      {/* Entity context — L2 trust */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 14 }}>
        <label style={labelStyle}>
          Prior context <span style={{ color: 'var(--a4)', fontWeight: 400 }}>— L2 user-provided, higher trust than AI inference</span>
        </label>
        <textarea
          value={entityContext}
          onChange={e => setEntityContext(e.target.value)}
          rows={2}
          placeholder="Paste notes, prior research, or known facts. These are injected as user_provided evidence."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* Research intent */}
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, fontFamily: 'var(--fm)' }}>
        Research intent
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 8 }}>
        <label style={labelStyle}>What are you trying to learn?</label>
        <input
          value={what}
          onChange={e => setWhat(e.target.value)}
          placeholder='e.g. "Understand their positioning and revenue model"'
          style={inputStyle}
        />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 10 }}>
        <label style={labelStyle}>Why does this matter right now? (optional)</label>
        <input
          value={why}
          onChange={e => setWhy(e.target.value)}
          placeholder='e.g. "Preparing for a PM interview at a fintech targeting community banks"'
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {/* Role lens */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
          <label style={labelStyle}>Your role lens</label>
          <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
            {ROLE_LENSES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Depth */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
          <label style={labelStyle}>Analysis depth</label>
          <select value={depth} onChange={e => setDepth(e.target.value)} style={inputStyle}>
            {DEPTH_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label} — {d.hint}</option>)}
          </select>
        </div>
      </div>

      {/* Outcome chips */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 7, fontFamily: 'var(--fm)' }}>
          Intended outcome
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {RESEARCH_OUTCOMES.map(o => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              style={{
                fontSize: 10, fontFamily: 'var(--fm)', padding: '4px 10px',
                borderRadius: 20, cursor: 'pointer', border: '1px solid',
                background: outcome === o ? 'rgba(0,229,180,.08)' : 'transparent',
                borderColor: outcome === o ? 'rgba(0,229,180,.4)' : 'var(--border)',
                color: outcome === o ? 'var(--accent)' : 'var(--muted2)',
              }}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Policy badge + ATB toggle */}
      <div style={{
        background: 'var(--s2)', border: '1px solid var(--border)',
        borderRadius: 6, marginBottom: 14, overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
          padding: '6px 10px',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <i className="ti ti-shield-check" style={{ fontSize: 10, color: 'var(--accent)' }} />
          Policy: {policyLabel(policy)}
        </div>
        {onUpdatePolicy && (
          <>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 10px 7px',
              borderTop: '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)',
            }}>
              <input
                type="checkbox"
                checked={!!policy?.useAiToolBridgeForStage1}
                onChange={e => onUpdatePolicy({ useAiToolBridgeForStage1: e.target.checked })}
                style={{ cursor: 'pointer' }}
              />
              <span>Use AI Tool Bridge for Stage 1 node operations</span>
              {policy?.useAiToolBridgeForStage1 && (
                <span style={{
                  fontSize: 9, fontFamily: 'var(--fm)',
                  color: 'var(--accent)', marginLeft: 'auto',
                  padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(0,229,180,.08)', border: '1px solid rgba(0,229,180,.2)',
                }}>
                  Bridge ON
                </span>
              )}
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 10px 7px',
              borderTop: '1px solid var(--border)',
              cursor: 'pointer',
              fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)',
            }}>
              <input
                type="checkbox"
                checked={!!policy?.useAiToolBridgeForStage2Pivot}
                onChange={e => onUpdatePolicy({ useAiToolBridgeForStage2Pivot: e.target.checked })}
                style={{ cursor: 'pointer' }}
              />
              <span>Use AI Tool Bridge for Stage 2 pivot generation</span>
              {policy?.useAiToolBridgeForStage2Pivot && (
                <span style={{
                  fontSize: 9, fontFamily: 'var(--fm)',
                  color: 'var(--accent)', marginLeft: 'auto',
                  padding: '1px 6px', borderRadius: 3,
                  background: 'rgba(0,229,180,.08)', border: '1px solid rgba(0,229,180,.2)',
                }}>
                  Bridge ON
                </span>
              )}
            </label>
            {policy?.useAiToolBridgeForStage2Pivot && (
              <div style={{
                padding: '3px 10px 6px', fontSize: 9, fontFamily: 'var(--fm)',
                color: 'var(--muted)', borderTop: '1px solid var(--border)',
              }}>
                <i className="ti ti-info-circle" style={{ marginRight: 4, fontSize: 9 }} />
                ATB pivot uses parametric knowledge only — no live web search retrieval.
              </div>
            )}
          </>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: 11, fontSize: 12, fontWeight: 700, fontFamily: 'var(--fd)',
          background: canSubmit ? 'var(--accent)' : 'var(--s2)',
          color: canSubmit ? '#0a0b0d' : 'var(--muted)',
          border: 'none', borderRadius: 'var(--r)', cursor: canSubmit ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {apiKeySet ? 'Run Stage 1 analysis →' : 'Load demo session →'}
      </button>

      {!canSubmit && (
        <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', marginTop: 6, textAlign: 'center' }}>
          Name and "what are you learning" are required
        </div>
      )}
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 9, fontWeight: 600, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'var(--muted)',
  padding: '9px 12px 3px', fontFamily: 'var(--fm)',
}
const inputStyle = {
  width: '100%', background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--text)', fontFamily: 'var(--fd)', fontSize: 12,
  padding: '3px 12px 9px',
}
