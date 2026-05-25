import React, { useState, useRef, useEffect } from 'react'
import { callClaude } from '../api'
import { buildEvidenceRefinementPrompt } from '../v4prompts'

const POSTURE_COLOR = {
  'double down':          'var(--accent)',
  'selective investment': 'var(--a4)',
  'maintain':             '#fb923c',
  'deprioritize':         'var(--muted)',
  'divest/reallocate':    '#f87171',
}

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
  onApplyEvidenceRefinement,
  onMarkStrategyStale,
  onUpdateStrategyOptions,
  isStrategyMenuStale,
  isUpdatingStrategyOptions,
  apiKeySet,
  // Strategy menu + Stage 4 bridge
  onGenerateStrategyMenu,
  isGeneratingStrategyMenu,
  onGenerateStage4Artifact,
  onViewStage4,
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

      {/* 2 — Evidence Map (interactive) */}
      {stage3.evidenceMap?.length > 0 && (
        <Section
          title="Evidence map"
          icon="ti-map-2"
          count={stage3.evidenceMap.length}
          accentColor="var(--accent)"
        >
          <EvidenceMapInteractiveSection
            items={stage3.evidenceMap}
            session={session}
            stage3={stage3}
            onApplyRefinement={onApplyEvidenceRefinement}
            onMarkStrategyStale={onMarkStrategyStale}
            apiKeySet={apiKeySet}
          />
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

      {/* Strategy stale banner — shown when an applied refinement has substantial strategy impact */}
      {isStrategyMenuStale && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(248,113,113,.05)',
          border: '1px solid rgba(248,113,113,.3)',
          borderRadius: 'var(--r)',
          marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 13, color: '#f87171', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#f87171', fontFamily: 'var(--fm)', flex: 1 }}>
            An applied evidence refinement may materially affect strategic options — consider updating before proceeding to Stage 4.
          </span>
          <button
            onClick={onUpdateStrategyOptions}
            disabled={isUpdatingStrategyOptions}
            style={{
              fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
              padding: '4px 12px', borderRadius: 5,
              cursor: isUpdatingStrategyOptions ? 'wait' : 'pointer',
              background: '#f87171', color: '#fff', border: 'none',
              display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
              opacity: isUpdatingStrategyOptions ? .6 : 1,
            }}
          >
            <i className="ti ti-refresh" style={{ fontSize: 11 }} />
            {isUpdatingStrategyOptions ? 'Updating…' : 'Update Strategy Options'}
          </button>
        </div>
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

      {/* 5b — Outcome-Driven Strategy Menu */}
      <StrategyMenuBlock
        stage3={stage3}
        onGenerate={onGenerateStrategyMenu}
        isGenerating={isGeneratingStrategyMenu}
        onGenerateArtifact={onGenerateStage4Artifact}
        onViewStage4={onViewStage4}
        hasStage4={!!(session.stage4?.artifacts?.length)}
      />

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

// ── Evidence Map interactive refinement ────────────────────────────────────────

const DEMO_EVIDENCE_REFINEMENT = {
  explanation: 'This evidence item is grounded in structural market characteristics confirmed by Stage 1 and Stage 2 retrieval. The claim reflects an observable and persistent pattern in the segment — not a transient behavior that would be disrupted by short-term market changes.',
  refinedEvidenceText: null,
  refinementType: 'explain',
  confidenceImpact: 'none',
  strategyImpact: 'none',
  rationale: 'An explanation was requested. The original claim is well-grounded; no field revision needed.',
  suggestedEvidenceUpdate: {},
}

const PROMPT_PRESETS = [
  'Explain this evidence item and why it matters.',
  'Challenge this claim — what evidence would weaken it?',
  'Refine this evidence basis to be more precise.',
  'Focus on product implications of this evidence.',
  'Identify what conditions would make this evidence obsolete.',
]

function EvidenceMapInteractiveSection({ items, session, stage3, onApplyRefinement, onMarkStrategyStale, apiKeySet }) {
  const wrapperRef = useRef(null)
  const iconRef    = useRef(null)
  const flyoutRef  = useRef(null)
  const [selInfo, setSelInfo] = useState(null)
  const [flyout,  setFlyout]  = useState(null)

  // Dismiss on click outside flyout / icon
  useEffect(() => {
    if (!selInfo && !flyout) return
    function onDocMouseDown(e) {
      if (flyout?.submitting) return
      if (flyoutRef.current?.contains(e.target)) return
      if (iconRef.current?.contains(e.target)) return
      setSelInfo(null)
      setFlyout(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [selInfo, flyout])

  // Escape key dismisses
  useEffect(() => {
    if (!flyout) return
    function onKeyDown(e) {
      if (e.key === 'Escape' && !flyout.submitting) { setFlyout(null); setSelInfo(null) }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [flyout])

  function handleMouseUp() {
    if (flyout) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) { setSelInfo(null); return }
    const range = sel.getRangeAt(0)
    if (!wrapperRef.current?.contains(range.commonAncestorContainer)) { setSelInfo(null); return }
    let el = range.commonAncestorContainer
    if (el.nodeType === Node.TEXT_NODE) el = el.parentElement
    const itemEl = el?.closest('[data-evidence-idx]')
    if (!itemEl) { setSelInfo(null); return }
    const itemIndex = parseInt(itemEl.dataset.evidenceIdx, 10)
    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) { setSelInfo(null); return }
    setSelInfo({ itemIndex, text: sel.toString().trim(), rect })
  }

  function handleIconClick() {
    if (!selInfo) return
    setFlyout({
      itemIndex: selInfo.itemIndex,
      selectedText: selInfo.text,
      rect: selInfo.rect,
      prompt: PROMPT_PRESETS[0],
      submitting: false,
      response: null,
    })
    setSelInfo(null)
  }

  async function handleSubmit() {
    if (!flyout || flyout.submitting) return
    setFlyout(prev => ({ ...prev, submitting: true, response: null }))
    try {
      let response
      if (!apiKeySet) {
        await new Promise(r => setTimeout(r, 1200))
        response = DEMO_EVIDENCE_REFINEMENT
      } else {
        const item = items[flyout.itemIndex] || {}
        const prompt = buildEvidenceRefinementPrompt({
          thesis: stage3.thesis?.text,
          evidenceItem: item,
          selectedText: flyout.selectedText,
          userPrompt: flyout.prompt,
          stage1Nodes: session?.stage1?.nodes || [],
          stage2Evidence: session?.stage2?.evidenceConsolidation || [],
        })
        const raw = await callClaude(prompt, 1200)
        response = JSON.parse(raw)
      }
      setFlyout(prev => ({ ...prev, submitting: false, response }))
    } catch (e) {
      setFlyout(prev => ({ ...prev, submitting: false, response: { error: e.message } }))
    }
  }

  function buildLogEntry(applied, appliedUpdate) {
    const resp = flyout.response
    const item = items[flyout.itemIndex] || {}
    return {
      id: 'ref_' + Date.now(),
      timestamp: Date.now(),
      selectedText: flyout.selectedText,
      userPrompt: flyout.prompt,
      response: resp.explanation || '',
      refinementType: resp.refinementType || 'explain',
      confidenceImpact: resp.confidenceImpact || 'none',
      strategyImpact: resp.strategyImpact || 'none',
      applied,
      appliedAt: applied ? Date.now() : undefined,
      originalSnapshot: {
        observation: item.observation,
        evidenceBasis: item.evidenceBasis,
        implication: item.implication,
        strength: item.strength,
      },
      appliedUpdate: appliedUpdate || null,
    }
  }

  function handleApply() {
    if (!flyout?.response || flyout.response.error) return
    const resp = flyout.response
    const update = Object.keys(resp.suggestedEvidenceUpdate || {}).length > 0
      ? resp.suggestedEvidenceUpdate : null
    onApplyRefinement(flyout.itemIndex, buildLogEntry(true, update))
    if (resp.strategyImpact === 'substantial') onMarkStrategyStale()
    setFlyout(null)
    setSelInfo(null)
  }

  function handleLogOnly() {
    if (!flyout?.response || flyout.response.error) return
    onApplyRefinement(flyout.itemIndex, buildLogEntry(false, null))
    setFlyout(null)
    setSelInfo(null)
  }

  // Position the "?" icon above the selection midpoint
  const iconLeft = selInfo
    ? Math.max(5, Math.min(
        selInfo.rect.left + selInfo.rect.width / 2 - 10,
        window.innerWidth - 30
      ))
    : 0
  const iconTop = selInfo
    ? (selInfo.rect.top > 32 ? selInfo.rect.top - 28 : selInfo.rect.bottom + 6)
    : 0

  // Position the flyout above (or below) the selection
  const FW = 364
  const flyoutLeft = flyout
    ? Math.max(10, Math.min(
        flyout.rect.left + flyout.rect.width / 2 - FW / 2,
        window.innerWidth - FW - 10
      ))
    : 0
  const flyoutTop = flyout
    ? (flyout.rect.top > 330
        ? flyout.rect.top - 330
        : flyout.rect.bottom + 8)
    : 0

  const impactColor = lvl =>
    lvl === 'substantial' ? '#f87171' : lvl === 'minor' ? '#fb923c' : 'var(--muted)'

  return (
    <>
      <div ref={wrapperRef} onMouseUp={handleMouseUp}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(items || []).map((item, i) => (
            <EvidenceItemCard key={i} item={item} index={i} />
          ))}
        </div>
      </div>

      {/* Selection icon — fixed, appears above selected phrase */}
      {selInfo && (
        <button
          ref={iconRef}
          onMouseDown={e => e.preventDefault()}
          onClick={handleIconClick}
          title="Refine this evidence"
          style={{
            position: 'fixed', left: iconLeft, top: iconTop, zIndex: 1002,
            width: 22, height: 22, borderRadius: 11,
            background: 'var(--accent)', color: '#000',
            border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, fontFamily: 'var(--fm)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,229,180,.45)',
          }}
        >?</button>
      )}

      {/* Flyout */}
      {flyout && (
        <div
          ref={flyoutRef}
          style={{
            position: 'fixed', left: flyoutLeft, top: Math.max(10, flyoutTop),
            width: FW, zIndex: 1001,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,.28)',
          }}
        >
          {/* Selected text preview */}
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
            Selected text
          </div>
          <div style={{
            fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6,
            padding: '5px 8px', borderRadius: 4,
            background: 'var(--s2)', border: '1px solid var(--border)',
            marginBottom: 10, fontStyle: 'italic',
            maxHeight: 54, overflow: 'hidden',
          }}>
            "{flyout.selectedText.length > 180
              ? flyout.selectedText.slice(0, 180) + '…'
              : flyout.selectedText}"
          </div>

          {/* Prompt phase */}
          {!flyout.response && (
            <>
              {/* Preset chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {PROMPT_PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setFlyout(prev => ({ ...prev, prompt: p }))}
                    style={{
                      fontSize: 9, fontFamily: 'var(--fm)',
                      padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
                      background: flyout.prompt === p ? 'rgba(0,229,180,.12)' : 'var(--s2)',
                      border: flyout.prompt === p ? '1px solid rgba(0,229,180,.4)' : '1px solid var(--border)',
                      color: flyout.prompt === p ? 'var(--accent)' : 'var(--muted)',
                    }}
                  >
                    {p.split(' ').slice(0, 3).join(' ')}…
                  </button>
                ))}
              </div>
              {/* Custom prompt textarea */}
              <textarea
                value={flyout.prompt}
                onChange={e => setFlyout(prev => ({ ...prev, prompt: e.target.value }))}
                disabled={flyout.submitting}
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  fontSize: 11, fontFamily: 'inherit', color: 'var(--text)',
                  background: 'var(--s2)', border: '1px solid var(--border)',
                  borderRadius: 5, padding: '6px 8px', resize: 'vertical',
                  outline: 'none', lineHeight: 1.6, marginBottom: 8,
                }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setFlyout(null); setSelInfo(null) }}
                  style={{
                    fontSize: 10, fontFamily: 'var(--fm)', padding: '4px 10px',
                    background: 'var(--s2)', border: '1px solid var(--border)',
                    borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
                  }}
                >Cancel</button>
                <button
                  onClick={handleSubmit}
                  disabled={flyout.submitting || !flyout.prompt.trim()}
                  style={{
                    fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
                    padding: '4px 12px', borderRadius: 5,
                    cursor: flyout.submitting ? 'wait' : 'pointer',
                    background: 'var(--accent)', color: '#000', border: 'none',
                    opacity: (flyout.submitting || !flyout.prompt.trim()) ? .5 : 1,
                  }}
                >
                  {flyout.submitting ? 'Analyzing…' : 'Submit'}
                </button>
              </div>
            </>
          )}

          {/* Response phase */}
          {flyout.response && !flyout.response.error && (
            <div>
              {/* Impact badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                  color: 'var(--a4)', background: 'rgba(90,80,220,.08)', border: '1px solid rgba(90,80,220,.2)',
                }}>
                  {flyout.response.refinementType}
                </span>
                {flyout.response.strategyImpact !== 'none' && (
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                    color: impactColor(flyout.response.strategyImpact),
                    background: `${impactColor(flyout.response.strategyImpact)}18`,
                    border: `1px solid ${impactColor(flyout.response.strategyImpact)}35`,
                  }}>
                    strategy: {flyout.response.strategyImpact}
                  </span>
                )}
                {flyout.response.confidenceImpact !== 'none' && (
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
                    color: 'var(--muted)', background: 'var(--s2)', border: '1px solid var(--border)',
                  }}>
                    confidence Δ: {flyout.response.confidenceImpact}
                  </span>
                )}
              </div>
              {/* Explanation */}
              <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.7, marginBottom: 8 }}>
                {flyout.response.explanation}
              </div>
              {/* Suggested field updates */}
              {Object.keys(flyout.response.suggestedEvidenceUpdate || {}).length > 0 && (
                <div style={{
                  background: 'rgba(0,229,180,.04)', border: '1px solid rgba(0,229,180,.2)',
                  borderRadius: 5, padding: '7px 9px', marginBottom: 8,
                }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    Suggested field updates
                  </div>
                  {Object.entries(flyout.response.suggestedEvidenceUpdate).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--fm)', color: 'var(--muted)' }}>{k}: </span>{v}
                    </div>
                  ))}
                </div>
              )}
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setFlyout(null); setSelInfo(null) }}
                  style={{
                    fontSize: 10, fontFamily: 'var(--fm)', padding: '4px 10px',
                    background: 'var(--s2)', border: '1px solid var(--border)',
                    borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
                  }}
                >Close</button>
                <button
                  onClick={handleLogOnly}
                  style={{
                    fontSize: 10, fontFamily: 'var(--fm)', padding: '4px 10px',
                    background: 'var(--s2)', border: '1px solid var(--border)',
                    borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
                  }}
                >Log only</button>
                <button
                  onClick={handleApply}
                  style={{
                    fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                    background: 'var(--accent)', color: '#000', border: 'none',
                  }}
                >Apply</button>
              </div>
            </div>
          )}

          {/* Error state */}
          {flyout.response?.error && (
            <div>
              <div style={{ fontSize: 10, color: '#f87171', lineHeight: 1.6, marginBottom: 8 }}>
                Error: {flyout.response.error}
              </div>
              <button
                onClick={() => { setFlyout(null); setSelInfo(null) }}
                style={{
                  fontSize: 10, fontFamily: 'var(--fm)', padding: '4px 10px',
                  background: 'var(--s2)', border: '1px solid var(--border)',
                  borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
                }}
              >Close</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Evidence item card with refinement log ─────────────────────────────────────

function EvidenceItemCard({ item, index }) {
  const [logOpen, setLogOpen] = useState(false)
  const log      = item.refinementLog || []
  const logCount = log.length

  return (
    <div
      data-evidence-idx={index}
      style={{
        padding: 10, borderRadius: 6,
        background: item._refined ? 'rgba(0,229,180,.04)' : 'var(--s2)',
        border:     item._refined ? '1px solid rgba(0,229,180,.25)' : '1px solid var(--border)',
      }}
    >
      {/* Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
        {item.scope && <ScopeBadge scope={item.scope} />}
        {item.strength && <StrengthBadge strength={item.strength} />}
        {item.lineageRef && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
            color: 'var(--a2)', background: 'rgba(124,108,250,.1)', border: '1px solid rgba(124,108,250,.2)',
          }}>{item.lineageRef}</span>
        )}
        {item._refined && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 6px', borderRadius: 3,
            color: 'var(--accent)', background: 'rgba(0,229,180,.1)', border: '1px solid rgba(0,229,180,.3)',
          }}>user-refined</span>
        )}
      </div>

      {/* Observation */}
      <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.65, marginBottom: 6 }}>
        {item.observation}
      </div>

      {/* Evidence basis */}
      {item.evidenceBasis && (
        <div style={{ marginBottom: 5 }}>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Evidence basis
          </span>
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>{item.evidenceBasis}</div>
        </div>
      )}

      {/* Implication */}
      {item.implication && (
        <div>
          <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Implication
          </span>
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>{item.implication}</div>
        </div>
      )}

      {/* Refinement log */}
      {logCount > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
          <button
            onClick={() => setLogOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: 4, padding: 0,
            }}
          >
            <i className={`ti ti-chevron-${logOpen ? 'up' : 'down'}`} style={{ fontSize: 9 }} />
            {logCount} refinement{logCount !== 1 ? 's' : ''}
          </button>
          {logOpen && <RefinementLogList entries={log} />}
        </div>
      )}
    </div>
  )
}

