// DomainIQ v4 — Stage 4 learning signal generation
// buildStage4SignalsPrompt: builds Claude prompt from completed artifacts
// MOCK_STAGE4_SIGNALS: demo-mode fallback (no API key required)

// ── Compact artifact context builder ─────────────────────────────────────────
function extractArtifactContext(artifacts) {
  return artifacts
    .filter(a => a.status === 'complete')
    .map(a => {
      const versions = a.versions?.length > 0 ? a.versions : []
      const latest   = versions.length > 0 ? versions[versions.length - 1].data : a.data
      return {
        id:               a.id,
        strategyName:     a.sourceStrategyName || '',
        investmentPosture: a.strategyPosture   || '',
        persona:          a.persona
          ? { side: a.persona.side, role: a.persona.role, toneEmphasis: a.persona.toneEmphasis || [] }
          : null,
        versionCount:     versions.length,
        refinements:      versions.filter(v => v.refinementContext).map(v => ({
          versionNumber: v.versionNumber,
          userContext:   v.refinementContext,
          changeSummary: v.changeSummary || null,
        })),
        sectionHeadings:        (latest?.sections || []).map(s => s.heading),
        keyDecisionCount:       (latest?.keyDecisions || []).length,
        hasCallToAction:        !!(latest?.callToAction),
        validationCheckpoints:  (latest?.validationCheckpoints || []).slice(0, 3),
        readinessWarnings:      (latest?.readinessWarnings || []).slice(0, 3),
      }
    })
}

// ── Deleted artifact context (for negative_learning_signal generation) ────────
function extractDeletedArtifactContext(deletedArtifactMetadata) {
  if (!Array.isArray(deletedArtifactMetadata) || deletedArtifactMetadata.length === 0) return []
  return deletedArtifactMetadata.map(d => ({
    id:           d.id,
    title:        d.title || 'Unknown strategy',
    persona:      d.persona || null,
    posture:      d.posture || null,
    versionCount: d.versionCount || 0,
    deletedAt:    d.deletedAt || null,
    deleteReason: d.deleteReason || null,
  }))
}

// ── Compact prompt builder ────────────────────────────────────────────────────
export function buildStage4SignalsPrompt({ session }) {
  const entity    = session.entity
  const artifacts = extractArtifactContext(session.stage4?.artifacts || [])
  if (artifacts.length === 0) return null

  const deleted     = extractDeletedArtifactContext(session.stage4?.deletedArtifactMetadata)
  const targetCount = Math.min(8, Math.max(4, artifacts.length + deleted.length + 2))

  const deletedSection = deleted.length > 0
    ? `\nDELETED ARTIFACTS (generate at least one negative_learning_signal per deleted artifact where meaningful):
${JSON.stringify(deleted, null, 2)}\n`
    : ''

  return `You are an expert strategy analyst extracting LEARNING SIGNALS from Stage 4 artifact generation output.

Entity analyzed: "${entity?.name}" (${entity?.type || 'company'})

Review the Stage 4 artifact metadata and extract ${targetCount} reusable learning signals. A signal captures HOW to build effective strategy artifacts — NOT domain facts about ${entity?.name}.

STAGE 4 ARTIFACTS:
${JSON.stringify(artifacts, null, 2)}
${deletedSection}

STRICT LENGTH LIMITS (required — violations cause the output to be discarded):
- title: ≤12 words
- description: ≤45 words
- evidenceBasis: ≤40 words
- applyForwardGuidance: ≤30 words, one sentence
- counterSignals: array of ≤2 items, each ≤25 words

SIGNAL TYPE OPTIONS:
artifact_structure_signal | audience_framing_signal | refinement_signal | version_evolution_signal | readiness_warning_signal | validation_checkpoint_signal | negative_learning_signal | decision_tag_signal | artifact_quality_signal | strategy_execution_signal

FIELD RULES:
- confidence: high | medium | low
- transferability: session-only | same-company | same-domain | same-industry | cross-domain | general
- applicableScopes: company_analysis | industry_analysis | domain_workflow_analysis | strategy_artifact_generation | all

Return ONLY valid JSON — no markdown fencing, no commentary:
{
  "learningSignals": [
    {
      "signalId": "s4sig_001",
      "title": "≤12 word title",
      "description": "≤45 words describing the lesson and why it matters",
      "signalType": "artifact_structure_signal",
      "sourceArtifactId": null,
      "sourceArtifactTitle": null,
      "sourceAudience": null,
      "sourceDecisionTag": null,
      "confidence": "high",
      "transferability": "general",
      "applicableScopes": ["strategy_artifact_generation"],
      "evidenceBasis": "≤40 words explaining what in the artifact metadata supports this signal",
      "counterSignals": [],
      "applyForwardGuidance": "≤30 word actionable sentence for future artifact generation"
    }
  ]
}`
}

