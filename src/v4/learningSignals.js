// DomainIQ v4 — Learning-signal staleness helpers
// Pure utilities — no React, no side effects, no API calls.
//
// Responsibilities:
//   • Per-stage fingerprints (djb2 hash of the data that matters for Stage 5)
//   • captureSourceLearningSnapshot — snapshot fingerprints at Stage 5 generation
//   • checkStage5Freshness — compare stored vs current fingerprints
//   • Deterministic signal generators for stages 1-3 (no API needed)
//   • buildStage5ReconcilePrompt — targeted update prompt (not full regen)
//   • MOCK_STAGE5_UPDATE — demo-mode fallback for handleUpdateStage5FromLatest

// ── djb2 hash — identical algorithm to v4utils.computeStage1BasisHash ─────────
function simpleHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0
  }
  return String(h >>> 0)
}

// ── Stage fingerprint — Stage 1 ───────────────────────────────────────────────
// Covers entity framing + accepted/rejected node topology.
// Changes to node statements, userStatus, or confidence all affect this hash.
export function computeStage1LearningFingerprint(session) {
  const entity  = session.entity || {}
  const nodes   = (session.stage1?.nodes || [])
    .map(n => `${n.id}:${n.statement || ''}:${n.userStatus || ''}:${n.confidence || ''}`)
    .sort()
    .join('|')
  const intent  = session.intent || {}
  const history = (session.stage1?.refinementHistory || []).length
  const str     = [
    entity.name  || '',
    entity.type  || '',
    intent.outcome || '',
    nodes,
    String(history),
  ].join('||')
  return simpleHash(str)
}

// ── Stage fingerprint — Stage 2 ───────────────────────────────────────────────
// Covers: stage2 id, accepted/rejected assertion statuses, completed pivot decisions.
export function computeStage2LearningFingerprint(session) {
  const s2 = session.stage2
  if (!s2) return simpleHash('')
  const assertions = (s2.refinedAssertions || [])
    .map(a => `${a.nodeId}:${a.userStatus || ''}`)
    .sort()
    .join('|')
  const pivots = (s2.pivots || [])
    .filter(p => p.status === 'complete')
    .map(p => `${p.type}:${p.decidedUpdateId || ''}`)
    .sort()
    .join('|')
  const str = [s2.id || '', assertions, pivots].join('||')
  return simpleHash(str)
}

// ── Stage fingerprint — Stage 3 ───────────────────────────────────────────────
// Covers: stage3 id, thesis, evidence map entries, cluster titles, option ids, menu ids.
export function computeStage3LearningFingerprint(session) {
  const s3 = session.stage3
  if (!s3) return simpleHash('')
  const thesis   = (s3.thesis?.text || s3.thesis || '').slice(0, 200)
  const evidence = (s3.evidenceMap || [])
    .map(e => `${e.observation || ''}:${e.strength || ''}`)
    .sort()
    .join('|')
  const clusters = (s3.insightClusters || [])
    .map(c => c.title || c.clusterTitle || '')
    .sort()
    .join('|')
  const options  = (s3.strategicOptions || [])
    .map(o => o.id || o.strategyName || '')
    .sort()
    .join('|')
  const menu     = (s3.strategyMenu || [])
    .map(m => m.id || m.title || '')
    .sort()
    .join('|')
  const str = [s3.id || '', thesis, evidence, clusters, options, menu].join('||')
  return simpleHash(str)
}

// ── Stage fingerprint — Stage 4 ───────────────────────────────────────────────
// Covers: non-deleted artifact topology (id, versions length, active version, posture),
// learning signal ids, and signalsMeta.status.
export function computeStage4LearningFingerprint(session) {
  const s4 = session.stage4
  if (!s4) return simpleHash('')
  const artifacts = (s4.artifacts || [])
    .filter(a => a.status !== 'deleted')
    .map(a => `${a.id}:${(a.versions || []).length}:${a.activeVersionId || ''}:${a.strategyPosture || ''}`)
    .sort()
    .join('|')
  const signals   = (s4.learningSignals || [])
    .map(s => s.signalId || '')
    .sort()
    .join('|')
  const metaStatus = s4.signalsMeta?.status || ''
  const str = [artifacts, signals, metaStatus].join('||')
  return simpleHash(str)
}

