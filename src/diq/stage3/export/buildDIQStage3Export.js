// DIQ Stage 3 → ResumeBuilder export builder
// Pure function — no API calls, no side effects.
// Converts session.stage3 synthesis into a structured basis
// that ResumeBuilder can consume as upstream positioning context.

function safeStr(v) {
  if (v == null) return ''
  return typeof v === 'string' ? v : String(v)
}

function safeArr(v) {
  return Array.isArray(v) ? v : []
}

function normalizeConfidence(raw) {
  const s = safeStr(raw).toLowerCase()
  return s === 'high' ? 'high' : s === 'low' ? 'low' : 'medium'
}

function normalizeStrength(raw) {
  const s = safeStr(raw).toLowerCase()
  return s === 'strong' ? 'strong' : s === 'moderate' ? 'moderate' : 'weak'
}

export function buildDIQStage3Export(session) {
  const s3     = session?.stage3 || {}
  const entity = session?.entity || {}

  const stalenessWarning = !!(
    s3.generatedFromStage2Id &&
    session?.stage2?.id &&
    s3.generatedFromStage2Id !== session.stage2.id
  )

  // Evidence map — each item rated for resume usability
  const qualifiedInsights = safeArr(s3.evidenceMap).map((item, i) => {
    const strength = normalizeStrength(item.strength)
    return {
      id:            `ev_${i}`,
      claim:         safeStr(item.observation),
      support:       safeStr(item.evidenceBasis),
      strength,
      usableInResume: strength !== 'weak',
      usageNote:     safeStr(item.implication),
    }
  })

  // Positioning angles from strategic implications
  const angles = safeArr(s3.strategicImplications)
    .map(imp => safeStr(imp.implication))
    .filter(Boolean)

  // Proof themes from insight clusters
  const proofThemes = safeArr(s3.insightClusters)
    .map(c => safeStr(c.insight))
    .filter(Boolean)

  // Key themes: insight cluster titles
  const keyThemes = safeArr(s3.insightClusters)
    .map(c => safeStr(c.title))
    .filter(Boolean)

  // Business concepts: strategic option titles
  const businessConcepts = safeArr(s3.strategicOptions)
    .map(o => safeStr(o.title))
    .filter(Boolean)

  // Domain keywords: thesis words + key themes
  const thesisWords = safeStr(s3.thesis?.text)
    .split(/[\s,;:.()\[\]]+/)
    .map(w => w.trim())
    .filter(w => w.length > 5)
    .slice(0, 15)
  const domainKeywords = [...new Set([...keyThemes, ...thesisWords])]

  // Risk surface from risks/constraints/unknowns
  const riskItems     = safeArr(s3.risksConstraintsUnknowns)
  const riskSurface   = riskItems.map(r => safeStr(r.item)).filter(Boolean)
  const claimsToAvoid = riskItems.map(r => safeStr(r.consequenceIfIgnored)).filter(Boolean)

  // Unresolved assumptions: evidence gaps + missing inputs
  const evidenceGaps = safeArr(s3.audienceConfidenceNotes?.evidenceGaps)
    .map(g => safeStr(g)).filter(Boolean)
  const missingInputs = safeArr(s3.stage4Readiness?.missingInputs)
    .map(m => safeStr(m)).filter(Boolean)
  const unresolvedAssumptions = [...new Set([...evidenceGaps, ...missingInputs])]

  // Confidence warnings
  const confidenceWarnings = safeArr(s3.audienceConfidenceNotes?.tradeoffsToAcknowledge)
    .map(t => safeStr(t)).filter(Boolean)

  // Weak evidence claims (for riskAndBoundaryNotes)
  const weakEvidence = qualifiedInsights
    .filter(e => e.strength === 'weak')
    .map(e => e.claim)
    .filter(Boolean)

  // Strategy menu — convert to resume-usable positioning angles
  const RECOMMENDED_POSTURES = new Set(['double down', 'selective investment'])
  const strategyAngles = safeArr(s3.strategyMenu).map((opt, i) => ({
    id:             safeStr(opt.id) || `sm_${i}`,
    title:          safeStr(opt.strategyName),
    summary:        safeStr(opt.outcomeServed || opt.whatThisMeans),
    posture:        safeStr(opt.investmentPosture),
    evidenceFor:    safeStr(opt.evidenceSupporting),
    evidenceAgainst: safeStr(opt.evidenceAgainst),
    recommended:    RECOMMENDED_POSTURES.has(safeStr(opt.investmentPosture).toLowerCase()),
  }))

  // Summary guidance and top emphasize/avoid for ResumeBuilder
  const topAngle       = angles[0] || ''
  const summaryGuidance = topAngle
    ? `Frame the summary around: ${topAngle}`
    : `Frame the summary around expertise in: ${safeStr(entity.name)}`

  const emphasize = qualifiedInsights
    .filter(e => e.strength === 'strong')
    .slice(0, 3)
    .map(e => e.claim)

  const avoid = [...claimsToAvoid, ...weakEvidence].slice(0, 3)

  return {
    exportKind:    'diq_stage3_resume_builder_basis',
    schemaVersion: '1.0',
    createdAt:     new Date().toISOString(),

    source: {
      diqSessionId:  safeStr(session?.id),
      stage3Id:      safeStr(s3.id),
      generatedAt:   s3.generatedAt || Date.now(),
      stalenessWarning,
    },

    domainBasis: {
      topic:            safeStr(entity.name),
      thesis:           safeStr(s3.thesis?.text),
      thesisSummary:    safeStr(s3.thesis?.rationale),
      confidence:       normalizeConfidence(s3.thesis?.confidence),
      keyThemes,
      strategicContext: safeStr(
        safeArr(s3.strategicOptions)[0]?.description || s3.thesis?.text
      ),
    },

    qualifiedInsights,

    resumePositioningBasis: {
      angles,
      proofThemes,
      domainKeywords,
      businessConcepts,
      riskSurface,
      strategyAngles,
    },

    riskAndBoundaryNotes: {
      claimsToAvoid,
      unresolvedAssumptions,
      weakEvidence,
      confidenceWarnings,
    },

    resumeBuilderInstructions: {
      intendedUse:                     'upstream_context',
      shouldGenerateResumeDirectly:    false,
      shouldOverwriteUserResumeContent: false,
      treatAs:                         'domain_positioning_basis',
      summaryGuidance,
      emphasize,
      avoid,
    },
  }
}