// ── Outcome-Driven Strategy Menu ──────────────────────────────────────────────

function StrategyMenuBlock({ stage3, onGenerate, isGenerating, onGenerateArtifact, onViewStage4, hasStage4 }) {
  const [tunerState, setTunerState] = useState(null) // null | { strategyOption }
  const menu = stage3.strategyMenu || []
  const hasMenu = menu.length > 0

  function handleOpenTuner(opt) {
    setTunerState({ strategyOption: opt })
  }

  function handleTunerSubmit(persona) {
    if (!tunerState) return
    onGenerateArtifact({ strategyOption: tunerState.strategyOption, persona })
    setTunerState(null)
  }

  return (
    <>
      <Section
        title="Outcome-Driven Strategy Menu"
        icon="ti-layout-list"
        count={hasMenu ? menu.length : undefined}
        accentColor="var(--a3)"
      >
        {/* Generate button — shown when no menu exists or for regeneration */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: hasMenu ? 12 : 0, flexWrap: 'wrap' }}>
          {!hasMenu && (
            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)', flex: 1 }}>
              Generate 10 outcome-driven strategy options with execution plans grounded in the evidence above.
            </div>
          )}
          {hasMenu && (
            <div style={{ flex: 1 }} />
          )}
          {hasStage4 && (
            <button
              onClick={onViewStage4}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '4px 10px',
                background: 'rgba(0,229,180,.08)', border: '1px solid rgba(0,229,180,.3)',
                borderRadius: 5, cursor: 'pointer', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <i className="ti ti-file-text" style={{ fontSize: 10 }} /> View Stage 4 artifacts
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            style={{
              fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600,
              padding: '4px 12px', borderRadius: 5,
              cursor: isGenerating ? 'wait' : 'pointer',
              background: isGenerating ? 'var(--s2)' : 'rgba(156,110,255,.12)',
              border: '1px solid rgba(156,110,255,.3)',
              color: isGenerating ? 'var(--muted)' : 'var(--a3)',
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: isGenerating ? .6 : 1,
            }}
          >
            <i className={`ti ${isGenerating ? 'ti-loader-2' : (hasMenu ? 'ti-refresh' : 'ti-sparkles')}`} style={{ fontSize: 10 }} />
            {isGenerating ? 'Generating…' : (hasMenu ? 'Regenerate' : 'Generate strategy menu')}
          </button>
        </div>

        {isGenerating && !hasMenu && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--fm)' }}>
            <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 200, margin: '0 auto 10px' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--a2),var(--a3))', borderRadius: 1, width: '55%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
            Building 10 strategy options with execution plans…
          </div>
        )}

        {hasMenu && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {menu.map((opt, i) => (
              <StrategyMenuCard
                key={opt.id || i}
                option={opt}
                index={i}
                onGenerateArtifact={() => handleOpenTuner(opt)}
              />
            ))}
          </div>
        )}
      </Section>

      {tunerState && (
        <PersonaTunerModal
          strategyOption={tunerState.strategyOption}
          onSubmit={handleTunerSubmit}
          onCancel={() => setTunerState(null)}
        />
      )}
    </>
  )
}

