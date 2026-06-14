// DIQ Stage 3 → ResumeBuilder export tests
// Covers: builder, validator, adapter

import { describe, it, expect } from 'vitest'
import { buildDIQStage3Export } from '../diq/stage3/export/buildDIQStage3Export'
import { validateDIQStage3Export } from '../diq/stage3/export/validateDIQStage3Export'
import { importDIQStage3Export } from '../resumeBuilder/import/importDIQStage3Export'
import { DIQ_STAGE3_AI_PDLC_FIXTURE } from './fixtures/diqStage3Fixture'

// ── Builder ─────────────────────────────────────────────────────────────────────

describe('buildDIQStage3Export', () => {
  it('builds a valid export from complete Stage 3 synthesis', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    expect(exp.exportKind).toBe('diq_stage3_resume_builder_basis')
    expect(exp.schemaVersion).toBe('1.0')
    expect(exp.source.diqSessionId).toBe('v4s_test_001')
    expect(exp.domainBasis.topic).toBe('AI-Assisted Product Discovery')
    expect(exp.domainBasis.thesis).toContain('AI-assisted product discovery')
    expect(exp.domainBasis.confidence).toBe('high')
  })

  it('marks strong insights as usable in resume', () => {
    const exp    = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const strong = exp.qualifiedInsights.filter(e => e.strength === 'strong')
    expect(strong.length).toBeGreaterThan(0)
    expect(strong.every(e => e.usableInResume === true)).toBe(true)
  })

  it('marks weak evidence as not usable and surfaces it in risk notes', () => {
    const exp  = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const weak = exp.qualifiedInsights.filter(e => e.strength === 'weak')
    expect(weak.length).toBeGreaterThan(0)
    expect(weak.every(e => e.usableInResume === false)).toBe(true)
    expect(exp.riskAndBoundaryNotes.weakEvidence.length).toBeGreaterThan(0)
    expect(exp.riskAndBoundaryNotes.weakEvidence[0]).toContain('false confidence')
  })

  it('preserves unresolved assumptions from evidence gaps and missing inputs', () => {
    const exp        = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const unresolved = exp.riskAndBoundaryNotes.unresolvedAssumptions
    expect(unresolved).toContain('No direct survey data on PM hiring preference for AI skills')
    expect(unresolved).toContain('Candidate-specific AI tool experience')
  })

  it('includes strategy menu as positioning angles and marks recommended entries', () => {
    const exp         = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const angles      = exp.resumePositioningBasis.strategyAngles
    expect(angles.length).toBe(2)
    const recommended = angles.filter(s => s.recommended)
    // "double down" and "selective investment" are both recommended postures
    expect(recommended.length).toBe(2)
    expect(angles[0].title).toBe('AI Discovery Trust Builder')
  })

  it('does not generate resume bullets', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    expect(exp.resumeBuilderInstructions.shouldGenerateResumeDirectly).toBe(false)
    expect('resumeBullets' in exp).toBe(false)
    expect('resumeSections' in exp).toBe(false)
  })

  it('detects staleness when stage2 id has changed since Stage 3 was generated', () => {
    const session = { ...DIQ_STAGE3_AI_PDLC_FIXTURE, stage2: { id: 'stage2_NEWER' } }
    const exp     = buildDIQStage3Export(session)
    expect(exp.source.stalenessWarning).toBe(true)
  })

  it('reports no staleness when stage2 id matches', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    expect(exp.source.stalenessWarning).toBe(false)
  })

  it('handles minimal session without crashing', () => {
    const minimal = {
      id:     'v4s_minimal',
      entity: { name: 'Test Domain' },
      stage3: { id: 'stage3_min', thesis: { text: 'Minimal thesis', confidence: 'Low' } },
    }
    const exp = buildDIQStage3Export(minimal)
    expect(exp.exportKind).toBe('diq_stage3_resume_builder_basis')
    expect(exp.qualifiedInsights).toEqual([])
    expect(exp.riskAndBoundaryNotes.unresolvedAssumptions).toEqual([])
    expect(exp.resumePositioningBasis.strategyAngles).toEqual([])
    expect(exp.domainBasis.confidence).toBe('low')
  })
})