// ── All fingerprints ──────────────────────────────────────────────────────────
export function computeAllStageFingerprints(session) {
  return {
    stage1: computeStage1LearningFingerprint(session),
    stage2: computeStage2LearningFingerprint(session),
    stage3: computeStage3LearningFingerprint(session),
    stage4: computeStage4LearningFingerprint(session),
  }
}

// ── Snapshot capture — called just before persisting Stage 5 ─────────────────
// Returns an object written to session.stage5.sourceLearningSnapshot.
export function captureSourceLearningSnapshot(session) {
  return {
    capturedAt:   Date.now(),
    fingerprints: computeAllStageFingerprints(session),
  }
}

// ── Freshness check ───────────────────────────────────────────────────────────
// Conservative: if stage5 has no sourceLearningSnapshot (old session or first gen)
// we return isStale:false — no false alarms.
//
// staleSince is preserved from the existing stage5.freshness value so we don't
// reset it each time this is called.
export function checkStage5Freshness(session) {
  const stage5    = session.stage5
  const snapshot  = stage5?.sourceLearningSnapshot
  if (!snapshot?.fingerprints) {
    return { isStale: false, staleStages: [], staleReason: null, staleSince: null, staleDetails: {} }
  }

  const current = computeAllStageFingerprints(session)
  const stored  = snapshot.fingerprints
  const staleStages = []
  const staleDetails = {}

  const stageKeys = ['stage1', 'stage2', 'stage3', 'stage4']
  for (const key of stageKeys) {
    // Only flag a stage if that stage actually exists in the session
    const stageData = key === 'stage4' ? session.stage4 : session[key]
    if (!stageData) continue
    if (current[key] !== stored[key]) {
      staleStages.push(key)
      staleDetails[key] = { current: current[key], stored: stored[key] }
    }
  }

  if (staleStages.length === 0) {
    return { isStale: false, staleStages: [], staleReason: null, staleSince: null, staleDetails: {} }
  }

  // Preserve existing staleSince timestamp — don't overwrite it each render.
  const existingStaleSince = stage5?.freshness?.staleSince
  const staleSince = existingStaleSince || Date.now()

  const stageLabels = { stage1: 'Stage 1', stage2: 'Stage 2', stage3: 'Stage 3', stage4: 'Stage 4' }
  const labelList   = staleStages.map(s => stageLabels[s] || s).join(', ')
  const staleReason = `${labelList} ${staleStages.length === 1 ? 'has' : 'have'} changed since Stage 5 was generated.`

  return { isStale: true, staleStages, staleReason, staleSince, staleDetails }
}

// ── Deterministic signal generators — no API ──────────────────────────────────
// These produce 2-3 signals each from session data alone.
// Used by handleUpdateStage5FromLatest to represent the current state of each stale stage.

