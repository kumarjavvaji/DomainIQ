import React, { useState } from 'react'

// ── Section wrapper with collapse toggle ──────────────────────────────────────
function Section({ title, icon, count, children, defaultOpen = true, accentColor }) {
  const [open, setOpen] = useState(defaultOpen)
  const color = accentColor || 'var(--accent)'
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r)', marginBottom: 10, overflow: 'hidden',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 12px', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          userSelect: 'none',
        }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 12, color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{title}</span>
        {count != null && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
            color, background: `${color}14`, border: `1px solid ${color}30`,
          }}>
            {count}
          </span>
        )}
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)' }} />
      </div>
      {open && <div style={{ padding: 12 }}>{children}</div>}
    </div>
  )
}

// ── Confidence badge ───────────────────────────────────────────────────────────
function ConfidenceBadge({ level }) {
  const color = level === 'High' ? 'var(--accent)' : level === 'Medium' ? '#fb923c' : '#f87171'
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color, background: `${color}14`, border: `1px solid ${color}30`,
    }}>
      {level}
    </span>
  )
}

// ── Strength badge ─────────────────────────────────────────────────────────────
function StrengthBadge({ strength }) {
  const s = (strength || '').toLowerCase()
  const color = s === 'strong' ? 'var(--accent)' : s === 'moderate' ? '#fb923c' : '#f87171'
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color, background: `${color}14`, border: `1px solid ${color}30`,
    }}>
      {strength}
    </span>
  )
}

// ── Scope badge ────────────────────────────────────────────────────────────────
function ScopeBadge({ scope }) {
  const s = (scope || '').toLowerCase()
  const color =
    s === 'company'     ? 'var(--a2)'    :
    s === 'industry'    ? 'var(--a4)'    :
    s === 'domain'      ? '#fb923c'      :
    s === 'workflow'    ? 'var(--muted2)':
    s === 'cross-scope' ? 'var(--muted)' : 'var(--muted)'
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
      color, background: `${color}14`, border: `1px solid ${color}30`,
    }}>
      {scope}
    </span>
  )
}

