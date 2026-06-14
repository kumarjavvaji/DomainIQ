// ResumeBuilder — DIQ Stage 3 import adapter
// Accepts a DIQStage3ResumeBuilderBasis export and maps it into
// ResumeBuilder's intake context shape.
//
// Rules:
//   - Does not overwrite user-authored resume content
//   - Does not generate resume bullets
//   - Treats the import as upstream context, not final copy

export function importDIQStage3Export(diqExport) {
  const {
    domainBasis            = {},
    qualifiedInsights      = [],
    resumePositioningBasis = {},
    riskAndBoundaryNotes   = {},
    resumeBuilderInstructions = {},
  } = diqExport || {}

  const usableInsights  = qualifiedInsights.filter(e => e.usableInResume)
  const riskyEvidenceIds = qualifiedInsights
    .filter(e => !e.usableInResume)
    .map(e => e.id)

  return {
    sourceKind: 'diq_stage3',
    importedAt: new Date().toISOString(),

    // What domain/problem space this covers
    domainContext: {
      topic:            domainBasis.topic || '',
      thesis:           domainBasis.thesis || '',
      confidence:       domainBasis.confidence || 'medium',
      keyThemes:        domainBasis.keyThemes || [],
      stalenessWarning: diqExport?.source?.stalenessWarning || false,
    },

    // What ResumeBuilder can use for positioning
    positioningContext: {
      angles:         resumePositioningBasis.angles || [],
      proofThemes:    resumePositioningBasis.proofThemes || [],
      strategyAngles: resumePositioningBasis.strategyAngles || [],
      keywords: [
        ...(resumePositioningBasis.domainKeywords  || []),
        ...(resumePositioningBasis.businessConcepts || []),
      ],
      usableEvidence: usableInsights.map(e => ({
        id:        e.id,
        claim:     e.claim,
        strength:  e.strength,
        usageNote: e.usageNote,
      })),
    },

    // What ResumeBuilder must not claim or overstate
    guardrails: {
      claimsToAvoid:         riskAndBoundaryNotes.claimsToAvoid         || [],
      weakEvidence:          riskAndBoundaryNotes.weakEvidence           || [],
      unresolvedAssumptions: riskAndBoundaryNotes.unresolvedAssumptions  || [],
      confidenceWarnings:    riskAndBoundaryNotes.confidenceWarnings     || [],
      riskyEvidenceIds,
    },

    // How ResumeBuilder should use this context
    generationGuidance: {
      summaryGuidance:           resumeBuilderInstructions.summaryGuidance || '',
      emphasize:                 resumeBuilderInstructions.emphasize        || [],
      avoid:                     resumeBuilderInstructions.avoid            || [],
      shouldOverwriteUserContent: false,
    },
  }
}