export function generateStage1LearningSignals(session, now) {
  const s1      = session.stage1
  const signals = []
  if (!s1) return signals

  const nodes    = s1.nodes || []
  const accepted = nodes.filter(n => n.userStatus === 'accepted')
  const rejected = nodes.filter(n => n.userStatus === 'rejected')
  const high     = accepted.filter(n => n.confidence === 'high')

  signals.push({
    signalId:             `s1upd_${now}_001`,
    title:                'Stage 1 orientation baseline updated',
    description:          `${accepted.length} node${accepted.length !== 1 ? 's' : ''} accepted, ${rejected.length} rejected. ${high.length > 0 ? `${high.length} high-confidence node${high.length !== 1 ? 's' : ''} provide a strong foundation.` : 'No high-confidence nodes yet — synthesis may be broad.'}`,
    signalType:           'framing_signal',
    sourceStage:          'stage1',
    confidence:           accepted.length >= 3 ? 'medium' : 'low',
    transferability:      'session-only',
    applicableScopes:     ['company_analysis'],
    evidenceBasis:        `${accepted.length} accepted nodes from Stage 1 orientation`,
    applyForwardGuidance: 'Review accepted/rejected balance before advancing to Stage 2.',
    counterSignals:       [],
    createdAt:            now,
    updatedAt:            now,
    sourceParentStrategyId: null,
    sourceRefinementIds:    [],
  })

  if (accepted.length > 0) {
    const sampleNode = accepted[0]
    signals.push({
      signalId:             `s1upd_${now}_002`,
      title:                'Entity framing shapes downstream artifact scope',
      description:          `"${session.entity?.name}" (${session.entity?.type || 'company'}) orientation accepted. The framing in Stage 1 determines what evidence Stage 2 retrieves and what strategies Stage 3 surfaces.`,
      signalType:           'framing_signal',
      sourceStage:          'stage1',
      confidence:           'medium',
      transferability:      'general',
      applicableScopes:     ['all'],
      evidenceBasis:        `${sampleNode.statement ? (sampleNode.statement).slice(0, 80) : 'Stage 1 node'} — accepted`,
      applyForwardGuidance: 'Verify entity type and outcome intent are accurate before Stage 2.',
      counterSignals:       [],
      createdAt:            now,
      updatedAt:            now,
      sourceParentStrategyId: null,
      sourceRefinementIds:    [],
    })
  }

  return signals
}

export function generateStage2LearningSignals(session, now) {
  const s2      = session.stage2
  const signals = []
  if (!s2) return signals

  const assertions = s2.refinedAssertions || []
  const accepted   = assertions.filter(a => a.userStatus === 'accepted')
  const pivots     = (s2.pivots || []).filter(p => p.status === 'complete')

  signals.push({
    signalId:             `s2upd_${now}_001`,
    title:                'Stage 2 evidence coverage updated',
    description:          `${accepted.length} of ${assertions.length} refinements accepted. ${pivots.length > 0 ? `${pivots.length} completed pivot${pivots.length !== 1 ? 's' : ''} adjusted the evidence base.` : 'No pivots completed.'}`,
    signalType:           'evidence_signal',
    sourceStage:          'stage2',
    confidence:           accepted.length >= assertions.length * 0.6 ? 'medium' : 'low',
    transferability:      'session-only',
    applicableScopes:     ['company_analysis', 'industry_analysis'],
    evidenceBasis:        `${accepted.length}/${assertions.length} Stage 2 refinements accepted`,
    applyForwardGuidance: 'Low acceptance rate in Stage 2 suggests thin evidence — consider a pivot before Stage 3.',
    counterSignals:       [],
    createdAt:            now,
    updatedAt:            now,
    sourceParentStrategyId: null,
    sourceRefinementIds:    [],
  })

  if (pivots.length > 0) {
    const pivotTypes = [...new Set(pivots.map(p => p.type))]
    signals.push({
      signalId:             `s2upd_${now}_002`,
      title:                'Evidence pivots shifted synthesis basis',
      description:          `Pivot${pivots.length !== 1 ? 's' : ''} of type${pivotTypes.length !== 1 ? 's' : ''} ${pivotTypes.join(', ')} expanded the evidence set. Pivot-driven evidence tends to fill gaps left by initial retrieval.`,
      signalType:           'evidence_signal',
      sourceStage:          'stage2',
      confidence:           'medium',
      transferability:      'same-domain',
      applicableScopes:     ['company_analysis'],
      evidenceBasis:        `${pivots.length} completed Stage 2 pivot${pivots.length !== 1 ? 's' : ''}`,
      applyForwardGuidance: 'Log which pivot types successfully filled evidence gaps for future sessions.',
      counterSignals:       [],
      createdAt:            now,
      updatedAt:            now,
      sourceParentStrategyId: null,
      sourceRefinementIds:    [],
    })
  }

  return signals
}