// ── Main Stage 3 Panel ─────────────────────────────────────────────────────────
export default function Stage3Panel({
  session,
  stage3,
  isStale,
  onBackToStage2,
  onRerunStage3,
}) {
  if (!session.stage2) {
    return (
      <div style={{ maxWidth: 720, padding: 16 }}>
        <EmptyState message="Stage 3 requires Stage 2 evidence. Complete Stage 2 first." />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, padding: 16 }}>

      {/* Header */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{session.entity?.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)' }}>
            Stage 3 — strategic synthesis &amp; readiness assessment
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onRerunStage3}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 10 }} /> Re-run
          </button>
          <button
            onClick={onBackToStage2}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 10 }} /> Stage 2
          </button>
        </div>
      </div>

      {/* Stale banner — shown when Stage 2 was re-run after Stage 3 was generated */}
      {isStale && <StaleBanner onRerun={onRerunStage3} />}

      {/* 1 — Emerging Strategic Thesis */}
      {stage3.thesis && (
        <Section title="Emerging strategic thesis" icon="ti-bulb" accentColor="var(--accent)">
          <ThesisSection thesis={stage3.thesis} />
        </Section>
      )}

      {/* 2 — Evidence Map */}
      {stage3.evidenceMap?.length > 0 && (
        <Section
          title="Evidence map"
          icon="ti-map-2"
          count={stage3.evidenceMap.length}
          accentColor="var(--accent)"
        >
          <EvidenceMapSection items={stage3.evidenceMap} />
        </Section>
      )}

      {/* 3 — Insight Clusters */}
      {stage3.insightClusters?.length > 0 && (
        <Section
          title="Insight clusters"
          icon="ti-topology-star-3"
          count={stage3.insightClusters.length}
          accentColor="var(--a2)"
        >
          <InsightClustersSection items={stage3.insightClusters} />
        </Section>
      )}

      {/* 4 — Strategic Implications */}
      {stage3.strategicImplications?.length > 0 && (
        <Section
          title="Strategic implications"
          icon="ti-target-arrow"
          count={stage3.strategicImplications.length}
          accentColor="var(--a4)"
        >
          <StrategicImplicationsSection items={stage3.strategicImplications} />
        </Section>
      )}

      {/* 5 — Strategic Options */}
      {stage3.strategicOptions?.length > 0 && (
        <Section
          title="Strategic options"
          icon="ti-git-branch"
          count={stage3.strategicOptions.length}
          accentColor="var(--a2)"
        >
          <StrategicOptionsSection items={stage3.strategicOptions} />
        </Section>
      )}

      {/* 6 — Risks, Constraints, and Unknowns */}
      {stage3.risksConstraintsUnknowns?.length > 0 && (
        <Section
          title="Risks, constraints &amp; unknowns"
          icon="ti-alert-triangle"
          count={stage3.risksConstraintsUnknowns.length}
          accentColor="#fb923c"
        >
          <RisksSection items={stage3.risksConstraintsUnknowns} />
        </Section>
      )}

      {/* 7 — Audience Confidence Notes */}
      {stage3.audienceConfidenceNotes && (
        <Section
          title="Audience confidence notes"
          icon="ti-users"
          accentColor="var(--a4)"
        >
          <AudienceConfidenceSection data={stage3.audienceConfidenceNotes} />
        </Section>
      )}

      {/* 8 — Stage 4 Readiness Assessment */}
      {stage3.stage4Readiness && (
        <Section
          title="Stage 4 readiness assessment"
          icon="ti-circle-check"
          accentColor={
            stage3.stage4Readiness.status === 'Ready'            ? 'var(--accent)' :
            stage3.stage4Readiness.status === 'Partially Ready'  ? '#fb923c'       : '#f87171'
          }
        >
          <Stage4ReadinessSection data={stage3.stage4Readiness} />
        </Section>
      )}

      {/* 9 — Stage 5 Learning Signals — collapsed by default */}
      {stage3.stage5LearningSignals?.length > 0 && (
        <Section
          title="Stage 5 learning signals"
          icon="ti-sparkles"
          count={stage3.stage5LearningSignals.length}
          accentColor="var(--muted)"
          defaultOpen={false}
        >
          <Stage5SignalsSection items={stage3.stage5LearningSignals} />
        </Section>
      )}

    </div>
  )
}

// ── Section renderers ──────────────────────────────────────────────────────────

function ThesisSection({ thesis }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <ConfidenceBadge level={thesis.confidence} />
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>confidence</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.75, marginBottom: 10, fontWeight: 500 }}>
        {thesis.text}
      </div>
      {thesis.rationale && (
        <div style={{
          fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)',
          fontStyle: 'italic', paddingLeft: 10, borderLeft: '2px solid var(--border2)',
        }}>
          {thesis.rationale}
        </div>
      )}
    </div>
  )
}

