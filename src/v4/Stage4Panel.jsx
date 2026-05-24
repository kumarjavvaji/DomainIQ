import React, { useState } from 'react'

// ── Posture colour lookup (shared with Stage3Panel) ────────────────────────────
const POSTURE_COLOR = {
  'double down':          'var(--accent)',
  'selective investment': 'var(--a4)',
  'maintain':             '#fb923c',
  'deprioritize':         'var(--muted)',
  'divest/reallocate':    '#f87171',
}

// ── Main Stage 4 Panel ─────────────────────────────────────────────────────────
export default function Stage4Panel({
  session,
  stage4,
  onBackToStage3,
  onGenerateArtifact, // ({ strategyOption, persona }) — called from "New artifact" button
}) {
  const artifacts = stage4?.artifacts || []
  const [activeId, setActiveId] = useState(artifacts[0]?.id || null)

  const active = artifacts.find(a => a.id === activeId) || artifacts[0] || null

  return (
    <div style={{ maxWidth: 820, padding: 16 }}>
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
          {/* Left sidebar — artifact tabs */}
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
                  isActive={a.id === (active?.id)}
                  onClick={() => setActiveId(a.id)}
                />
              ))}
            </div>
          </div>

          {/* Right — artifact content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {active ? (
              <ArtifactViewer artifact={active} />
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
  const posColor = POSTURE_COLOR[artifact.strategyPosture] || 'var(--muted)'
  const isGenerating = artifact.status === 'generating'
  const isError = artifact.status === 'error'

  return (
    <div
      onClick={onClick}
      style={{
        padding: '9px 12px', cursor: 'pointer', userSelect: 'none',
        borderBottom: '1px solid var(--border)',
        background: isActive ? 'rgba(0,229,180,.05)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
    >
      {/* Strategy name */}
      <div style={{
        fontSize: 10, fontWeight: isActive ? 600 : 400,
        color: isActive ? 'var(--text)' : 'var(--muted2)',
        lineHeight: 1.4, marginBottom: 4,
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {artifact.sourceStrategyName || 'Unnamed strategy'}
      </div>
      {/* Persona + posture badges */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
      </div>
      {/* Status indicator */}
      {isGenerating && (
        <div style={{ marginTop: 5, fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--a4)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <i className="ti ti-loader-2" style={{ fontSize: 9 }} /> Generating…
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

function ArtifactViewer({ artifact }) {
  if (artifact.status === 'generating') {
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

  if (artifact.status === 'error') {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r)', padding: 16,
      }}>
        <div style={{
          padding: '10px 14px',
          background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.25)',
          borderRadius: 'var(--r)', fontSize: 11, color: '#f87171',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className="ti ti-alert-triangle" />
          Artifact generation failed: {artifact.errorMessage || 'Unknown error'}
        </div>
      </div>
    )
  }

  const data = artifact.data
  if (!data) return <EmptyArtifactState />

  const posColor = POSTURE_COLOR[artifact.strategyPosture] || 'var(--muted)'

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', overflow: 'hidden',
    }}>
      {/* Artifact header */}
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
          <span style={{
            fontSize: 8, fontFamily: 'var(--fm)', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.06em', padding: '3px 8px', borderRadius: 3, flexShrink: 0,
            color: posColor, background: `${posColor}14`, border: `1px solid ${posColor}30`,
          }}>
            {artifact.strategyPosture}
          </span>
        </div>
        {/* Meta row */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {artifact.persona && (
            <span style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 7px', borderRadius: 3,
              color: 'var(--a4)', background: 'rgba(90,80,220,.07)', border: '1px solid rgba(90,80,220,.18)',
            }}>
              {artifact.persona.side === 'customer' ? 'Customer-side' : 'Provider-side'} · {artifact.persona.role}
            </span>
          )}
          {artifact.persona?.toneEmphasis?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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

      {/* Body sections */}
      <div style={{ padding: '14px 18px' }}>
        {(data.sections || []).map((section, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'var(--text)',
              textTransform: 'uppercase', letterSpacing: '.06em',
              marginBottom: 6, paddingBottom: 5,
              borderBottom: '1px solid var(--border)',
            }}>
              {section.heading}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.8 }}>
              {section.body}
            </div>
          </div>
        ))}

        {/* Key decisions */}
        {data.keyDecisions?.length > 0 && (
          <div style={{
            marginBottom: 14, padding: '10px 13px',
            background: 'rgba(0,229,180,.04)', border: '1px solid rgba(0,229,180,.2)',
            borderRadius: 6,
          }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 7 }}>
              Key decisions
            </div>
            {data.keyDecisions.map((d, i) => (
              <div key={i} style={{
                fontSize: 10, color: 'var(--text)', lineHeight: 1.65, marginBottom: 4,
                display: 'flex', gap: 7,
              }}>
                <span style={{ color: 'var(--accent)', fontFamily: 'var(--fm)', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                {d}
              </div>
            ))}
          </div>
        )}

        {/* Call to action */}
        {data.callToAction && (
          <div style={{
            marginBottom: 14, padding: '10px 13px',
            background: 'rgba(90,80,220,.05)', border: '1px solid rgba(90,80,220,.2)',
            borderRadius: 6,
          }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
              Call to action
            </div>
            <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, fontWeight: 500 }}>
              {data.callToAction}
            </div>
          </div>
        )}

        {/* Validation checkpoints + readiness warnings side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {data.validationCheckpoints?.length > 0 && (
            <div style={{
              padding: '8px 11px', borderRadius: 6,
              background: 'var(--s2)', border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                Validation checkpoints
              </div>
              {data.validationCheckpoints.map((v, i) => (
                <div key={i} style={{
                  fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 4,
                  paddingLeft: 9, borderLeft: '2px solid var(--accent)40',
                }}>
                  {v}
                </div>
              ))}
            </div>
          )}
          {data.readinessWarnings?.length > 0 && (
            <div style={{
              padding: '8px 11px', borderRadius: 6,
              background: 'rgba(248,113,113,.03)', border: '1px solid rgba(248,113,113,.18)',
            }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                Readiness warnings
              </div>
              {data.readinessWarnings.map((w, i) => (
                <div key={i} style={{
                  fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 4,
                  paddingLeft: 9, borderLeft: '2px solid rgba(248,113,113,.35)',
                }}>
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source strategy reference */}
        {artifact.sourceStrategyName && (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
              Source strategy: <span style={{ color: 'var(--muted2)' }}>{artifact.sourceStrategyName}</span>
            </span>
          </div>
        )}
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
