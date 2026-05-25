// DomainIQ v4 — Stage 5 learning synthesis
// buildStage5Prompt: builds Claude prompt from all stage data
// MOCK_STAGE5: demo-mode fallback (no API key required)

// ── Stage data summarisers (compact — avoids large prompt) ───────────────────

function summariseStage1(s1) {
  if (!s1) return null
  const accepted = (s1.nodes || []).filter(n => n.userStatus === 'accepted')
  return {
    summary:          s1.summary || '',
    acceptedCount:    accepted.length,
    sampleNodes:      accepted.slice(0, 5).map(n => ({
      type:         n.type,
      statement:    (n.statement || '').slice(0, 110),
      confidence:   n.confidence,
      evidenceType: n.evidence_type,
    })),
    openQuestions:    (s1.openQuestions || []).slice(0, 3),
    inferredPatterns: (s1.inferredPatterns || []).slice(0, 4).map(p => ({
      title:           p.title,
      insight:         (p.insight || '').slice(0, 120),
      transferability: p.transferability,
    })),
  }
}

function summariseStage2(s2) {
  if (!s2) return null
  const assertions = (s2.refinedAssertions || [])
  const accepted   = assertions.filter(a => a.userStatus === 'accepted')
  const pivots     = (s2.pivots || []).filter(p => p.status === 'complete')
  return {
    sectionCount:     (s2.sections || []).length,
    totalAssertions:  assertions.length,
    acceptedCount:    accepted.length,
    sampleAssertions: accepted.slice(0, 4).map(a => ({
      summary: (a.refinedStatement || a.statement || '').slice(0, 110),
    })),
    pivotCount: pivots.length,
    pivots:     pivots.slice(0, 3).map(p => ({
      type:    p.type,
      summary: (p.displaySummary || '').slice(0, 130),
    })),
  }
}

function summariseStage3(s3) {
  if (!s3) return null
  return {
    // s3.thesis is { text, rationale } — extract the text string defensively
    thesis:          (typeof s3.thesis === 'string' ? s3.thesis : (s3.thesis?.text || '')).slice(0, 380),
    thesisRationale: (s3.thesis?.rationale || '').slice(0, 120),
    clusterCount:    (s3.insightClusters || []).length,
    clusters:        (s3.insightClusters || []).slice(0, 4).map(c => ({
      title:   c.title || c.clusterTitle || '',
      summary: (c.summary || '').slice(0, 90),
    })),
    optionCount:     (s3.strategicOptions || []).length,
    options:         (s3.strategicOptions || []).slice(0, 5).map(o => ({
      name:    o.strategyName || o.name || '',
      posture: o.investmentPosture || '',
    })),
    risksCount:      (s3.risksConstraintsUnknowns || []).length,
    menuCount:       (s3.strategyMenu || []).length,
  }
}

function summariseStage4(session) {
  const s4 = session.stage4
  if (!s4) return null
  const artifacts = (s4.artifacts || []).filter(a => a.status === 'complete')
  const signals   = s4.learningSignals || []
  const deleted   = s4.deletedArtifactMetadata || []

  return {
    artifactCount:  artifacts.length,
    deletedCount:   deleted.length,
    // Per-artifact detail: refinement history, validation checkpoints, readiness warnings
    artifactDetails: artifacts.slice(0, 6).map(a => {
      const versions = a.versions || []
      const latest   = versions.length > 0 ? versions[versions.length - 1].data : a.data
      return {
        strategy:  a.sourceStrategyName || '',
        posture:   a.strategyPosture    || '',
        persona:   a.persona?.role      || null,
        versionCount: versions.length,
        refinements: versions.filter(v => v.refinementContext).map(v => ({
          v:       v.versionNumber,
          context: (v.refinementContext || '').slice(0, 120),
          summary: (v.changeSummary    || '').slice(0, 80),
        })),
        validationCheckpoints: (latest?.validationCheckpoints || []).slice(0, 2).map(vc =>
          typeof vc === 'string' ? vc.slice(0, 90) : (vc.checkpoint || vc.condition || JSON.stringify(vc)).slice(0, 90)
        ),
        readinessWarnings: (latest?.readinessWarnings || []).slice(0, 2).map(rw =>
          typeof rw === 'string' ? rw.slice(0, 90) : (rw.warning || rw.condition || JSON.stringify(rw)).slice(0, 90)
        ),
        keyDecisionCount: (latest?.keyDecisions || []).length,
        hasCallToAction:  !!(latest?.callToAction),
      }
    }),
    // Deleted artifacts — source for negative_signal / negative_learning_pattern
    deletedArtifacts: deleted.slice(0, 5).map(d => ({
      title:        (d.title || 'Unknown').slice(0, 80),
      persona:      d.persona      || null,
      posture:      d.posture      || null,
      versionCount: d.versionCount || 0,
      deleteReason: d.deleteReason || null,
    })),
    signalCount: signals.length,
    // Include full Stage 4 signals — primary source for cross-stage synthesis
    signals: signals.map(s => ({
      signalId:             s.signalId,
      title:                s.title,
      description:          s.description,
      signalType:           s.signalType,
      confidence:           s.confidence,
      transferability:      s.transferability,
      applicableScopes:     s.applicableScopes,
      applyForwardGuidance: s.applyForwardGuidance,
      counterSignals:       s.counterSignals || [],
    })),
  }
}