function StrategyMenuCard({ option, index, onGenerateArtifact }) {
  const [open, setOpen] = useState(false)
  const posColor = POSTURE_COLOR[option.investmentPosture] || 'var(--muted)'

  return (
    <div style={{
      borderRadius: 7, background: 'var(--s2)', border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 700,
          color: 'var(--muted)', minWidth: 18,
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1, color: 'var(--text)' }}>
          {option.strategyName}
        </span>
        <span style={{
          fontSize: 8, fontFamily: 'var(--fm)', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.06em', padding: '2px 7px', borderRadius: 3,
          color: posColor, background: `${posColor}14`, border: `1px solid ${posColor}30`,
          flexShrink: 0,
        }}>
          {option.investmentPosture}
        </span>
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }} />
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)' }}>
          {/* Outcome served */}
          <div style={{ marginTop: 10, marginBottom: 8 }}>
            <span style={{
              fontSize: 9, fontFamily: 'var(--fm)', color: posColor,
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              Outcome served
            </span>
            <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>
              {option.outcomeServed}
            </div>
          </div>

          {/* What this means */}
          {option.whatThisMeans && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                What this means
              </span>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>
                {option.whatThisMeans}
              </div>
            </div>
          )}

          {/* Evidence grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            {option.evidenceSupporting && (
              <div style={{
                padding: '7px 9px', borderRadius: 5,
                background: 'rgba(0,229,180,.04)', border: '1px solid rgba(0,229,180,.15)',
              }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                  Supporting
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6 }}>
                  {option.evidenceSupporting}
                </div>
              </div>
            )}
            {option.evidenceAgainst && (
              <div style={{
                padding: '7px 9px', borderRadius: 5,
                background: 'rgba(248,113,113,.03)', border: '1px solid rgba(248,113,113,.15)',
              }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#f87171', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                  Against
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6 }}>
                  {option.evidenceAgainst}
                </div>
              </div>
            )}
          </div>

          {/* Conditions / Tradeoffs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            {option.conditionsForChoosing && (
              <div>
                <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                  Conditions for choosing
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6 }}>{option.conditionsForChoosing}</div>
              </div>
            )}
            {option.tradeoffs && (
              <div>
                <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
                  Tradeoffs
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted2)', lineHeight: 1.6 }}>{option.tradeoffs}</div>
              </div>
            )}
          </div>

          {/* Next validation step */}
          {option.nextValidationStep && (
            <div style={{
              marginBottom: 8, padding: '6px 9px', borderRadius: 5,
              background: 'rgba(90,80,220,.05)', border: '1px solid rgba(90,80,220,.15)',
            }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
                Next validation step
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>{option.nextValidationStep}</div>
            </div>
          )}

          {/* Execution plan */}
          {option.executionPlan && (
            <ExecutionPlanSection plan={option.executionPlan} />
          )}

          {/* Generate artifact CTA */}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={e => { e.stopPropagation(); onGenerateArtifact() }}
              style={{
                fontSize: 9, fontFamily: 'var(--fm)', fontWeight: 600,
                padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
                background: 'var(--accent)', color: '#000', border: 'none',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <i className="ti ti-file-text" style={{ fontSize: 10 }} />
              Generate Stage 4 artifact
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ExecutionPlanSection({ plan }) {
  const [open, setOpen] = useState(false)
  const rows = [
    { key: 'projectManagementPlan', label: 'Project management',  color: 'var(--a4)'   },
    { key: 'engineeringPlan',       label: 'Engineering',          color: 'var(--a2)'   },
    { key: 'impactAnalysisPlan',    label: 'Impact analysis',      color: 'var(--accent)'},
    { key: 'optionalAdditionalExecutionNotes', label: 'Additional notes', color: '#fb923c' },
  ].filter(r => plan[r.key])

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)',
          display: 'flex', alignItems: 'center', gap: 4, padding: 0, marginBottom: open ? 8 : 0,
        }}
      >
        <i className={`ti ti-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: 9 }} />
        Execution plan ({rows.length} sections)
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => (
            <div key={r.key} style={{
              padding: '7px 9px', borderRadius: 5,
              background: 'var(--s2)', border: `1px solid ${r.color}20`,
            }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: r.color, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                {r.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{plan[r.key]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Persona Tuner Modal ────────────────────────────────────────────────────────

const PROVIDER_ROLES = [
  'Chief Product Officer', 'VP Product', 'Head of Engineering',
  'Product Manager', 'VP Customer Success', 'CFO / Finance', 'CEO / Exec Sponsor',
]
const CUSTOMER_ROLES = [
  'CHRO', 'VP HR Operations', 'HR Director',
  'IT Director', 'Finance / CFO', 'Procurement Lead', 'Operations Leader',
]
const TONE_OPTIONS = [
  'data-driven', 'risk-aware', 'exec-ready', 'operational detail', 'strategic framing', 'concise',
]

function PersonaTunerModal({ strategyOption, onSubmit, onCancel }) {
  const [side, setSide]              = useState('provider')
  const [role, setRole]              = useState('')
  const [toneEmphasis, setTone]      = useState([])

  const roles = side === 'provider' ? PROVIDER_ROLES : CUSTOMER_ROLES

  function toggleTone(t) {
    setTone(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function handleSubmit() {
    onSubmit({ side, role: role || roles[0], toneEmphasis })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 20, width: 380, maxWidth: '92vw',
        boxShadow: '0 16px 48px rgba(0,0,0,.4)',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Persona tuner</div>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
            Artifact will be framed for the selected audience.
          </div>
          <div style={{
            marginTop: 8, padding: '5px 9px', borderRadius: 5,
            background: 'rgba(156,110,255,.07)', border: '1px solid rgba(156,110,255,.2)',
            fontSize: 10, color: 'var(--a3)',
          }}>
            {strategyOption.strategyName}
          </div>
        </div>

        {/* Side selector */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            Audience perspective
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { value: 'provider', label: 'Provider-side', hint: 'Vendor / operator' },
              { value: 'customer', label: 'Customer-side', hint: 'Buyer / user' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => { setSide(opt.value); setRole('') }}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  background: side === opt.value ? 'rgba(0,229,180,.08)' : 'var(--s2)',
                  border: side === opt.value ? '1px solid rgba(0,229,180,.4)' : '1px solid var(--border)',
                  color: side === opt.value ? 'var(--accent)' : 'var(--muted)',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 1 }}>{opt.label}</div>
                <div style={{ fontSize: 9, fontFamily: 'var(--fm)', opacity: .7 }}>{opt.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Role selector */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            Recipient role
          </div>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 11,
              background: 'var(--s2)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">— Select role —</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Tone emphasis */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            Tone emphasis <span style={{ color: 'var(--muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional, multi-select)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {TONE_OPTIONS.map(t => (
              <button
                key={t}
                onClick={() => toggleTone(t)}
                style={{
                  fontSize: 9, fontFamily: 'var(--fm)', padding: '3px 9px', borderRadius: 4, cursor: 'pointer',
                  background: toneEmphasis.includes(t) ? 'rgba(0,229,180,.1)' : 'var(--s2)',
                  border: toneEmphasis.includes(t) ? '1px solid rgba(0,229,180,.4)' : '1px solid var(--border)',
                  color: toneEmphasis.includes(t) ? 'var(--accent)' : 'var(--muted)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              fontSize: 10, fontFamily: 'var(--fm)', padding: '5px 12px',
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 5, cursor: 'pointer', color: 'var(--muted)',
            }}
          >Cancel</button>
          <button
            onClick={handleSubmit}
            style={{
              fontSize: 10, fontFamily: 'var(--fm)', fontWeight: 600,
              padding: '5px 14px', borderRadius: 5, cursor: 'pointer',
              background: 'var(--accent)', color: '#000', border: 'none',
            }}
          >
            Generate artifact
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Refinement log list (per evidence item) ────────────────────────────────────

function RefinementLogList({ entries }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {entries.map((entry, i) => (
        <div key={entry.id || i} style={{
          padding: '8px 10px', borderRadius: 5,
          background: entry.applied ? 'rgba(0,229,180,.04)' : 'var(--s2)',
          border:     entry.applied ? '1px solid rgba(0,229,180,.2)' : '1px solid var(--border)',
        }}>
          {/* Row: status badge + type + strategy impact + timestamp */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3,
              color:       entry.applied ? 'var(--accent)' : 'var(--muted)',
              background:  entry.applied ? 'rgba(0,229,180,.1)' : 'var(--s2)',
              border:      entry.applied ? '1px solid rgba(0,229,180,.3)' : '1px solid var(--border)',
            }}>{entry.applied ? 'applied' : 'logged only'}</span>
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>{entry.refinementType}</span>
            {entry.strategyImpact && entry.strategyImpact !== 'none' && (
              <span style={{
                fontSize: 9, fontFamily: 'var(--fm)', padding: '1px 5px', borderRadius: 3,
                color: entry.strategyImpact === 'substantial' ? '#f87171' : '#fb923c',
                background: entry.strategyImpact === 'substantial' ? 'rgba(248,113,113,.08)' : 'rgba(251,146,60,.08)',
                border: entry.strategyImpact === 'substantial' ? '1px solid rgba(248,113,113,.3)' : '1px solid rgba(251,146,60,.3)',
              }}>strategy: {entry.strategyImpact}</span>
            )}
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginLeft: 'auto' }}>
              {new Date(entry.timestamp).toLocaleString()}
            </span>
          </div>
          {/* Selected text preview */}
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 3, fontStyle: 'italic' }}>
            "{(entry.selectedText || '').length > 70
              ? entry.selectedText.slice(0, 70) + '…'
              : entry.selectedText}"
          </div>
          {/* Response summary */}
          <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.6 }}>
            {entry.response}
          </div>
        </div>
      ))}
    </div>
  )
}
