// Strategy Basis Package — export utility
// Builds a portable JSON package from a DomainIQ v4 session + selected Stage 4
// artifact version. Consumed by a future downstream Business Strategy app.
// No backend, no side-effects beyond triggering a browser download.

export function safeString(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return String(value)
}

export function safeArray(value) {
  return Array.isArray(value) ? value : []
}

// Removes null, undefined, and empty-string entries from a mapped array.
function compactArray(arr) {
  return arr.filter(s => s != null && s !== '')
}

// Flattens artifact data sections into readable plain text for artifactContent.
function serializeArtifactContent(data) {
  if (!data) return ''
  const parts = []
  for (const sec of safeArray(data.sections)) {
    if (sec.heading || sec.body) parts.push(`${safeString(sec.heading)}\n${safeString(sec.body)}`)
  }
  if (safeArray(data.keyDecisions).length > 0) {
    parts.push('Key Decisions\n' + data.keyDecisions.map((d, i) => `${i + 1}. ${d}`).join('\n'))
  }
  if (data.callToAction) parts.push('Call to Action\n' + safeString(data.callToAction))
  if (safeArray(data.validationCheckpoints).length > 0) {
    parts.push('Validation Checkpoints\n' + data.validationCheckpoints.map(v => `- ${v}`).join('\n'))
  }
  if (safeArray(data.readinessWarnings).length > 0) {
    parts.push('Readiness Warnings\n' + data.readinessWarnings.map(w => `- ${w}`).join('\n'))
  }
  return parts.join('\n\n')
}

function deriveArtifactSummary(data) {
  if (!data) return ''
  const firstSection = safeArray(data.sections)[0]
  if (firstSection?.body) {
    const t = firstSection.body
    return t.length > 200 ? t.slice(0, 197) + '…' : t
  }
  return safeString(data.subtitle)
}