// ── Compact generation contract ───────────────────────────────────────────────
// Single source of truth for all Stage 5 output limits.
// Import this in any future generator to enforce token-budget discipline.
// Design rule: when generation truncates, reduce representational burden
// before increasing max_tokens. Critical outputs go first; verbose sections last.
export const COMPACT_GENERATION_LIMITS = {
  maxSignals:   8,
  maxTriggers:  5,
  maxPatterns:  4,
  fieldLimits: {
    title:                  12,  // words
    description:            35,
    evidenceBasis:          30,
    provenance:             20,
    applyForwardGuidance:   25,
    counterSignals:         { maxItems: 2, maxWordsEach: 18 },
    reusableGuidance:       45,
    whenToApply:            25,
    whenNotToApply:         25,
    patternVsClaimBoundary: 30,
    recommendedAction:      25,
  },
}

// ── Prompt builder ────────────────────────────────────────────────────────────
export function buildStage5Prompt({ session }) {
  const entity   = session.entity
  const s1       = summariseStage1(session.stage1)
  const s2       = summariseStage2(session.stage2)
  const s3       = summariseStage3(session.stage3)
  const s4       = summariseStage4(session)
  const hasS4Sig = (s4?.signalCount || 0) > 0
  const now      = Date.now()

  const hasDeletedArtifacts = (s4?.deletedCount || 0) > 0

  return `You are an expert analyst generating Stage 5 learning synthesis for entity "${entity?.name}".

Stage 5 purpose: synthesise REUSABLE ANALYSIS PATTERNS from a completed multi-stage analysis. Do NOT store domain facts about ${entity?.name} as patterns. Convert lessons about HOW the analysis proceeded into transferable analytical frameworks for future analyses.

ENTITY: ${entity?.name} (${entity?.type || 'company'})

${s1 ? `STAGE 1 — ORIENTATION:
${JSON.stringify(s1, null, 2)}
` : 'STAGE 1: Not available'}

${s2 ? `STAGE 2 — EVIDENCE:
${JSON.stringify(s2, null, 2)}
` : 'STAGE 2: Not available'}

${s3 ? `STAGE 3 — SYNTHESIS:
${JSON.stringify(s3, null, 2)}
` : 'STAGE 3: Not available'}

${s4 ? `STAGE 4 — ARTIFACTS ${hasS4Sig ? '(explicit learning signals available — use as primary source)' : '(no explicit signals — infer from artifact metadata)'}:
${JSON.stringify(s4, null, 2)}
${hasDeletedArtifacts ? `\nIMPORTANT — DELETED ARTIFACTS: ${s4.deletedCount} artifact(s) were deleted during this session. Generate at least one signal with signalType "negative_signal" and consider a "negative_learning_pattern" capturing what those deletions reveal about artifact quality, audience framing gaps, or strategic mismatch. Do not restate the deleted content — describe the quality lesson.` : ''}` : 'STAGE 4: Not available'}

---

STRICT WORD LIMITS — every field below is token-budgeted. Exceeding limits wastes tokens and causes refinement triggers to be omitted. Treat these as hard caps.

CATEGORY 1 — LEARNING SIGNALS: generate exactly 5–8 signals (one or more per stage available).
Signal types: framing_signal | evidence_signal | synthesis_signal | artifact_signal | refinement_signal | readiness_signal | risk_signal | audience_signal | scope_signal | quality_signal | negative_signal
sourceStage: stage1 | stage2 | stage3 | stage4
For Stage 4: capture which persona framing worked, which refinement improved decisions, which readiness warnings mattered, what deleted artifacts reveal.

CATEGORY 2 — REFINEMENT TRIGGERS: generate exactly 3–5 triggers.
Testable conditions that signal an artifact or synthesis is not decision-ready. Examples:
- High refinement count around one actor indicates unresolved business model choice
- Validation checkpoint lacks time bound or evidence type
- Capability recommendation lacks prior-state diagnostic
- Stage 2 evidence is pivot-derived and needs direct confirmation
- Artifact persona does not match decision authority
appliesToStage: stage1 | stage2 | stage3 | stage4 | all
severity: high | medium | low

CATEGORY 3 — REUSABLE PATTERNS: generate exactly 3–4 patterns.
Convert cross-stage lessons into transferable analytical methods — NOT domain facts.
Pattern types: framing_pattern | evidence_quality_pattern | synthesis_pattern | artifact_structure_pattern | refinement_pattern | readiness_pattern | risk_pattern | audience_translation_pattern | scope_transfer_pattern | negative_learning_pattern
Most v1 patterns: "seed" maturity.
patternVsClaimBoundary: explain why this is a reusable method, not a fact about ${entity?.name}.
Transferability: session-only | same-company | same-domain | same-industry | cross-domain | general

Return ONLY compact valid JSON — no markdown fences, no commentary, no extra whitespace.
OUTPUT ORDER: learningSignals → refinementTriggers → reusablePatterns (triggers must be output before patterns).

{
  "learningSignals": [
    {
      "signalId": "s5sig_001",
      "title": "≤12 words",
      "description": "≤35 words",
      "sourceStage": "stage1",
      "sourceArtifactId": null,
      "sourceVersionId": null,
      "signalType": "framing_signal",
      "confidence": "medium",
      "transferability": "general",
      "applicableScopes": ["all"],
      "provenance": "≤20 words",
      "evidenceBasis": "≤30 words",
      "counterSignals": ["max 2 items, ≤18 words each, or empty array"],
      "applyForwardGuidance": "≤25 words",
      "createdAt": ${now}
    }
  ],
  "refinementTriggers": [
    {
      "triggerId": "trig_001",
      "title": "≤12 words",
      "description": "≤35 words — what condition and why it matters",
      "appliesToStage": "stage4",
      "severity": "high",
      "recommendedAction": "≤25 words",
      "sourceSignalIds": [],
      "confidence": "high",
      "transferability": "general",
      "createdAt": ${now}
    }
  ],
  "reusablePatterns": [
    {
      "patternId": "pat_001",
      "patternTitle": "≤12 words",
      "patternType": "framing_pattern",
      "patternMaturity": "seed",
      "sourceStages": ["stage3", "stage4"],
      "sourceSignalIds": [],
      "sourceArtifactIds": [],
      "sourceVersionIds": [],
      "reusableGuidance": "≤45 words",
      "whenToApply": "≤25 words",
      "whenNotToApply": "≤25 words",
      "confidenceLevel": "medium",
      "transferability": "same-domain",
      "applicableScopes": ["strategy_artifact_generation"],
      "evidenceBasis": "≤30 words",
      "counterSignals": ["max 2 items, ≤18 words each, or empty array"],
      "patternVsClaimBoundary": "≤30 words",
      "applyForwardGuidance": "≤25 words",
      "createdAt": ${now},
      "updatedAt": ${now}
    }
  ]
}`
}