function EvidenceMapSection({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
            {item.scope && <ScopeBadge scope={item.scope} />}
            {item.strength && <StrengthBadge strength={item.strength} />}
            {item.lineageRef && (
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                color: 'var(--a2)', background: 'rgba(124,108,250,.1)', border: '1px solid rgba(124,108,250,.2)',
              }}>
                {item.lineageRef}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65, marginBottom: 6 }}>
            {item.observation}
          </div>
          {item.evidenceBasis && (
            <div style={{ marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Evidence basis
              </span>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>{item.evidenceBasis}</div>
            </div>
          )}
          {item.implication && (
            <div>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Implication
              </span>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>{item.implication}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function InsightClustersSection({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((cluster, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{cluster.title}</span>
            {cluster.confidence && <ConfidenceBadge level={cluster.confidence} />}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, marginBottom: 8 }}>
            {cluster.insight}
          </div>
          {cluster.supportingEvidence?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                Supporting evidence
              </div>
              {cluster.supportingEvidence.map((e, j) => (
                <div key={j} style={{
                  fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 3,
                  paddingLeft: 10, borderLeft: '2px solid rgba(124,108,250,.3)',
                }}>
                  {e}
                </div>
              ))}
            </div>
          )}
          {cluster.whyItMatters && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                Why it matters
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{cluster.whyItMatters}</div>
            </div>
          )}
          {cluster.strategicImplication && (
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                Strategic implication
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{cluster.strategicImplication}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function StrategicImplicationsSection({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
            {item.confidence && <ConfidenceBadge level={item.confidence} />}
            {item.stakeholders && (
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                color: 'var(--a4)', background: 'rgba(90,80,220,.08)', border: '1px solid rgba(90,80,220,.2)',
              }}>
                {item.stakeholders}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, marginBottom: 7 }}>
            {item.implication}
          </div>
          {item.relevance && (
            <div style={{ marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Relevance
              </span>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>{item.relevance}</div>
            </div>
          )}
          {item.evidenceBasis && (
            <div>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Evidence basis
              </span>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>{item.evidenceBasis}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function StrategicOptionsSection({ items }) {
  const plausColor = level => {
    const l = (level || '').toLowerCase()
    return l === 'high' ? 'var(--accent)' : l === 'medium' ? '#fb923c' : '#f87171'
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((opt, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{opt.title}</span>
            {opt.plausibilityLevel && (
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                color: plausColor(opt.plausibilityLevel),
                background: `${plausColor(opt.plausibilityLevel)}14`,
                border: `1px solid ${plausColor(opt.plausibilityLevel)}30`,
              }}>
                {opt.plausibilityLevel} plausibility
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, marginBottom: 8 }}>
            {opt.description}
          </div>
          {[
            { label: 'Supporting evidence',  value: opt.supportingEvidence,  color: 'var(--accent)' },
            { label: 'Validation needed',    value: opt.validationNeeded,    color: '#fb923c' },
            { label: 'Risks & trade-offs',   value: opt.risksTradeoffs,      color: '#f87171' },
          ].map(row => row.value ? (
            <div key={row.label} style={{ marginBottom: 6 }}>
              <div style={{
                fontSize: 9, fontFamily: 'var(--fm)', color: row.color,
                textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2,
              }}>
                {row.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{row.value}</div>
            </div>
          ) : null)}
        </div>
      ))}
    </div>
  )
}

function RisksSection({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: '#fb923c', marginBottom: 2 }}>
        <i className="ti ti-alert-triangle" style={{ fontSize: 10, verticalAlign: -1 }} /> Unresolved risks can silently invalidate downstream artifacts — review before Stage 4.
      </div>
      {items.map((risk, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'rgba(251,146,60,.04)', border: '1px solid rgba(251,146,60,.2)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 7 }}>
            {risk.item}
          </div>
          {[
            { label: 'Why it matters',         value: risk.whyItMatters,         color: 'var(--muted)' },
            { label: 'Consequence if ignored',  value: risk.consequenceIfIgnored, color: '#f87171' },
            { label: 'Investigation path',      value: risk.investigationPath,    color: 'var(--a4)' },
          ].map(row => row.value ? (
            <div key={row.label} style={{ marginBottom: 5 }}>
              <div style={{
                fontSize: 9, fontFamily: 'var(--fm)', color: row.color,
                textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2,
              }}>
                {row.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{row.value}</div>
            </div>
          ) : null)}
        </div>
      ))}
    </div>
  )
}

function AudienceConfidenceSection({ data }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.reasoningPath && (
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>
            Reasoning path
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7 }}>{data.reasoningPath}</div>
        </div>
      )}
      {data.defensibilityNotes && (
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>
            Defensibility notes
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7 }}>{data.defensibilityNotes}</div>
        </div>
      )}
      {[
        { key: 'trustRequirements',    label: 'Trust requirements',    color: 'var(--accent)' },
        { key: 'tradeoffsToAcknowledge', label: 'Trade-offs to acknowledge', color: '#fb923c' },
        { key: 'evidenceGaps',         label: 'Evidence gaps',         color: '#f87171' },
      ].map(group => (data[group.key]?.length > 0) ? (
        <div key={group.key}>
          <div style={{
            fontSize: 9, fontFamily: 'var(--fm)', color: group.color,
            textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5,
          }}>
            {group.label}
          </div>
          {data[group.key].map((item, i) => (
            <div key={i} style={{
              fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 3,
              paddingLeft: 10, borderLeft: `2px solid ${group.color}40`,
            }}>
              {item}
            </div>
          ))}
        </div>
      ) : null)}
    </div>
  )
}

function Stage4ReadinessSection({ data }) {
  const statusColor =
    data.status === 'Ready'           ? 'var(--accent)' :
    data.status === 'Partially Ready' ? '#fb923c'       : '#f87171'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 11, fontFamily: 'var(--fm)', fontWeight: 700,
          padding: '4px 14px', borderRadius: 20,
          color: statusColor,
          background: `${statusColor}14`,
          border: `1px solid ${statusColor}40`,
        }}>
          {data.status}
        </span>
      </div>

      {data.rationale && (
        <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7 }}>
          {data.rationale}
        </div>
      )}

      {data.missingInputs?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>
            Missing inputs
          </div>
          {data.missingInputs.map((item, i) => (
            <div key={i} style={{
              fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65, marginBottom: 3,
              paddingLeft: 10, borderLeft: '2px solid rgba(248,113,113,.3)',
            }}>
              {item}
            </div>
          ))}
        </div>
      )}

      {data.artifactCandidates?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>
            Artifact candidates
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {data.artifactCandidates.map((a, i) => (
              <span key={i} style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3,
                color: 'var(--accent)', background: 'rgba(0,229,180,.08)',
                border: '1px solid rgba(0,229,180,.2)',
              }}>
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.suggestedArtifactType && (
        <div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
            Suggested artifact type
          </div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--a4)',
            padding: '5px 10px', borderRadius: 5,
            background: 'rgba(90,80,220,.06)', border: '1px solid rgba(90,80,220,.2)',
            display: 'inline-block',
          }}>
            {data.suggestedArtifactType}
          </div>
        </div>
      )}
    </div>
  )
}