export function generateStage3LearningSignals(session, now) {
  const s3      = session.stage3
  const signals = []
  if (!s3) return signals

  const options    = s3.strategicOptions   || []
  const menu       = s3.strategyMenu       || []
  const clusters   = s3.insightClusters    || []
  const evidenceMap = s3.evidenceMap       || []

  signals.push({
    signalId:             `s3upd_${now}_001`,
    title:                'Stage 3 synthesis structure updated',
    description:          `${clusters.length} insight cluster${clusters.length !== 1 ? 's' : ''}, ${options.length} strategic option${options.length !== 1 ? 's' : ''}, ${menu.length} strategy menu item${menu.length !== 1 ? 's' : ''}. ${evidenceMap.length > 0 ? `Evidence map has ${evidenceMap.length} item${evidenceMap.length !== 1 ? 's' : ''}.` : ''}`,
    signalType:           'synthesis_signal',
    sourceStage:          'stage3',
    confidence:           clusters.length >= 3 ? 'medium' : 'low',
    transferability:      'session-only',
    applicableScopes:     ['company_analysis', 'strategy_artifact_generation'],
    evidenceBasis:        `${options.length} strategic options from Stage 3 synthesis`,
    applyForwardGuidance: 'Verify posture diversity in the strategy menu before generating Stage 4 artifacts.',
    counterSignals:       [],
    createdAt:            now,
    updatedAt:            now,
    sourceParentStrategyId: null,
    sourceRefinementIds:    [],
  })

  const postureTypes = [...new Set(menu.map(m => m.investmentPosture || m.posture || '').filter(Boolean))]
  if (postureTypes.length >= 2) {
    signals.push({
      signalId:             `s3upd_${now}_002`,
      title:                'Strategy posture diversity present in menu',
      description:          `Menu includes ${postureTypes.length} distinct posture${postureTypes.length !== 1 ? 's' : ''}: ${postureTypes.slice(0, 4).join(', ')}. Posture diversity in the menu helps surface genuine strategic tradeoffs in Stage 4.`,
      signalType:           'synthesis_signal',
      sourceStage:          'stage3',
      confidence:           'medium',
      transferability:      'general',
      applicableScopes:     ['strategy_artifact_generation'],
      evidenceBasis:        `${menu.length} menu items with ${postureTypes.length} posture variants`,
      applyForwardGuidance: 'Preserve posture diversity when selecting which menu items to convert to Stage 4 artifacts.',
      counterSignals:       ['Forcing posture diversity can surface options that are not analytically justified.'],
      createdAt:            now,
      updatedAt:            now,
      sourceParentStrategyId: null,
      sourceRefinementIds:    [],
    })
  }

  return signals
}