// ── Demo-mode mock ────────────────────────────────────────────────────────────
export const MOCK_STAGE5 = {
  learningSignals: [
    {
      signalId: 's5sig_001',
      title: 'Operational constraints in Stage 1 sharpen Stage 4 artifact decisions',
      description: 'When the Stage 1 intent included specific operational constraints — team size, named stakeholder mandates, compliance requirements — Stage 4 artifacts produced measurably more actionable key decisions. Generic research intent produced broader, harder-to-execute artifacts across all strategies.',
      sourceStage: 'stage1',
      sourceArtifactId: null,
      sourceVersionId: null,
      signalType: 'framing_signal',
      confidence: 'high',
      transferability: 'general',
      applicableScopes: ['all'],
      provenance: 'Stage 1 user context fields correlated with Stage 4 artifact decision specificity.',
      evidenceBasis: 'Analyses with user-provided constraints in Stage 1 produced Stage 4 artifacts with narrower, named key decisions.',
      counterSignals: ['Over-specifying constraints too early can create confirmation bias in Stage 2 research.'],
      applyForwardGuidance: 'Prompt users to include at least one named constraint or stakeholder concern in their Stage 1 intent before generating.',
      createdAt: Date.now(),
    },
    {
      signalId: 's5sig_002',
      title: 'Evidence gaps in Stage 2 produce thin claims in Stage 3 thesis',
      description: 'Where Stage 2 had low-confidence assertions or unresolved evidence gaps for specific areas, Stage 3 thesis statements in those areas were broader and more hedged. Evidence quality is the primary upstream constraint on synthesis specificity. Thin Stage 3 sections predict weak Stage 4 artifacts in the same topic area.',
      sourceStage: 'stage2',
      sourceArtifactId: null,
      sourceVersionId: null,
      signalType: 'evidence_signal',
      confidence: 'high',
      transferability: 'general',
      applicableScopes: ['company_analysis', 'industry_analysis'],
      provenance: 'Low-confidence Stage 2 assertions corresponded to hedged Stage 3 thesis coverage in the same topic areas.',
      evidenceBasis: 'Stage 2 sections with mostly inferred-strategy evidence produced Stage 3 claims with explicit uncertainty qualifiers.',
      counterSignals: ['Some evidence gaps are intentional — the analyst may have deliberately scoped out lower-priority areas.'],
      applyForwardGuidance: 'Before advancing to Stage 3, verify that all strategically important Stage 2 areas have at least one high-confidence assertion.',
      createdAt: Date.now(),
    },
    {
      signalId: 's5sig_003',
      title: 'Strategy menu posture diversity produces richer Stage 4 decision surfaces',
      description: 'Stage 3 strategy menus that included at least one double-down and one deprioritize posture produced Stage 4 artifact sets that were easier to compare and contrast. Menus with all-similar postures reduced the useful contrast of the artifact workspace and obscured the strategic choice.',
      sourceStage: 'stage3',
      sourceArtifactId: null,
      sourceVersionId: null,
      signalType: 'synthesis_signal',
      confidence: 'medium',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      provenance: 'Stage 3 strategic option variety correlated with Stage 4 artifact decision differentiation quality.',
      evidenceBasis: 'Strategy menus with posture diversity produced a broader decision surface in Stage 4 artifact sets.',
      counterSignals: ['In narrow analytical contexts with a pre-committed strategy direction, posture diversity may add noise rather than value.'],
      applyForwardGuidance: 'Ensure Stage 3 strategy menus include at least one high-investment and one deprioritize option to create useful decision contrast in Stage 4.',
      createdAt: Date.now(),
    },
    {
      signalId: 's5sig_004',
      title: 'Persona framing in Stage 4 determines artifact decision vocabulary',
      description: 'Stage 4 artifacts generated for specific personas produced distinct decision vocabularies, not just re-framed content. CEO artifacts centered on market timing and investment logic. Operations Leader artifacts centered on capacity and delivery risk. Using generic audience labels without explicit persona framing produced artifacts that were insufficiently specific for any reader.',
      sourceStage: 'stage4',
      sourceArtifactId: null,
      sourceVersionId: null,
      signalType: 'artifact_signal',
      confidence: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      provenance: 'Stage 4 persona metadata compared against key decision section specificity.',
      evidenceBasis: 'Persona-specific artifacts showed higher decision specificity and more concrete calls-to-action than generic-audience artifacts.',
      counterSignals: [],
      applyForwardGuidance: 'Define distinct decision vocabularies per persona role (CEO, CPO, Operations Leader) and inject them into Stage 4 artifact prompts.',
      createdAt: Date.now(),
    },
    {
      signalId: 's5sig_005',
      title: 'Refinement context specificity is the primary lever for artifact revision quality',
      description: 'Across all Stage 4 refinement iterations, the quality of refinement output was determined almost entirely by the specificity of the user-provided context, not by the number of iterations. A single refinement with operational constraints produced better artifacts than multiple refinements with broad strategic guidance.',
      sourceStage: 'stage4',
      sourceArtifactId: null,
      sourceVersionId: null,
      signalType: 'refinement_signal',
      confidence: 'medium',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      provenance: 'Stage 4 artifact version comparison across refinement iterations.',
      evidenceBasis: 'Refinements with operational constraints in the user context produced tighter key decisions and fewer generic claims.',
      counterSignals: ['In early-stage exploratory analyses, constraint-specific refinement may artificially narrow the artifact before the strategy is sufficiently validated.'],
      applyForwardGuidance: 'Before allowing a refinement submission, prompt users to specify at least one constraint, stakeholder concern, or validation condition.',
      createdAt: Date.now(),
    },
    {
      signalId: 's5sig_006',
      title: 'Generic audience labels reliably produce deletable artifacts',
      description: 'Artifacts generated with generic audience labels — "leadership team", "decision-makers", "stakeholders" — produced decisions that were too broad for senior executives and too vague for operators. Across Stage 4, these artifacts were more frequently superseded by persona-specific versions that generated stronger, narrower key decisions.',
      sourceStage: 'stage4',
      sourceArtifactId: null,
      sourceVersionId: null,
      signalType: 'negative_signal',
      confidence: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      provenance: 'Deleted artifact metadata from Stage 4 session showing generic-audience artifacts superseded by persona-specific versions.',
      evidenceBasis: 'Generic-audience artifacts were more frequently deleted or replaced; persona-specific variants consistently produced more actionable key decisions.',
      counterSignals: ['In early-stage exploratory analyses, a generic draft artifact may be a useful baseline before personas are defined.'],
      applyForwardGuidance: 'Require role-specific persona selection before Stage 4 artifact generation; flag generic audience labels as a pre-generation quality gate.',
      createdAt: Date.now(),
    },
  ],
  reusablePatterns: [
    {
      patternId: 'pat_001',
      patternTitle: 'Constraint-first framing improves downstream artifact specificity',
      patternType: 'framing_pattern',
      patternMaturity: 'seed',
      sourceStages: ['stage1', 'stage4'],
      sourceSignalIds: ['s5sig_001'],
      sourceArtifactIds: [],
      sourceVersionIds: [],
      reusableGuidance: 'When setting up a strategy analysis, capture at least one operational constraint, one named stakeholder concern, and one explicit validation condition in Stage 1. This constraint set propagates through all downstream stages and materially improves Stage 4 artifact decision specificity without requiring additional refinement iterations.',
      whenToApply: 'Any analysis where a specific executive decision or recommendation is the downstream goal — especially in enterprise, regulated, or resource-constrained environments.',
      whenNotToApply: 'Early-stage exploration or market-entry discovery analyses where constraints are intentionally unknown and premature constraint framing would narrow research scope artificially.',
      confidenceLevel: 'medium',
      transferability: 'general',
      applicableScopes: ['all'],
      evidenceBasis: 'Correlation between user-provided constraints in Stage 1 and key decision specificity in Stage 4 artifacts across multiple analysis sessions.',
      counterSignals: ['Pre-specifying constraints can create confirmation bias in Stage 2 research if the constraint is wrong.'],
      patternVsClaimBoundary: 'This describes a workflow framing move applicable to any strategy analysis, not a fact about any specific company or domain.',
      applyForwardGuidance: 'Add a structured constraint-capture prompt to the Stage 1 intent form: team capacity, named stakeholders, and validation conditions.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      patternId: 'pat_002',
      patternTitle: 'Every readiness warning requires a paired validation checkpoint',
      patternType: 'readiness_pattern',
      patternMaturity: 'seed',
      sourceStages: ['stage4'],
      sourceSignalIds: ['s4sig_mock_002'],
      sourceArtifactIds: [],
      sourceVersionIds: [],
      reusableGuidance: 'Any strategy artifact that generates a readiness warning must also generate at least one paired validation checkpoint. A warning without a checkpoint is an unresolved risk statement — it flags a problem but provides no path to resolution. Validation checkpoints convert open risk statements into testable, time-bound conditions.',
      whenToApply: 'Always — applies to all strategy artifacts at Stage 4 and any synthesis output at Stage 3 that includes risk or constraint statements.',
      whenNotToApply: 'Hypothesis-stage or orientation outputs where validation checkpoints would be premature and artificially specific about unvalidated strategy directions.',
      confidenceLevel: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation', 'all'],
      evidenceBasis: 'Stage 4 artifacts with unpaired readiness warnings were identified as decision-incomplete across multiple analysis sessions.',
      counterSignals: ['Over-specifying validation checkpoints before strategy validation can create process overhead that reduces executive usability.'],
      patternVsClaimBoundary: 'This is a structural quality rule for decision artifacts, applicable to any domain. It describes how to make risk statements decision-useful, not a claim about any specific risk.',
      applyForwardGuidance: 'Enforce a pairing rule in artifact generation: for each readiness warning produced, require at least one corresponding measurable validation checkpoint.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      patternId: 'pat_003',
      patternTitle: 'High-frequency touchpoints carry disproportionate retention risk',
      patternType: 'risk_pattern',
      patternMaturity: 'seed',
      sourceStages: ['stage2', 'stage3'],
      sourceSignalIds: ['s5sig_002'],
      sourceArtifactIds: [],
      sourceVersionIds: [],
      reusableGuidance: 'In enterprise software analysis, products or features used daily carry disproportionate retention and competitive risk relative to products used monthly or quarterly. Stage 2 research for high-frequency touchpoints should be prioritized over low-frequency modules because switching cost correlates with usage frequency in enterprise workflows.',
      whenToApply: 'Enterprise SaaS, HCM, ERP, and workflow automation analyses where usage frequency data exists or can be reasonably inferred from product positioning.',
      whenNotToApply: 'Commodity or low-differentiation products where usage frequency does not correlate with integration depth or switching cost.',
      confidenceLevel: 'medium',
      transferability: 'same-industry',
      applicableScopes: ['company_analysis', 'domain_workflow_analysis'],
      evidenceBasis: 'Stage 2 research confirmed high-frequency interaction products show stronger retention correlation than low-frequency modules in enterprise workflows.',
      counterSignals: ['High frequency does not always mean high switching cost — frequency without deep integration may not create meaningful retention.'],
      patternVsClaimBoundary: 'This is an enterprise software retention analysis heuristic applicable to any platform company with mixed-frequency product portfolios. It converts a domain observation into a transferable research prioritisation rule.',
      applyForwardGuidance: 'In future enterprise software analyses, identify the highest-frequency touchpoints first and prioritise their evidence collection before analysing lower-frequency modules.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      patternId: 'pat_004',
      patternTitle: 'Persona-stratified artifacts require role-specific decision vocabulary',
      patternType: 'audience_translation_pattern',
      patternMaturity: 'seed',
      sourceStages: ['stage4'],
      sourceSignalIds: ['s5sig_004', 's4sig_mock_001'],
      sourceArtifactIds: [],
      sourceVersionIds: [],
      reusableGuidance: 'Strategy artifacts for different executive roles require distinct decision vocabularies — not just re-framed content. A CEO artifact should centre on market timing and investment logic. A CPO artifact should centre on portfolio sequencing and capability gaps. An Operations Leader artifact should centre on capacity, delivery risk, and process change. Generic role labels without distinct vocabulary produce artifacts that serve no audience well.',
      whenToApply: 'Any analysis where strategy artifacts will be reviewed by executives with different decision authority, not just different seniority levels.',
      whenNotToApply: 'Small-company or early-stage analyses where a single decision-maker reviews all strategy artifacts and persona stratification creates more overhead than value.',
      confidenceLevel: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: 'Multi-persona artifact sets in Stage 4 showed measurable differences in decision criteria specificity when role-specific vocabulary was applied.',
      counterSignals: ['In organisations with flat decision structures, persona stratification may conflict with how decisions are actually made.'],
      patternVsClaimBoundary: 'This is a structural artifact design pattern for audience-specific executive communication, applicable to any strategic recommendation context.',
      applyForwardGuidance: 'Define distinct decision-dimension sets per persona (CEO: timing + investment; CPO: portfolio + sequencing; Ops: capacity + delivery) and inject them explicitly into Stage 4 artifact generation.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      patternId: 'pat_005',
      patternTitle: 'Posture diversity in strategy menu sharpens decision contrast',
      patternType: 'synthesis_pattern',
      patternMaturity: 'seed',
      sourceStages: ['stage3', 'stage4'],
      sourceSignalIds: ['s5sig_003'],
      sourceArtifactIds: [],
      sourceVersionIds: [],
      reusableGuidance: 'Strategy menus that include at least one high-investment (double-down) and one deprioritise posture produce Stage 4 artifact sets with clearer decision contrast. When all strategies cluster in the same posture band, the artifact workspace loses comparative value and obscures the fundamental strategic choice between investment directions.',
      whenToApply: 'Any multi-strategy analysis where executives will compare options side by side to make a directional investment or resource-allocation decision.',
      whenNotToApply: 'Single-strategy validation exercises where the strategic direction is already committed and posture diversity would be artificially manufactured.',
      confidenceLevel: 'medium',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: 'Stage 3 posture variety correlated with Stage 4 artifact decision differentiation quality across the strategy menu.',
      counterSignals: ['In narrow-focus analyses with a pre-committed strategic direction, forcing posture diversity can add noise.'],
      patternVsClaimBoundary: 'This is a structural design rule for strategy menu composition applicable to any analytical context — not a fact about any specific strategy direction or investment thesis.',
      applyForwardGuidance: 'Enforce posture diversity at Stage 3 menu generation: require at least one double-down and one deprioritise option before advancing to Stage 4.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      patternId: 'pat_006',
      patternTitle: 'Generic audience framing is a reliable pre-deletion quality signal',
      patternType: 'negative_learning_pattern',
      patternMaturity: 'seed',
      sourceStages: ['stage4'],
      sourceSignalIds: ['s5sig_006'],
      sourceArtifactIds: [],
      sourceVersionIds: [],
      reusableGuidance: 'Artifacts generated with generic audience labels ("leadership team", "decision-makers") are significantly more likely to be deleted or superseded than persona-specific artifacts. The generic label forces hedged decisions, producing artifacts that are simultaneously too broad for senior executives and too vague for operators. Treating generic audience framing as a pre-generation quality gate prevents waste earlier in the workflow.',
      whenToApply: 'As a pre-generation gate in Stage 4: flag any artifact request with a generic audience label before generation, not after deletion.',
      whenNotToApply: 'Discovery-phase analyses where personas have not yet been identified — in those cases a baseline generic artifact may be appropriate before stratification.',
      confidenceLevel: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation'],
      evidenceBasis: 'Deleted artifact metadata from this Stage 4 session showed generic-audience artifacts were superseded by persona-specific versions in all observed cases.',
      counterSignals: ['Some analyses have a genuinely cross-functional audience where a synthesis artifact is the correct output.'],
      patternVsClaimBoundary: 'This is a negative quality heuristic for artifact generation workflow, not a domain fact. It applies to any strategy analysis that generates audience-specific deliverables.',
      applyForwardGuidance: 'Surface this pattern as a pre-generation warning in Stage 4 whenever a generic audience label is detected; require role-specific persona selection.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      patternId: 'pat_budget_001',
      patternTitle: 'Token Budget Discipline Through Compressed Output Contracts',
      patternType: 'artifact_structure_pattern',
      patternMaturity: 'seed',
      sourceStages: ['stage4', 'stage5'],
      sourceSignalIds: [],
      sourceArtifactIds: [],
      sourceVersionIds: [],
      reusableGuidance: 'When generation repeatedly truncates, reduce representational burden before increasing token budget. Require compact schemas, hard word limits, prioritized output ordering, and staged expansion. Critical outputs should appear first; optional or verbose sections last or on demand.',
      whenToApply: 'A generation call has truncated more than once; output includes multiple arrays of verbose objects; later sections are consistently missing; UI needs summaries, not full prose; JSON is used for structured persistence.',
      whenNotToApply: 'User explicitly needs long-form narrative artifact; output is meant for human reading rather than structured persistence; token headroom is large and truncation is not occurring; missing information cannot be compressed.',
      confidenceLevel: 'high',
      transferability: 'general',
      applicableScopes: ['strategy_artifact_generation', 'all'],
      evidenceBasis: 'Stage 4 and Stage 5 generation repeatedly truncated because output schema requested too many long-form objects. Reordering and compressing fields resolved truncation without increasing max_tokens.',
      counterSignals: [
        'Over-compression may remove nuance needed for strategic judgment.',
        'Some artifacts require narrative richness and should be generated separately from structured metadata.',
      ],
      patternVsClaimBoundary: 'This is a generation-design heuristic for any AI-assisted structured output workflow, not a claim about any specific analysis or domain.',
      applyForwardGuidance: 'For any future generator: define max object counts and per-field word caps before prompting; output critical arrays first; defer verbose sections; use summaries by default and expand on demand.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  refinementTriggers: [
    {
      triggerId: 'trig_001',
      title: 'Artifact has fewer than three key decisions',
      description: 'A strategy artifact that does not contain at least three independently addressable key decisions cannot support executive decision-making. Fewer than three decisions usually indicates the artifact is a strategy narrative rather than a decision document.',
      appliesToStage: 'stage4',
      severity: 'high',
      recommendedAction: 'Require refinement with explicit prompt: "Add 3 independently addressable key decisions that an executive must make to execute this strategy — each decision should be completable without the others."',
      sourceSignalIds: ['s4sig_mock_005'],
      confidence: 'high',
      transferability: 'general',
      createdAt: Date.now(),
    },
    {
      triggerId: 'trig_002',
      title: 'Readiness warning exists without a paired validation checkpoint',
      description: 'When a readiness warning is present without a corresponding validation checkpoint, the artifact flags a risk but provides no path to resolution. This makes the artifact unsuitable as a final executive recommendation because the risk remains open-ended.',
      appliesToStage: 'stage4',
      severity: 'high',
      recommendedAction: 'Require refinement to add at least one validation checkpoint per readiness warning, specifying the measurable condition that must be proven before the strategy is approved.',
      sourceSignalIds: ['s4sig_mock_002'],
      confidence: 'high',
      transferability: 'general',
      createdAt: Date.now(),
    },
    {
      triggerId: 'trig_003',
      title: 'Stage 3 thesis covers more than two distinct strategic themes',
      description: 'If the Stage 3 thesis statement spans more than two distinct strategic themes or uses hedge language in more than half its sentences, Stage 4 artifact generation will produce generic artifacts with diluted decision criteria that cannot adequately serve any single strategy direction.',
      appliesToStage: 'stage3',
      severity: 'medium',
      recommendedAction: 'Narrow the Stage 3 thesis to a single primary claim supported by evidence before generating Stage 4 artifacts. Use the insight clusters to separate themes into distinct strategic options.',
      sourceSignalIds: ['s5sig_003'],
      confidence: 'medium',
      transferability: 'general',
      createdAt: Date.now(),
    },
    {
      triggerId: 'trig_004',
      title: 'Stage 2 evidence relies entirely on one source type',
      description: 'Stage 2 research that draws exclusively from user-provided context, or exclusively from inferred strategy, produces synthesis and artifacts with artificially narrow confidence. A single evidence-type base creates a credibility gap that propagates to Stage 3 and Stage 4.',
      appliesToStage: 'stage2',
      severity: 'medium',
      recommendedAction: 'Run at least one pivot investigation using an external or complementary evidence type before advancing to Stage 3. Verified facts should appear in at least two Stage 2 sections.',
      sourceSignalIds: ['s5sig_002'],
      confidence: 'medium',
      transferability: 'general',
      createdAt: Date.now(),
    },
    {
      triggerId: 'trig_005',
      title: 'Strategy recommendation is stated before evidence basis is established',
      description: 'A strategy artifact that presents a recommendation or call-to-action before establishing the evidence basis — market context, competitive position, operational readiness — creates a persuasive document that is not defensible under executive review.',
      appliesToStage: 'stage4',
      severity: 'high',
      recommendedAction: 'Reorder artifact sections so evidence and context sections precede any recommendation. Require at least one evidence section containing supporting data before the call-to-action.',
      sourceSignalIds: ['s4sig_mock_003'],
      confidence: 'high',
      transferability: 'general',
      createdAt: Date.now(),
    },
  ],
  generatedAt: Date.now(),
  updatedAt:   Date.now(),
}