function Stage5SignalsSection({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 2 }}>
        <i className="ti ti-info-circle" style={{ fontSize: 10, verticalAlign: -1 }} /> Process-level signals only — for improving future research runs, not for client output.
      </div>
      {items.map((sig, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 6,
          background: 'var(--s2)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{sig.signal}</span>
            {sig.stage && (
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)',
              }}>
                {sig.stage}
              </span>
            )}
          </div>
          {sig.whyItMatters && (
            <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginRight: 4 }}>Why it matters:</span>
              {sig.whyItMatters}
            </div>
          )}
          {sig.recommendedFutureBehavior && (
            <div style={{ fontSize: 10, color: 'var(--a4)', lineHeight: 1.6 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', marginRight: 4 }}>Recommended:</span>
              {sig.recommendedFutureBehavior}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Stale Stage 3 banner ───────────────────────────────────────────────────────
// Shown when session.stage2.id !== session.stage3.generatedFromStage2Id.
// Stage 2 was re-run since Stage 3 was generated. Stage 3 content is still
// readable and rendered below — this is a non-blocking informational warning.

function StaleBanner({ onRerun }) {
  return (
    <div style={{
      padding: '10px 14px',
      background: 'rgba(251,146,60,.05)',
      border: '1px solid rgba(251,146,60,.3)',
      borderRadius: 'var(--r)',
      marginBottom: 14,
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 13, color: '#fb923c', flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: '#fb923c', fontFamily: 'var(--fm)', flex: 1 }}>
        Stage 1 or Stage 2 inputs have changed since this synthesis was generated — Stage 3 may not reflect the current evidence basis.
      </span>
      <button
        onClick={onRerun}
        style={{
          fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
          padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
          background: '#fb923c', color: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        }}
      >
        <i className="ti ti-refresh" style={{ fontSize: 11 }} /> Re-run Stage 3
      </button>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div style={{
      padding: '40px 20px', textAlign: 'center',
      color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--fm)',
    }}>
      <i className="ti ti-info-circle" style={{ fontSize: 20, display: 'block', marginBottom: 10, color: 'var(--border2)' }} />
      {message}
    </div>
  )
}