// ── Stage 5 reconciliation prompt ─────────────────────────────────────────────
// Used when upstream stages changed — produces a targeted update, not a full regen.
// freshness.staleStages drives which sections are explicitly flagged for revision.
export function buildStage5ReconcilePrompt({ session, priorStage5, freshness }) {
  const entity     = session.entity
  const staleList  = freshness?.staleStages || []
  const staleLabels = { stage1: 'Stage 1 Orientation', stage2: 'Stage 2 Evidence', stage3: 'Stage 3 Synthesis', stage4: 'Stage 4 Artifacts' }
  const staleDesc  = staleList.length > 0
    ? staleList.map(s => staleLabels[s] || s).join(', ')
    : 'unknown stages'

  // Compact prior Stage 5 for reference
  const priorSignals   = (priorStage5?.learningSignals   || []).map(s => `${s.signalId}: ${s.title}`).join('\n')
  const priorPatterns  = (priorStage5?.reusablePatterns  || []).map(p => `${p.patternId}: ${p.patternTitle}`).join('\n')
  const priorTriggers  = (priorStage5?.refinementTriggers|| []).map(t => `${t.triggerId}: ${t.title}`).join('\n')

  // Compact current stage snapshots for changed stages only
  const stageSnippets = staleList.map(stageKey => {
    if (stageKey === 'stage1') {
      const s1   = session.stage1 || {}
      const acc  = (s1.nodes || []).filter(n => n.userStatus === 'accepted')
      return `STAGE 1 (changed): ${acc.length} accepted nodes. Entity: ${entity?.name} (${entity?.type}).`
    }
    if (stageKey === 'stage2') {
      const s2   = session.stage2 || {}
      const acc  = (s2.refinedAssertions || []).filter(a => a.userStatus === 'accepted')
      const piv  = (s2.pivots || []).filter(p => p.status === 'complete')
      return `STAGE 2 (changed): ${acc.length}/${(s2.refinedAssertions||[]).length} refinements accepted, ${piv.length} pivots complete.`
    }
    if (stageKey === 'stage3') {
      const s3     = session.stage3 || {}
      const thesis = (s3.thesis?.text || s3.thesis || '').slice(0, 200)
      const opts   = (s3.strategicOptions || []).length
      const menu   = (s3.strategyMenu     || []).length
      return `STAGE 3 (changed): ${opts} options, ${menu} menu items. Thesis (excerpt): "${thesis}"`
    }
    if (stageKey === 'stage4') {
      const s4  = session.stage4 || {}
      const art = (s4.artifacts || []).filter(a => a.status === 'complete')
      const sig = (s4.learningSignals || []).length
      const artSummary = art.slice(0, 5).map(a => `${a.sourceStrategyName || 'artifact'} (${a.strategyPosture || ''})`).join('; ')
      return `STAGE 4 (changed): ${art.length} completed artifacts${artSummary ? ` — ${artSummary}` : ''}. ${sig} learning signals.`
    }
    return ''
  }).filter(Boolean).join('\n\n')

  const now = Date.now()

  return `You are an expert analyst performing a TARGETED UPDATE of a Stage 5 learning synthesis for "${entity?.name}".

The following upstream stages have changed since Stage 5 was generated: ${staleDesc}.

Your task is NOT to regenerate Stage 5 from scratch. Instead:
1. Review the PRIOR Stage 5 content below.
2. Identify which existing signals, patterns, and triggers are still valid.
3. Add NEW signals/patterns/triggers that reflect the changed stages.
4. Mark any signals/patterns/triggers that are now contradicted or outdated with updated fields.
5. Preserve anything that is still accurate.

PRIOR STAGE 5:
Signals:
${priorSignals || 'None'}

Patterns:
${priorPatterns || 'None'}

Triggers:
${priorTriggers || 'None'}

UPDATED STAGE DATA:
${stageSnippets || 'No changed stage data available.'}

---

Output ONLY valid JSON (no markdown fences, no commentary):
{
  "changeSummary": "1-2 sentences describing what changed and why",
  "learningSignals": [...],
  "reusablePatterns": [...],
  "refinementTriggers": [...],
  "addedSignalIds": ["list of new signalIds added"],
  "updatedPatternIds": ["list of patternIds that were updated"],
  "retiredPatternIds": ["list of patternIds that are now retired or contradicted"],
  "retiredSignalIds": ["list of signalIds that are now retired"]
}

Use the same schemas as Stage 5 generation. Carry forward createdAt for existing items; set updatedAt to ${now} for modified items; set createdAt: ${now} for new items.`
}