// ── Demo-mode mock ────────────────────────────────────────────────────────────
export const MOCK_STAGE4_SIGNALS = {
  learningSignals: [
    {
      signalId: 's4sig_mock_001',
      title: 'Role-specific artifacts produce stronger key decisions',
      description: 'Artifacts generated for named personas (CEO, CPO, Operations Leader) produced more concrete, independently addressable key decisions than generic audience artifacts. Role specificity forces the artifact to commit to a decision frame rather than hedging for all readers.',
      signalType: 'audience_framing_signal',
      sourceArtifactId: null,
      sourceArtifactTitle: null,
      sourceParentStrategyId: null,
      sourceVersionIds: [],
      sourceRefinementIds: [],
      sourceAudience: 'multiple',
      sourceDecisionTag: null,
      confidence: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: 'Multiple persona variants were generated; persona-specific artifacts showed more targeted key decision framing.',
      counterSignals: ['Small-team analyses where a single stakeholder reviews all artifacts may not benefit from persona stratification.'],
      applyForwardGuidance: 'Always generate at least one customer-side and one provider-side artifact per strategy to surface audience-specific decision criteria.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      signalId: 's4sig_mock_002',
      title: 'Readiness warnings without checkpoints leave artifacts decision-incomplete',
      description: 'Artifacts that included readiness warnings without corresponding validation checkpoints created an unresolved risk gap. A warning flags a risk but does not provide the condition under which the strategy becomes safe to execute. Every readiness warning should be paired with a testable validation checkpoint.',
      signalType: 'readiness_warning_signal',
      sourceArtifactId: null,
      sourceArtifactTitle: null,
      sourceParentStrategyId: null,
      sourceVersionIds: [],
      sourceRefinementIds: [],
      sourceAudience: null,
      sourceDecisionTag: null,
      confidence: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation', 'company_analysis'],
      evidenceBasis: 'At least one artifact contained readiness warnings not matched by validation checkpoints.',
      counterSignals: ['In exploratory analyses, premature validation checkpoints can impose false specificity.'],
      applyForwardGuidance: 'For each readiness warning generated, require at least one corresponding validation checkpoint before treating the artifact as decision-ready.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      signalId: 's4sig_mock_003',
      title: 'Double-down artifacts need explicit defensibility evidence',
      description: 'Artifacts assigned a double-down investment posture were most credible when they explicitly stated why the advantage is competitively durable and what conditions would invalidate the thesis. Posture assignment alone does not establish decision confidence — the defensibility reasoning must be stated.',
      signalType: 'decision_tag_signal',
      sourceArtifactId: null,
      sourceArtifactTitle: null,
      sourceParentStrategyId: null,
      sourceVersionIds: [],
      sourceRefinementIds: [],
      sourceAudience: null,
      sourceDecisionTag: 'double down',
      confidence: 'medium',
      transferability: 'same-domain',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: 'Double-down posture artifacts without defensibility framing were identified as incomplete decision bases.',
      counterSignals: ['In fast-moving markets, over-emphasis on defensibility framing can slow response to new threats.'],
      applyForwardGuidance: 'Add a defensibility or competitive-durability subsection to every double-down artifact before treating it as a final recommendation.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      signalId: 's4sig_mock_004',
      title: 'Operational constraints in refinement context yield sharper key decisions',
      description: 'Refinement iterations that included specific operational context (team capacity limits, named stakeholder concerns, compliance requirements, budget constraints) produced artifacts with measurably narrower and more actionable key decisions. Broad strategic context inputs produced minimal artifact improvement.',
      signalType: 'refinement_signal',
      sourceArtifactId: null,
      sourceArtifactTitle: null,
      sourceParentStrategyId: null,
      sourceVersionIds: [],
      sourceRefinementIds: [],
      sourceAudience: null,
      sourceDecisionTag: null,
      confidence: 'medium',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: 'Refinement contexts containing specific constraints correlated with tighter, more actionable key decisions in revised artifact versions.',
      counterSignals: ['Overly specific operational constraints can narrow the artifact to the point of losing broader strategic framing.'],
      applyForwardGuidance: 'Guide users to provide constraint-specific or stakeholder-specific refinement context rather than broad strategic direction.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      signalId: 's4sig_mock_005',
      title: 'Key decisions section is the primary artifact quality signal',
      description: 'Artifacts with three or more concrete, independently addressable key decisions were significantly more useful as executive decision tools. The key decisions section separates a strategy narrative from an executive artifact. Artifacts without this section are analysis documents, not decision documents.',
      signalType: 'artifact_quality_signal',
      sourceArtifactId: null,
      sourceArtifactTitle: null,
      sourceParentStrategyId: null,
      sourceVersionIds: [],
      sourceRefinementIds: [],
      sourceAudience: null,
      sourceDecisionTag: null,
      confidence: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation', 'all'],
      evidenceBasis: 'Artifacts with ≥3 key decisions showed more complete executive framing across all variants reviewed.',
      counterSignals: [],
      applyForwardGuidance: 'Treat any artifact with fewer than 3 independently addressable key decisions as incomplete; prompt for refinement to add concrete decision points.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      signalId: 's4sig_mock_006',
      title: 'Validation checkpoints must specify measurable conditions, not intent',
      description: 'Validation checkpoints stated as intent ("ensure compliance is addressed") provided no decision gate. Checkpoints stated as measurable conditions ("compliance scheduling configured for three named accounts before renewal dates") created actionable gates. The difference is specificity of outcome.',
      signalType: 'validation_checkpoint_signal',
      sourceArtifactId: null,
      sourceArtifactTitle: null,
      sourceParentStrategyId: null,
      sourceVersionIds: [],
      sourceRefinementIds: [],
      sourceAudience: null,
      sourceDecisionTag: null,
      confidence: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation', 'all'],
      evidenceBasis: 'Comparison of validation checkpoint phrasing across artifact variants revealed a quality gap between intent-based and condition-based checkpoints.',
      counterSignals: ['Over-specifying checkpoints too early can create governance overhead before the strategy is sufficiently validated.'],
      applyForwardGuidance: 'Require all validation checkpoints to include a named outcome, a measurable threshold, and a time condition before marking the artifact decision-ready.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
}

// ── Deterministic fallback signal generator ───────────────────────────────────
// Generates 3–5 signals from artifact metadata when API parse fails.
// All signals marked generationMode:'fallback', confidence:'medium' or 'low'.
export function generateFallbackSignals(artifacts, now) {
  const completed = artifacts.filter(a => a.status === 'complete')
  if (completed.length === 0) return []

  const signals = []
  const idx = () => String(signals.length + 1).padStart(3, '0')

  // Signal: readiness warnings present
  const withWarnings = completed.filter(a => {
    const latest = a.versions?.length > 0 ? a.versions[a.versions.length - 1].data : a.data
    return (latest?.readinessWarnings || []).length > 0
  })
  if (withWarnings.length > 0) {
    signals.push({
      signalId: `s4sig_fb_${idx()}`,
      title: 'Readiness warnings detected across generated artifacts',
      description: `${withWarnings.length} artifact${withWarnings.length > 1 ? 's' : ''} contain readiness warnings flagging conditions that block execution-readiness. These warnings indicate the strategy artifact is incomplete without resolution.`,
      signalType: 'readiness_warning_signal',
      sourceArtifactId: withWarnings[0].id,
      sourceArtifactTitle: withWarnings[0].sourceStrategyName || null,
      sourceAudience: null, sourceDecisionTag: null,
      confidence: 'medium', transferability: 'same-domain',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: `${withWarnings.length} of ${completed.length} artifacts contain populated readinessWarnings arrays.`,
      counterSignals: ['Early-stage exploratory artifacts may not require full execution readiness.'],
      applyForwardGuidance: 'Pair each readiness warning with a testable validation checkpoint before treating the artifact as decision-ready.',
      createdAt: now, updatedAt: now, sourceParentStrategyId: null, sourceRefinementIds: [],
    })
  }

  // Signal: validation checkpoints present
  const withCheckpoints = completed.filter(a => {
    const latest = a.versions?.length > 0 ? a.versions[a.versions.length - 1].data : a.data
    return (latest?.validationCheckpoints || []).length > 0
  })
  if (withCheckpoints.length > 0) {
    signals.push({
      signalId: `s4sig_fb_${idx()}`,
      title: 'Validation checkpoints present in decision artifacts',
      description: `${withCheckpoints.length} artifact${withCheckpoints.length > 1 ? 's' : ''} include validation checkpoints providing testable execution-readiness conditions. Checkpoints transform narrative strategy into verifiable decision gates.`,
      signalType: 'validation_checkpoint_signal',
      sourceArtifactId: withCheckpoints[0].id,
      sourceArtifactTitle: withCheckpoints[0].sourceStrategyName || null,
      sourceAudience: null, sourceDecisionTag: null,
      confidence: 'medium', transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: `${withCheckpoints.length} of ${completed.length} artifacts contain validation checkpoints.`,
      counterSignals: [],
      applyForwardGuidance: 'Require checkpoints to state a measurable outcome, not intent, before marking the artifact decision-ready.',
      createdAt: now, updatedAt: now, sourceParentStrategyId: null, sourceRefinementIds: [],
    })
  }

  // Signal: refinement iterations detected
  const withRefinements = completed.filter(a => (a.versions || []).length > 1)
  if (withRefinements.length > 0) {
    signals.push({
      signalId: `s4sig_fb_${idx()}`,
      title: 'Artifact refinement iterations generated across session',
      description: `${withRefinements.length} artifact${withRefinements.length > 1 ? 's' : ''} went through multiple version iterations. User-provided refinement context drove artifact evolution toward more targeted key decisions.`,
      signalType: 'refinement_signal',
      sourceArtifactId: withRefinements[0].id,
      sourceArtifactTitle: withRefinements[0].sourceStrategyName || null,
      sourceAudience: null, sourceDecisionTag: null,
      confidence: 'medium', transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: `${withRefinements.length} artifact${withRefinements.length > 1 ? 's' : ''} have version counts > 1, indicating user-directed refinement.`,
      counterSignals: ['Single-version artifacts may have been correct on first generation.'],
      applyForwardGuidance: 'Provide specific operational constraints in refinement context rather than broad strategic direction for tighter key decisions.',
      createdAt: now, updatedAt: now, sourceParentStrategyId: null, sourceRefinementIds: [],
    })
  }

  // Signal: investment posture variety
  const postures = [...new Set(completed.map(a => a.strategyPosture).filter(Boolean))]
  if (postures.length > 0) {
    const hasDoubleDown   = postures.includes('double down')
    const postureLabel    = hasDoubleDown ? 'double-down' : postures[0] || 'varied'
    signals.push({
      signalId: `s4sig_fb_${idx()}`,
      title: 'Investment posture assignment drives artifact framing',
      description: `Artifacts span ${postures.length} investment posture${postures.length > 1 ? 's' : ''}: ${postures.join(', ')}. Posture assignment determines whether an artifact defends an advantage or frames an exit — framing must match posture to be decision-credible.`,
      signalType: 'decision_tag_signal',
      sourceArtifactId: null, sourceArtifactTitle: null,
      sourceAudience: null, sourceDecisionTag: postureLabel,
      confidence: 'medium', transferability: 'same-domain',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: `${completed.length} artifacts generated with posture${postures.length > 1 ? 's' : ''}: ${postures.join(', ')}.`,
      counterSignals: ['Posture labels simplify continuous investment decisions into discrete categories.'],
      applyForwardGuidance: 'Match artifact key decisions and call-to-action language to the assigned investment posture before finalising.',
      createdAt: now, updatedAt: now, sourceParentStrategyId: null, sourceRefinementIds: [],
    })
  }

  // Signal: persona framing
  const personas    = completed.filter(a => a.persona).map(a => a.persona)
  const hasCustomer = personas.some(p => p.side === 'customer')
  const hasProvider = personas.some(p => p.side === 'provider')
  if (personas.length > 0) {
    signals.push({
      signalId: `s4sig_fb_${idx()}`,
      title: 'Persona framing shapes artifact key decisions',
      description: `${personas.length} artifact${personas.length > 1 ? 's' : ''} generated with explicit persona targeting${hasCustomer && hasProvider ? ', covering both customer and provider sides' : ''}. Persona-specific artifacts produce more concrete key decisions than generic audience artifacts.`,
      signalType: 'audience_framing_signal',
      sourceArtifactId: null, sourceArtifactTitle: null,
      sourceAudience: personas[0]?.role || null, sourceDecisionTag: null,
      confidence: 'low', transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: `${personas.length} of ${completed.length} completed artifacts have persona assignments.`,
      counterSignals: ['Single-stakeholder sessions may not require persona stratification.'],
      applyForwardGuidance: 'Generate at least one customer-side and one provider-side variant per strategy to surface audience-specific decision criteria.',
      createdAt: now, updatedAt: now, sourceParentStrategyId: null, sourceRefinementIds: [],
    })
  }

  return signals
}