// ── Validator ───────────────────────────────────────────────────────────────────

describe('validateDIQStage3Export', () => {
  it('accepts a valid export', () => {
    const exp    = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const result = validateDIQStage3Export(exp)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects wrong exportKind', () => {
    const exp    = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const result = validateDIQStage3Export({ ...exp, exportKind: 'wrong_kind' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('exportKind'))).toBe(true)
  })

  it('rejects missing diqSessionId', () => {
    const exp    = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const result = validateDIQStage3Export({ ...exp, source: { ...exp.source, diqSessionId: '' } })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('diqSessionId'))).toBe(true)
  })

  it('rejects missing domain topic', () => {
    const exp    = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const result = validateDIQStage3Export({ ...exp, domainBasis: { ...exp.domainBasis, topic: '' } })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('topic'))).toBe(true)
  })

  it('rejects missing resumeBuilderInstructions', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const { resumeBuilderInstructions: _dropped, ...withoutInstructions } = exp
    const result = validateDIQStage3Export(withoutInstructions)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('resumeBuilderInstructions'))).toBe(true)
  })

  it('rejects null and undefined input', () => {
    expect(validateDIQStage3Export(null).valid).toBe(false)
    expect(validateDIQStage3Export(undefined).valid).toBe(false)
  })
})

// ── Adapter ─────────────────────────────────────────────────────────────────────

describe('importDIQStage3Export', () => {
  it('maps DIQ positioning angles into ResumeBuilder strategy context', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const ctx = importDIQStage3Export(exp)
    expect(ctx.positioningContext.angles.length).toBeGreaterThan(0)
    expect(ctx.positioningContext.proofThemes.length).toBeGreaterThan(0)
    expect(ctx.positioningContext.keywords.length).toBeGreaterThan(0)
    expect(ctx.positioningContext.strategyAngles.length).toBe(2)
  })

  it('maps weak evidence and risks into guardrails', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const ctx = importDIQStage3Export(exp)
    expect(ctx.guardrails.claimsToAvoid.length).toBeGreaterThan(0)
    expect(ctx.guardrails.weakEvidence.length).toBeGreaterThan(0)
    expect(ctx.guardrails.riskyEvidenceIds.length).toBeGreaterThan(0)
  })

  it('separates usable evidence from risky evidence — strong/moderate are usable, weak are not', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const ctx = importDIQStage3Export(exp)
    expect(ctx.positioningContext.usableEvidence.length).toBeGreaterThan(0)
    expect(ctx.positioningContext.usableEvidence.every(e => e.strength !== 'weak')).toBe(true)
  })

  it('does not overwrite user resume content by default', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const ctx = importDIQStage3Export(exp)
    expect(ctx.generationGuidance.shouldOverwriteUserContent).toBe(false)
  })

  it('preserves unresolved assumptions as guardrails so ResumeBuilder avoids overstating them', () => {
    const exp = buildDIQStage3Export(DIQ_STAGE3_AI_PDLC_FIXTURE)
    const ctx = importDIQStage3Export(exp)
    expect(ctx.guardrails.unresolvedAssumptions.length).toBeGreaterThan(0)
    expect(ctx.guardrails.unresolvedAssumptions).toContain('Candidate-specific AI tool experience')
  })

  it('handles null input gracefully', () => {
    const ctx = importDIQStage3Export(null)
    expect(ctx.sourceKind).toBe('diq_stage3')
    expect(ctx.positioningContext.angles).toEqual([])
    expect(ctx.guardrails.claimsToAvoid).toEqual([])
    expect(ctx.generationGuidance.shouldOverwriteUserContent).toBe(false)
  })
})