// ── Mock for demo mode (no API key) ──────────────────────────────────────────
export const MOCK_STAGE5_UPDATE = {
  changeSummary: 'Upstream stage changes refined the evidence basis and added one new synthesis signal. Existing patterns remain valid; one refinement trigger updated to reflect new Stage 4 artifact posture.',
  learningSignals: [
    {
      signalId:             's5upd_001',
      title:                'Updated upstream evidence sharpens framing signals',
      description:          'Changes in upstream stages have strengthened the connection between initial framing constraints and downstream artifact specificity. The revised evidence base confirms that early constraint capture reduces Stage 4 iteration counts.',
      sourceStage:          'stage1',
      sourceArtifactId:     null,
      sourceVersionId:      null,
      signalType:           'framing_signal',
      confidence:           'medium',
      transferability:      'general',
      applicableScopes:     ['all'],
      provenance:           'Stage 1 orientation node changes detected',
      evidenceBasis:        'Upstream stage update — reconciled from changed stage data',
      counterSignals:       [],
      applyForwardGuidance: 'Verify entity framing accuracy before generating Stage 4 artifacts.',
      createdAt:            Date.now(),
      updatedAt:            Date.now(),
    },
    {
      signalId:             's5upd_002',
      title:                'Evidence gaps map to synthesis uncertainty zones',
      description:          'Sections with low Stage 2 acceptance rates consistently produced hedged Stage 3 thesis language. Updated Stage 2 evidence shows improved acceptance, which should tighten Stage 3 coverage in those areas.',
      sourceStage:          'stage2',
      sourceArtifactId:     null,
      sourceVersionId:      null,
      signalType:           'evidence_signal',
      confidence:           'medium',
      transferability:      'same-domain',
      applicableScopes:     ['company_analysis', 'industry_analysis'],
      provenance:           'Stage 2 refinement acceptance changes detected',
      evidenceBasis:        'Reconciled from updated Stage 2 evidence base',
      counterSignals:       [],
      applyForwardGuidance: 'Before Stage 3, verify that acceptance rate exceeds 60% in strategically important areas.',
      createdAt:            Date.now(),
      updatedAt:            Date.now(),
    },
  ],
  reusablePatterns: [
    {
      patternId:              'pat_upd_001',
      patternTitle:           'Constraint-first framing reduces Stage 4 iteration depth',
      patternType:            'framing_pattern',
      patternMaturity:        'seed',
      sourceStages:           ['stage1', 'stage4'],
      sourceSignalIds:        ['s5upd_001'],
      sourceArtifactIds:      [],
      sourceVersionIds:       [],
      reusableGuidance:       'When the analyst provides at least one operational constraint or named stakeholder in Stage 1, Stage 4 artifacts require fewer refinement iterations to reach decision-ready quality.',
      whenToApply:            'Any analysis where Stage 4 artifact quality is a primary success criterion.',
      whenNotToApply:         'Exploratory sessions where constraint identification is itself the goal.',
      confidenceLevel:        'low',
      transferability:        'general',
      applicableScopes:       ['strategy_artifact_generation'],
      evidenceBasis:          'Reconciled from upstream stage update',
      counterSignals:         ['Over-specification of constraints can narrow Stage 2 retrieval and miss material evidence.'],
      patternVsClaimBoundary: 'This is a process heuristic about how framing choices affect artifact quality — not a claim about the entity.',
      applyForwardGuidance:   'Prompt for at least one operational constraint in Stage 1 intent capture for all future strategy analyses.',
      createdAt:              Date.now(),
      updatedAt:              Date.now(),
    },
  ],
  refinementTriggers: [
    {
      triggerId:           'trig_upd_001',
      title:               'Upstream stage change detected after Stage 5 generation',
      description:         'Stage 5 was generated before the current upstream stage changes. Reconciliation has been applied, but a full Stage 5 regeneration may be warranted for high-stakes decisions.',
      appliesToStage:      'all',
      severity:            'medium',
      recommendedAction:   'Review the update summary and consider full Stage 5 regeneration if more than two upstream stages changed significantly.',
      sourceSignalIds:     [],
      confidence:          'medium',
      transferability:     'general',
      createdAt:           Date.now(),
    },
  ],
  addedSignalIds:     ['s5upd_001', 's5upd_002'],
  updatedPatternIds:  ['pat_upd_001'],
  retiredPatternIds:  [],
  retiredSignalIds:   [],
}