function slugify(text) {
  return safeString(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function buildExportFilename(session, artifact, version) {
  const entitySlug   = slugify(session?.entity?.name || 'unknown')
  const strategySlug = slugify(artifact?.strategyPosture || artifact?.sourceStrategyName || 'strategy')
  const vNum         = version?.versionNumber ?? 1
  return `domainiq-strategy-basis-${entitySlug}-${strategySlug}-v${vNum}.json`
}

export function buildStrategyBasisPackage(session, artifact, version) {
  const s1     = session?.stage1  || {}
  const s2     = session?.stage2  || {}
  const s3     = session?.stage3  || {}
  const s4     = session?.stage4  || {}
  const entity = session?.entity  || {}
  const intent = session?.intent  || {}
  const data   = version?.data    ?? artifact?.data ?? null

  const risks = compactArray(safeArray(s3.risksConstraintsUnknowns).map(r =>
    safeString(typeof r === 'object' ? (r.risk || r.description || r.text || '') : r)
  ))

  const assumptions = compactArray(safeArray(s1.nodes)
    .filter(n => n.type === 'assumption')
    .map(n => safeString(n.statement)))

  const unresolvedQuestions = compactArray(safeArray(s2.unresolvedQuestions).map(q =>
    safeString(typeof q === 'object' ? (q.question || q.text || '') : q)
  ))

  const keyInsights = compactArray(safeArray(s3.insightClusters).map(c =>
    c.title ? `${safeString(c.title)}: ${safeString(c.insight)}` : safeString(c.insight)
  ))

  const supportingClaims = compactArray(safeArray(s3.evidenceMap).map(e => safeString(e.observation)))

  const recommendedNextActions = compactArray(safeArray(s3.strategicOptions).map(o => safeString(o.title)))

  const artifactCandidates = compactArray(safeArray(s4.artifacts)
    .filter(a => a.id !== artifact?.id && a.status === 'complete')
    .map(a => safeString(a.data?.artifactTitle || a.sourceStrategyName)))

  // Collect all refinement contexts across versions (oldest first, current version last)
  const stage4UserContextAdditions = compactArray(safeArray(artifact?.versions)
    .filter(v => v.refinementContext)
    .map(v => safeString(v.refinementContext)))

  return {
    packageType:    'domainiq_strategy_basis_package',
    packageVersion: '1.0',
    exportedAt:     new Date().toISOString(),
    sourceApp:      'DomainIQ',
    sourceAppVersion: 'v4',

    sourceSession: {
      sessionId:    safeString(session?.id),
      sessionName:  safeString(entity.name),
      analysisType: safeString(intent.outcome),
      company:      entity.type === 'company'  ? safeString(entity.name) : '',
      industry:     entity.type === 'industry' ? safeString(entity.name) : '',
      domain:       entity.type === 'domain'   ? safeString(entity.name) : '',
      workflow:     safeString(intent.what),
    },

    selectedArtifact: {
      artifactId:            safeString(artifact?.id),
      artifactType:          safeString(artifact?.strategyPosture),
      artifactTitle:         safeString(data?.artifactTitle || artifact?.sourceStrategyName),
      artifactVersionId:     safeString(version?.id),
      artifactVersionNumber: version?.versionNumber ?? null,
      artifactCreatedAt:     artifact?.generatedAt  ? new Date(artifact.generatedAt).toISOString()  : '',
      versionCreatedAt:      version?.createdAt     ? new Date(version.createdAt).toISOString()     : '',
      artifactContent:       serializeArtifactContent(data),
      artifactSummary:       deriveArtifactSummary(data),
      artifactData:          data ?? null,
    },

    strategyBasis: {
      company:              entity.type === 'company'  ? safeString(entity.name) : '',
      industry:             entity.type === 'industry' ? safeString(entity.name) : '',
      domain:               entity.type === 'domain'   ? safeString(entity.name) : '',
      workflow:             safeString(intent.what),
      targetCustomer:       safeString(artifact?.persona?.role),
      strategicThesis:      safeString(s3.thesis?.text),
      businessProblem:      safeString(intent.why),
      opportunity:          safeString(safeArray(s3.strategicOptions)[0]?.description),
      recommendedDirection: safeString(s2.summary?.likelyDirection),
      confidenceLevel:      safeString(s3.thesis?.confidence),
      readinessLevel:       safeString(s3.stage3ReadinessSummary),
    },

    evidenceChain: {
      stage1Intent:               safeString(s1.summary),
      stage2EvidenceSummary:      safeString(s2.summary?.whatChanged),
      stage3Synthesis:            safeString(s3.thesis?.rationale),
      stage4UserContextAdditions,
      keyInsights,
      supportingClaims,
      risks,
      assumptions,
      unresolvedQuestions,
      recommendedNextActions,
      artifactCandidates,
    },

    executionImplications: {
      likelyBusinessUnits:                 [],
      executiveLeadershipImplications:     [],
      productPdlcImplications:             [],
      engineeringTechnologyImplications:   [],
      designUxImplications:                [],
      dataAnalyticsImplications:           [],
      salesImplications:                   [],
      marketingImplications:               [],
      customerSuccessImplications:         [],
      operationsImplications:              [],
      financeImplications:                 [],
      legalComplianceImplications:         [],
      supportServiceImplications:          [],
      peopleChangeManagementImplications:  [],
      partnershipsEcosystemImplications:   [],
    },

    lineage: {
      sourceStage:           'Stage 4',
      sourceArtifactVersion: `v${version?.versionNumber ?? 1}`,
      basedOnStages:         ['Stage 1', 'Stage 2', 'Stage 3', 'Stage 4'],
      citationsPreserved:    false,
      userEdited:            !!(version?.refinementContext),
      notes:                 safeString(version?.changeSummary),
    },
  }
}

export function downloadStrategyBasisPackage(packageData, filename) {
  const json = JSON.stringify(packageData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
