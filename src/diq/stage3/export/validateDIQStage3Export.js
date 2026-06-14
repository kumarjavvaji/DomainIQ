// DIQ Stage 3 export validator
// Returns { valid: boolean, errors: string[] } — never throws into the UI flow.

export function validateDIQStage3Export(exp) {
  if (!exp || typeof exp !== 'object') {
    return { valid: false, errors: ['Export is not an object'] }
  }

  const errors = []

  if (exp.exportKind !== 'diq_stage3_resume_builder_basis') {
    errors.push(
      `exportKind must be "diq_stage3_resume_builder_basis", got "${exp.exportKind}"`
    )
  }

  if (!exp.schemaVersion) {
    errors.push('schemaVersion is required')
  }

  if (!exp.source?.diqSessionId) {
    errors.push('source.diqSessionId is required')
  }

  if (!exp.domainBasis?.topic) {
    errors.push('domainBasis.topic is required')
  }

  if (!exp.domainBasis?.thesis && !exp.domainBasis?.thesisSummary) {
    errors.push('domainBasis must have thesis or thesisSummary')
  }

  if (!exp.resumeBuilderInstructions) {
    errors.push('resumeBuilderInstructions is required')
  } else if (exp.resumeBuilderInstructions.shouldGenerateResumeDirectly !== false) {
    errors.push('resumeBuilderInstructions.shouldGenerateResumeDirectly must be false')
  }

  return { valid: errors.length === 0, errors }
}
