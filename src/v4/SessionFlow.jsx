import React, { useState, useEffect, useMemo } from 'react'
import { idbPut } from '../idb'
import IntentCapture from './IntentCapture'
import Stage1Panel from './Stage1Panel'
import Stage2Panel from './Stage2Panel'
import Stage2RerunReview from './Stage2RerunReview'
import Stage3Panel from './Stage3Panel'
import Stage4Panel from './Stage4Panel'
import Stage5Panel from './Stage5Panel'
import ChallengeModal from './ChallengeModal'
import { buildStage4SignalsPrompt, MOCK_STAGE4_SIGNALS, generateFallbackSignals } from '../v4stage4signals'
import { buildStage5Prompt, MOCK_STAGE5, COMPACT_GENERATION_LIMITS } from '../v4stage5'
import {
  captureSourceLearningSnapshot,
  checkStage5Freshness,
  generateStage1LearningSignals,
  generateStage2LearningSignals,
  generateStage3LearningSignals,
  buildStage5ReconcilePrompt,
  MOCK_STAGE5_UPDATE,
} from './learningSignals'
import {
  buildStage1Prompt,
  buildPressureTestPrompt,
  buildStage2Prompt,
  buildStage2ReconcilePrompt,
  buildPivotPrompt,
  buildStage3Prompt,
  buildStrategyOptionsUpdatePrompt,
  buildStrategyMenuPrompt,
  buildStage4ArtifactPrompt,
  MOCK_V4_STAGE1,
  MOCK_PRESSURE_TEST_RESULT_REVISE,
  MOCK_PRESSURE_TEST_RESULT_PRESERVE,
  MOCK_V4_STAGE2,
  MOCK_V4_STAGE2_RECONCILE,
  MOCK_PIVOT_RESULT,
  MOCK_V4_STAGE3,
  MOCK_STRATEGY_MENU,
  MOCK_STAGE4_ARTIFACT,
  buildStage4ArtifactRefinementPrompt,
  MOCK_STAGE4_ARTIFACT_REFINED,
} from '../v4prompts'
import {
  getDirectDeps,
  getDirectDownstream,
  buildAcceptedSummary,
  buildStage2ContextPacket,
  buildStage3ContextPacket,
  computeDiff,
  applyDiff,
  computePivotRecommendations,
  recommendTargetNodes,
  computeStage1BasisHash,
  computeStage3ContextHash,
  buildStage2Comparison,
  computeStage1Changes,
  classifyStage1ChangeSeverity,
  getReconcileImpactedSections,
  classifyStage2Response,
} from '../v4utils'
import { callClaude, callClaudeWithSearch } from '../api'

// step: 'intent' | 'generating' | 'inspect' | 'regenerating'
//     | 'stage2_generating' | 'stage2' | 'stage2_candidate_review'
//     | 'stage3_generating' | 'stage3' | 'stage4'
//     | 'stage5_generating' | 'stage5'
export default function SessionFlow({ sessionId, savedSession, globalPolicy, apiKeySet, onSave, onBack }) {
  const [step, setStep]           = useState(
    savedSession?.stage2RerunCandidate?.status === 'pending_review' ? 'stage2_candidate_review' :
    savedSession?.stage4?.artifacts?.length > 0 ? 'stage4' :
    savedSession?.stage3  ? 'stage3'  :
    savedSession?.stage2  ? 'stage2'  :
    savedSession?.stage1  ? 'inspect' : 'intent'
  )
  const [session, setSession]     = useState(savedSession || buildNewSession(sessionId, globalPolicy))
  const [challengingNodeId, setChallengeNodeId] = useState(null)
  const [diff, setDiff]           = useState(null)
  const [error, setError]         = useState(null)
  const [isUpdatingStrategyOptions, setIsUpdatingStrategyOptions] = useState(false)
  const [isGeneratingStrategyMenu, setIsGeneratingStrategyMenu]   = useState(false)
  const [isGeneratingSignals,      setIsGeneratingSignals]        = useState(false)
  const [isGeneratingStage5,       setIsGeneratingStage5]         = useState(false)

  // Persist whenever session changes
  useEffect(() => {
    if (session) onSave(sessionId, session)
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guard: if step resolved to a data-dependent step but the data is absent, fall back.
  useEffect(() => {
    if (step === 'stage2' && !session.stage2 && session.stage1) { setStep('inspect') }
    if (step === 'stage3' && !session.stage3 && session.stage2) { setStep('stage2') }
    if (step === 'stage4' && !session.stage4 && session.stage3) { setStep('stage3') }
    if (step === 'stage2_candidate_review' && !session.stage2RerunCandidate) { setStep('stage2') }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Backfill basis hash for pre-feature sessions — runs once per session id.
  // If hashes are already present this is a no-op (prev returned unchanged).
  useEffect(() => {
    setSession(prev => {
      if (!prev?.stage1) return prev

      const currentHash      = computeStage1BasisHash(prev.stage1)
      const needsSessionHash = !prev.stage1BasisHash
      const needsStage2Hash  = prev.stage2 && !prev.stage2.generatedFromStage1BasisHash

      if (!needsSessionHash && !needsStage2Hash) return prev

      return {
        ...prev,
        stage1BasisHash: needsSessionHash ? currentHash : prev.stage1BasisHash,
        stage2: needsStage2Hash
          ? { ...prev.stage2, generatedFromStage1BasisHash: currentHash }
          : prev.stage2,
      }
    })
  }, [session.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Intent submitted → run Stage 1 ──────────────────────────
  async function handleIntentSubmit(entity, intent) {
    const baseSession = {
      ...session,
      entity,
      intent,
      generationPolicy: { ...globalPolicy },
    }
    setSession(baseSession)
    setStep('generating')
    setError(null)

    try {
      let stage1Data

      if (!apiKeySet) {
        // Demo mode — short artificial delay then load mock
        await delay(1200)
        stage1Data = MOCK_V4_STAGE1
      } else {
        const prompt = buildStage1Prompt({
          entity,
          intent,
          policy: baseSession.generationPolicy,
        })
        const raw = await callClaude(prompt, 3500)
        stage1Data = parseJsonResponse(raw)
      }

      // Normalise nodes — ensure all required fields are present
      const nodes = (stage1Data.nodes || []).map(n => ({
        userStatus: 'pending', userNote: null, userPreset: null,
        previousStatement: null, changeReason: null, lastUpdated: null,
        ...n,
      }))

      const stage1 = {
        id:               'stage1_' + Date.now(),
        stageNumber:      1,
        generatedAt:      Date.now(),
        summary:          stage1Data.summary || '',
        nodes,
        openQuestions:    stage1Data.openQuestions || [],
        inferredPatterns: stage1Data.inferredPatterns || [],
        refinementHistory: [],
      }

      setSession(prev => ({ ...prev, stage1 }))
      setStep('inspect')
    } catch (e) {
      setError('Stage 1 generation failed. Check your API key and try again.')
      setStep('intent')
    }
  }

  // ── Node status change (accept / reject / needs_review) ─────
  function handleNodeStatusChange(nodeId, newStatus) {
    setSession(prev => {
      const updated = updateNode(prev, nodeId, { userStatus: newStatus })
      return { ...updated, stage1BasisHash: computeStage1BasisHash(updated.stage1) }
    })
  }

  // ── Open challenge modal ─────────────────────────────────────
  function handleChallengeClick(nodeId) {
    setChallengeNodeId(nodeId)
  }

  // ── Save challenge note from modal ───────────────────────────
  function handleChallengeSave(nodeId, preset, note) {
    setSession(prev => updateNode(prev, nodeId, {
      userStatus: 'challenged',
      userPreset: preset,
      userNote:   note,
    }))
    setChallengeNodeId(null)
  }

  // ── Needs review — system-directed precision hardening ────────
  function handleNeedsReviewClick(nodeId) {
    setSession(prev => updateNode(prev, nodeId, { userStatus: 'needs_review' }))
    handleRegenNode(nodeId, 'system_review')
  }

  // ── Pressure test / system review for a single node ──────────
  async function handleRegenNode(nodeId, mode = 'user_challenge') {
    const nodes = session.stage1.nodes
    const challengedNode = nodes.find(n => n.id === nodeId)
    if (!challengedNode) return

    setStep('regenerating')
    setDiff(null)
    setError(null)

    try {
      const directDeps       = getDirectDeps(challengedNode, nodes)
      const directDownstream = getDirectDownstream(challengedNode, nodes)
      const acceptedSummary  = buildAcceptedSummary(nodes)

      let ptResult
      let rawSearchBlocks = []

      if (!apiKeySet) {
        // Demo mode — system_review always uses preserve mock; challenge on n3 uses revise mock
        await delay(1400)
        if (nodeId === 'n3' && mode !== 'system_review') {
          const mock = MOCK_PRESSURE_TEST_RESULT_REVISE
          ptResult = mock.ptResult
          rawSearchBlocks = mock.rawSearchBlocks
        } else {
          const mock = MOCK_PRESSURE_TEST_RESULT_PRESERVE
          ptResult = { ...mock.ptResult, challengedNodeId: nodeId }
          rawSearchBlocks = mock.rawSearchBlocks
        }
      } else {
        const prompt = buildPressureTestPrompt({
          challengedNode,
          directDeps,
          directDownstream,
          intent:         session.intent,
          policy:         session.generationPolicy,
          policyOverride: null,
          acceptedSummary,
          mode,
        })
        const { text, rawSearchBlocks: blocks } = await callClaudeWithSearch(prompt, 3500)
        rawSearchBlocks = blocks
        ptResult = JSON.parse(text)
        // Safety net: Claude occasionally omits challengedNodeId from response.
        // Patch it back from the nodeId we issued the pressure test for.
        if (!ptResult.challengedNodeId) {
          ptResult = { ...ptResult, challengedNodeId: nodeId }
        }
      }

      // Validate new shape — if decision field missing, this is the old shape
      if (!ptResult.decision) {
        setError('Incompatible response shape — expected "decision" field. Old regeneration result received. Discard and try again.')
        setStep('inspect')
        return
      }

      const newDiff = computeDiff(nodes, ptResult)
      // Attach full ptResult + raw search evidence to the diff object
      newDiff._ptResult = ptResult
      newDiff._rawSearchBlocks = rawSearchBlocks

      setDiff(newDiff)
      setStep('inspect')

      // Record in refinement history
      const nodesChanged = ptResult.decision === 'revise_claim' && ptResult.revisedNode
        ? [ptResult.revisedNode.id, ...(ptResult.updatedDownstream || []).map(n => n.id)]
        : []

      const record = {
        triggeredBy:    nodeId,
        decision:       ptResult.decision,
        userNote:       challengedNode.userNote,
        timestamp:      Date.now(),
        policyOverride: null,
        nodesChanged,
        mode,
      }
      setSession(prev => ({
        ...prev,
        stage1: {
          ...prev.stage1,
          refinementHistory: [...(prev.stage1.refinementHistory || []), record],
        },
      }))
    } catch (e) {
      setError(`Pressure test failed: ${e.message}`)
      setStep('inspect')
    }
  }

  // ── Apply assessment — three decision paths ───────────────────
  function handleAcceptDiff() {
    if (!diff?._ptResult) return
    const updatedNodes = applyDiff(session.stage1.nodes, diff._ptResult)
    setSession(prev => {
      const newStage1 = { ...prev.stage1, nodes: updatedNodes }
      return {
        ...prev,
        stage1:          newStage1,
        stage1BasisHash: computeStage1BasisHash(newStage1),
      }
    })
    setDiff(null)
  }

  // ── Discard diff — keep original nodes, keep challenge status ─
  function handleDiscardDiff() {
    setDiff(null)
  }

  // ── Run Stage 2 ───────────────────────────────────────────────
  //
  // First run (no existing stage2): direct write, as before.
  // Rerun (existing stage2 present): generate into stage2RerunCandidate and
  // enter the review flow — the existing stage2 is NOT modified.
  async function handleRunStage2() {
    const isRerun = !!session.stage2

    setStep('stage2_generating')
    setError(null)

    try {
      let stage2Data

      if (!apiKeySet) {
        await delay(2000)
        stage2Data = { ...MOCK_V4_STAGE2 }
      } else {
        const ctx = buildStage2ContextPacket(session)
        const prompt = buildStage2Prompt({
          entity:           ctx.entity,
          intent:           ctx.intent,
          policy:           session.generationPolicy,
          stage1Summary:    ctx.stage1Summary,
          acceptedNodes:    ctx.acceptedNodes,
          refinedNodes:     ctx.refinedNodes,
          unresolvedNodes:  ctx.unresolvedNodes,
          openQuestions:    ctx.openQuestions,
          inferredPatterns: ctx.inferredPatterns,
        })
        const { text, rawSearchBlocks } = await callClaudeWithSearch(prompt, 5500, 5)

        // --- Stage 2 schema guard ---
        // Parse with an explicit try/catch so a JSON failure doesn't silently fall
        // through to the outer catch (which would wipe the step without saving raw output).
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch (parseErr) {
          idbPut('rawResponses', {
            id:         'raw_stage2_' + Date.now(),
            sessionId,
            type:       'parse_failure',
            rawText:    text,
            error:      parseErr.message,
            capturedAt: Date.now(),
          }).catch(() => {})
          setError('Stage 2 response could not be parsed as JSON. Previous output preserved. Raw response saved for inspection.')
          setStep(isRerun ? 'stage2' : 'inspect')
          return
        }

        const responseClass = classifyStage2Response(parsed)
        if (responseClass !== 'valid') {
          idbPut('rawResponses', {
            id:         'raw_stage2_' + Date.now(),
            sessionId,
            type:       responseClass,   // 'pressure_test_fallback' | 'malformed'
            rawData:    parsed,
            capturedAt: Date.now(),
          }).catch(() => {})
          setError(
            responseClass === 'pressure_test_fallback'
              ? 'Stage 2 returned a pressure-test response instead of research expansion. Previous Stage 2 data is preserved.'
              : 'Stage 2 response did not match expected schema. Previous Stage 2 data is preserved. Raw response saved for inspection.'
          )
          setStep(isRerun ? 'stage2' : 'inspect')
          return
        }

        stage2Data = parsed
        stage2Data._rawSearchBlocks = rawSearchBlocks
      }

      // Normalise refinedAssertions — ensure userStatus is present
      stage2Data.refinedAssertions = (stage2Data.refinedAssertions || []).map(r => ({
        userStatus: 'pending',
        ...r,
      }))

      if (!isRerun) {
        // ── First run — direct write ──────────────────────────
        const stage2 = {
          id:          'stage2_' + Date.now(),
          stageNumber: 2,
          generatedAt: Date.now(),
          ...stage2Data,
          pivots: [],  // pivot accumulation layer — not part of orientation pass schema
        }
        setSession(prev => ({
          ...prev,
          stage2: {
            ...stage2,
            generatedFromStage1BasisHash: prev.stage1BasisHash ?? computeStage1BasisHash(prev.stage1),
            // Snapshot of Stage 1 nodes at generation time — used for change classification.
            stage1Snapshot: (prev.stage1?.nodes || []).map(n => ({
              id: n.id, statement: n.statement, confidence: n.confidence, userStatus: n.userStatus,
            })),
          },
        }))
        setStep('stage2')
      } else {
        // ── Rerun — generate candidate, build comparison, enter review ──
        const currentHash  = session.stage1BasisHash ?? computeStage1BasisHash(session.stage1)
        const comparison   = buildStage2Comparison(session.stage2, stage2Data)

        const candidate = {
          id:                          'stage2_candidate_' + Date.now(),
          generatedAt:                 Date.now(),
          generatedFromStage1BasisHash: currentHash,
          candidate:                   stage2Data,
          comparison,
          status:                      'pending_review',
        }

        setSession(prev => ({ ...prev, stage2RerunCandidate: candidate }))
        setStep('stage2_candidate_review')
      }
    } catch (e) {
      setError(`Stage 2 generation failed: ${e.message}`)
      setStep(isRerun ? 'stage2' : 'inspect')
    }
  }

  // ── Stage 2 candidate: update a single artifact decision ─────
  function handleUpdateCandidateArtifact(artifactId, changes) {
    setSession(prev => ({
      ...prev,
      stage2RerunCandidate: {
        ...prev.stage2RerunCandidate,
        comparison: prev.stage2RerunCandidate.comparison.map(a =>
          a.id === artifactId ? { ...a, ...changes } : a
        ),
      },
    }))
  }

  // ── Stage 2 candidate: apply approved changes to session.stage2 ─
  //
  // Merge rules per artifact:
  //   approved → use proposedValue
  //   refined  → use refinedValue (falls back to proposedValue if null)
  //   rejected | pending → keep currentValue (no write)
  //
  // Pivots are ALWAYS preserved from the existing session.stage2.
  // generatedFromStage1BasisHash is updated to the candidate hash,
  // marking Stage 2 as current with the new Stage 1 basis — even if
  // the user rejected all artifact changes.
  function handleApplyStage2Candidate() {
    const candidate = session.stage2RerunCandidate
    if (!candidate) return

    setSession(prev => {
      let updated = { ...prev.stage2 }

      for (const artifact of candidate.comparison) {
        if (artifact.userStatus === 'approved') {
          updated[artifact.section] = artifact.proposedValue
        } else if (artifact.userStatus === 'refined') {
          updated[artifact.section] = artifact.refinedValue ?? artifact.proposedValue
        }
        // 'rejected' and 'pending' → no change; currentValue remains
      }

      return {
        ...prev,
        stage2: {
          ...updated,
          generatedFromStage1BasisHash: candidate.generatedFromStage1BasisHash,
          // Refresh snapshot to current Stage 1 nodes so future change detection is accurate.
          stage1Snapshot: (prev.stage1?.nodes || []).map(n => ({
            id: n.id, statement: n.statement, confidence: n.confidence, userStatus: n.userStatus,
          })),
          // pivots preserved from prev.stage2 (already in updated via spread)
        },
        stage2RerunCandidate: null,
      }
    })
    setStep('stage2')
  }

  // ── Stage 2 candidate: discard — leave session.stage2 untouched ─
  function handleDiscardStage2Candidate() {
    setSession(prev => ({ ...prev, stage2RerunCandidate: null }))
    setStep('stage2')
  }

  // ── Update basis only (cosmetic severity) ────────────────────────────────
  // Marks Stage 2 as current with the new Stage 1 basis without any LLM call.
  // Used when Stage 1 changes are purely status/accept-reject with no text changes.
  // Refreshes stage1Snapshot so future change detection has an accurate reference point.
  function handleUpdateBasisOnly() {
    setSession(prev => ({
      ...prev,
      stage2: {
        ...prev.stage2,
        generatedFromStage1BasisHash: prev.stage1BasisHash ?? computeStage1BasisHash(prev.stage1),
        stage1Snapshot: (prev.stage1?.nodes || []).map(n => ({
          id: n.id, statement: n.statement, confidence: n.confidence, userStatus: n.userStatus,
        })),
      },
    }))
  }

  // ── Reconcile — targeted Stage 2 update for narrow Stage 1 changes ───────
  //
  // Generates only the impacted Stage 2 sections via a targeted prompt.
  // The reconcile result is overlaid on the current stage2 before comparison so
  // that untouched sections produce no diff artifacts — the review only shows
  // the sections that actually changed.
  async function handleRunStage2Reconcile(changedNodes, impactedSections) {
    setStep('stage2_generating')
    setError(null)

    try {
      let reconcileData

      if (!apiKeySet) {
        await delay(2000)
        // In demo mode: extract mock data for impacted sections only.
        // Fall back to the current session.stage2 value so unchanged sections
        // are never incorrectly flagged as different.
        reconcileData = {}
        for (const key of impactedSections) {
          reconcileData[key] = MOCK_V4_STAGE2_RECONCILE[key] !== undefined
            ? MOCK_V4_STAGE2_RECONCILE[key]
            : session.stage2[key]
        }
      } else {
        const ctx = buildStage2ContextPacket(session)
        // Collect the current Stage 2 section values for impacted sections only
        const currentSections = {}
        for (const key of impactedSections) {
          currentSections[key] = session.stage2[key]
        }
        const prompt = buildStage2ReconcilePrompt({
          entity:               ctx.entity,
          intent:               ctx.intent,
          policy:               session.generationPolicy,
          stage1Summary:        ctx.stage1Summary,
          acceptedNodes:        ctx.acceptedNodes,
          changedNodes,
          currentStage2Sections: currentSections,
          sectionsToUpdate:     impactedSections,
        })
        const { text, rawSearchBlocks } = await callClaudeWithSearch(prompt, 4000, 3)
        reconcileData = JSON.parse(text)
        reconcileData._rawSearchBlocks = rawSearchBlocks
      }

      // Normalize refinedAssertions if present
      if (reconcileData.refinedAssertions) {
        reconcileData.refinedAssertions = reconcileData.refinedAssertions.map(r => ({
          userStatus: 'pending',
          ...r,
        }))
      }

      // Overlay reconcileData onto current stage2 so only impacted sections differ.
      // Sections absent from reconcileData match exactly → produce no diff artifacts.
      const virtualCandidate = { ...session.stage2, ...reconcileData }
      const comparison = buildStage2Comparison(session.stage2, virtualCandidate)

      const currentHash = session.stage1BasisHash ?? computeStage1BasisHash(session.stage1)

      const candidate = {
        id:                          'stage2_candidate_' + Date.now(),
        generatedAt:                 Date.now(),
        generatedFromStage1BasisHash: currentHash,
        mode:                        'reconcile',
        changedStage1Nodes:          changedNodes,
        impactedSections,
        candidate:                   reconcileData,
        comparison,
        status:                      'pending_review',
      }

      setSession(prev => ({ ...prev, stage2RerunCandidate: candidate }))
      setStep('stage2_candidate_review')
    } catch (e) {
      setError(`Stage 2 reconcile failed: ${e.message}`)
      setStep('stage2')
    }
  }

  // ── Run Stage 3 ───────────────────────────────────────────────
  async function handleRunStage3() {
    setStep('stage3_generating')
    setError(null)

    try {
      let stage3Data

      if (!apiKeySet) {
        await delay(2000)
        stage3Data = { ...MOCK_V4_STAGE3 }
      } else {
        const ctx = buildStage3ContextPacket(session)
        const prompt = buildStage3Prompt({ ...ctx })
        // Stage 3 has 9 output sections; rich sessions regularly reach 7–8k tokens.
        // 10 000 gives headroom without approaching model limits.
        const raw = await callClaude(prompt, 10000)
        stage3Data = parseJsonResponse(raw)
      }

      const stage3 = {
        id:                             'stage3_' + Date.now(),
        stageNumber:                    3,
        generatedAt:                    Date.now(),
        generatedFromStage2Id:          session.stage2?.id || null,
        generatedFromStage3ContextHash: computeStage3ContextHash(session),
        ...stage3Data,
      }

      setSession(prev => ({ ...prev, stage3 }))
      setStep('stage3')
    } catch (e) {
      setError(`Stage 3 generation failed: ${e.message}`)
      setStep('stage2')
    }
  }

  // ── Stage 3 Evidence Map refinement ──────────────────────────────────────────

  function handleApplyEvidenceRefinement(itemIndex, logEntry) {
    setSession(prev => {
      const evidenceMap = [...(prev.stage3?.evidenceMap || [])]
      const item = { ...(evidenceMap[itemIndex] || {}) }
      item.refinementLog = [...(item.refinementLog || []), logEntry]
      if (logEntry.applied && logEntry.appliedUpdate) {
        const u = logEntry.appliedUpdate
        if ('observation'  in u) item.observation  = u.observation
        if ('evidenceBasis' in u) item.evidenceBasis = u.evidenceBasis
        if ('implication'  in u) item.implication  = u.implication
        if ('strength'     in u) item.strength     = u.strength
        item._refined = true
      }
      evidenceMap[itemIndex] = item
      return { ...prev, stage3: { ...prev.stage3, evidenceMap } }
    })
  }

  function handleMarkStrategyStale() {
    setSession(prev => ({
      ...prev,
      stage3: { ...prev.stage3, _strategyMenuNeedsRefresh: true },
    }))
  }

  async function handleUpdateStrategyOptions() {
    if (!session.stage3) return
    setIsUpdatingStrategyOptions(true)
    setError(null)
    try {
      let updatedOptions
      if (!apiKeySet) {
        await new Promise(r => setTimeout(r, 1500))
        updatedOptions = session.stage3.strategicOptions || []
      } else {
        const prompt = buildStrategyOptionsUpdatePrompt({
          thesis:                 session.stage3.thesis?.text,
          refinedEvidenceMap:     session.stage3.evidenceMap || [],
          insightClusters:        session.stage3.insightClusters || [],
          risks:                  session.stage3.risksConstraintsUnknowns || [],
          currentStrategicOptions: session.stage3.strategicOptions || [],
        })
        const raw = await callClaude(prompt, 4000)
        const parsed = parseJsonResponse(raw)
        updatedOptions = parsed.strategicOptions || []
      }
      setSession(prev => ({
        ...prev,
        stage3: {
          ...prev.stage3,
          strategicOptions:          updatedOptions,
          _strategyMenuNeedsRefresh: false,
          _previousStrategicOptions: prev.stage3.strategicOptions,
        },
      }))
    } catch (e) {
      setError(`Strategy options update failed: ${e.message}`)
    } finally {
      setIsUpdatingStrategyOptions(false)
    }
  }

  // ── Strategy Menu generation (separate call, not bundled into Stage 3) ────────
  async function handleGenerateStrategyMenu() {
    if (!session.stage3) return
    setIsGeneratingStrategyMenu(true)
    setError(null)
    try {
      let menuData
      if (!apiKeySet) {
        await delay(1800)
        menuData = MOCK_STRATEGY_MENU
      } else {
        const prompt = buildStrategyMenuPrompt({
          thesis:           session.stage3.thesis,
          evidenceMap:      session.stage3.evidenceMap || [],
          insightClusters:  session.stage3.insightClusters || [],
          risks:            session.stage3.risksConstraintsUnknowns || [],
          strategicOptions: session.stage3.strategicOptions || [],
          entity:           session.entity,
        })
        const raw = await callClaude(prompt, 8000)
        menuData = parseJsonResponse(raw)
      }
      setSession(prev => ({
        ...prev,
        stage3: { ...prev.stage3, strategyMenu: menuData.strategyMenu || [] },
      }))
    } catch (e) {
      setError(`Strategy menu generation failed: ${e.message}`)
    } finally {
      setIsGeneratingStrategyMenu(false)
    }
  }

  // ── Stage 4 artifact generation ───────────────────────────────────────────────
  // Creates an artifact entry immediately (status: 'generating'), switches to
  // Stage 4, then fills in the result asynchronously so the tab is visible
  // while the API call runs.
  async function handleGenerateStage4Artifact({ strategyOption, persona }) {
    const artifactId = 'art_' + Date.now()
    const stub = {
      id:                 artifactId,
      sourceStrategyId:   strategyOption.id,
      sourceStrategyName: strategyOption.strategyName,
      strategyPosture:    strategyOption.investmentPosture,
      persona,
      generatedAt:        Date.now(),
      status:             'generating',
      data:               null,
      errorMessage:       null,
    }

    // Add stub and navigate to Stage 4 immediately
    setSession(prev => ({
      ...prev,
      stage4: {
        ...prev.stage4,
        artifacts:        [...((prev.stage4?.artifacts) || []), stub],
        activeArtifactId: artifactId,
      },
    }))
    setStep('stage4')

    try {
      let artifactData
      if (!apiKeySet) {
        await delay(2000)
        artifactData = MOCK_STAGE4_ARTIFACT
      } else {
        const prompt = buildStage4ArtifactPrompt({
          entity:           session.entity,
          thesis:           session.stage3?.thesis,
          evidenceMap:      session.stage3?.evidenceMap || [],
          insightClusters:  session.stage3?.insightClusters || [],
          risks:            session.stage3?.risksConstraintsUnknowns || [],
          selectedStrategy: strategyOption,
          persona,
        })
        const raw = await callClaude(prompt, 4000)
        artifactData = parseJsonResponse(raw)
      }
      const v1 = {
        id:               artifactId + '_v1',
        versionNumber:    1,
        createdAt:        Date.now(),
        refinementContext: null,
        changeSummary:    null,
        data:             artifactData,
      }
      // Guard: artifact may have been deleted while generation was in flight
      setSession(prev => {
        if (!(prev.stage4?.artifacts || []).find(a => a.id === artifactId)) return prev
        return {
          ...prev,
          stage4: {
            ...prev.stage4,
            artifacts: (prev.stage4?.artifacts || []).map(a =>
              a.id !== artifactId ? a : {
                ...a,
                status:          'complete',
                data:            artifactData,
                versions:        [v1],
                activeVersionId: v1.id,
              }
            ),
          },
        }
      })
    } catch (e) {
      setSession(prev => {
        if (!(prev.stage4?.artifacts || []).find(a => a.id === artifactId)) return prev
        return {
          ...prev,
          stage4: {
            ...prev.stage4,
            artifacts: (prev.stage4?.artifacts || []).map(a =>
              a.id !== artifactId ? a : { ...a, status: 'error', errorMessage: e.message }
            ),
          },
        }
      })
    }
  }

  // ── Stage 4 artifact refinement ───────────────────────────────────────────────
  // Revises an existing artifact with added user context. Preserves the prior
  // version and appends a new version; sets activeVersionId to the new version.
  async function handleRefineStage4Artifact({ artifactId, refinementContext }) {
    const artifact = session.stage4?.artifacts?.find(a => a.id === artifactId)
    if (!artifact) return

    // Build base versions — backward compat for artifacts without .versions
    const baseVersions = artifact.versions?.length > 0
      ? artifact.versions
      : [{
          id:               artifact.id + '_v1',
          versionNumber:    1,
          createdAt:        artifact.generatedAt || Date.now(),
          refinementContext: null,
          changeSummary:    null,
          data:             artifact.data,
        }]

    const activeVersion = artifact.activeVersionId
      ? baseVersions.find(v => v.id === artifact.activeVersionId)
      : baseVersions[baseVersions.length - 1]

    const sourceStrategy = (session.stage3?.strategyMenu || []).find(s => s.id === artifact.sourceStrategyId)
      || { strategyName: artifact.sourceStrategyName, investmentPosture: artifact.strategyPosture }

    // Mark refining — keeps existing content visible, shows "Refining…" in tab
    setSession(prev => ({
      ...prev,
      stage4: {
        ...prev.stage4,
        artifacts: (prev.stage4?.artifacts || []).map(a =>
          a.id !== artifactId ? a : { ...a, refineStatus: 'refining', refineError: null }
        ),
      },
    }))

    try {
      let refinedData
      if (!apiKeySet) {
        await delay(2200)
        refinedData = MOCK_STAGE4_ARTIFACT_REFINED
      } else {
        const prompt = buildStage4ArtifactRefinementPrompt({
          entity:             session.entity,
          currentVersionData: activeVersion?.data || artifact.data,
          selectedStrategy:   sourceStrategy,
          persona:            artifact.persona,
          refinementContext,
          versionNumber:      baseVersions.length,
        })
        const raw = await callClaude(prompt, 4000)
        refinedData = parseJsonResponse(raw)
      }

      const newVersionId = artifactId + '_v' + (baseVersions.length + 1)
      const newVersion = {
        id:               newVersionId,
        versionNumber:    baseVersions.length + 1,
        createdAt:        Date.now(),
        refinementContext,
        changeSummary:    refinedData.changeSummary || '',
        data:             refinedData,
      }

      setSession(prev => ({
        ...prev,
        stage4: {
          ...prev.stage4,
          artifacts: (prev.stage4?.artifacts || []).map(a =>
            a.id !== artifactId ? a : {
              ...a,
              data:            refinedData,
              versions:        [...baseVersions, newVersion],
              activeVersionId: newVersionId,
              refineStatus:    null,
              refineError:     null,
            }
          ),
        },
      }))
    } catch (e) {
      setSession(prev => ({
        ...prev,
        stage4: {
          ...prev.stage4,
          artifacts: (prev.stage4?.artifacts || []).map(a =>
            a.id !== artifactId ? a : { ...a, refineStatus: 'error', refineError: e.message }
          ),
        },
      }))
    }
  }

  // ── Stage 4 artifact deletion ─────────────────────────────────────────────────
  // Removes the artifact record entirely from session.stage4.artifacts.
  // activeArtifactId in session state is updated in the same transaction.
  // Selection reassignment within Stage4Panel is handled by local state there.
  function handleDeleteStage4Artifact({ artifactId }) {
    setSession(prev => {
      const toDelete  = (prev.stage4?.artifacts || []).find(a => a.id === artifactId)
      const artifacts = (prev.stage4?.artifacts || []).filter(a => a.id !== artifactId)
      const currentActive = prev.stage4?.activeArtifactId
      // Capture lightweight metadata so signal generation can produce negative_learning_signal entries
      const deletionRecord = toDelete ? {
        id:           toDelete.id,
        title:        toDelete.sourceStrategyName || 'Unknown strategy',
        persona:      toDelete.persona?.role || null,
        posture:      toDelete.strategyPosture || null,
        versionCount: (toDelete.versions || []).length,
        deletedAt:    Date.now(),
        deleteReason: null,
      } : null
      return {
        ...prev,
        stage4: {
          ...prev.stage4,
          artifacts,
          activeArtifactId: currentActive === artifactId
            ? (artifacts[0]?.id || null)
            : currentActive,
          deletedArtifactMetadata: [
            ...(prev.stage4?.deletedArtifactMetadata || []),
            ...(deletionRecord ? [deletionRecord] : []),
          ],
        },
      }
    })
  }

  // ── Stage 4 active artifact selection (persists tab pick to session) ─────────
  function handleSetActiveArtifact({ artifactId }) {
    setSession(prev => {
      if (!prev.stage4) return prev
      return {
        ...prev,
        stage4: { ...prev.stage4, activeArtifactId: artifactId },
      }
    })
  }

  // ── Stage 4 learning signals ──────────────────────────────────────────────────
  async function handleGenerateStage4Signals() {
    const completedArtifacts = (session.stage4?.artifacts || []).filter(a => a.status === 'complete')
    if (completedArtifacts.length === 0) return
    setIsGeneratingSignals(true)
    const now = Date.now()
    try {
      let signals = []; let generationMode = 'api'
      if (!apiKeySet) {
        await delay(1600)
        signals = enrichSignals(MOCK_STAGE4_SIGNALS.learningSignals || [], now)
        generationMode = 'mock'
      } else {
        const prompt = buildStage4SignalsPrompt({ session })
        if (!prompt) { setIsGeneratingSignals(false); return }
        const raw    = await callClaude(prompt, 3000)
        const parsed = safeParseSignals(raw)
        if (parsed.ok && parsed.signals.length > 0) {
          signals = enrichSignals(parsed.signals, now); generationMode = 'api'
        } else {
          const fallback = generateFallbackSignals(completedArtifacts, now)
          if (fallback.length > 0) { signals = fallback; generationMode = 'fallback' }
          else {
            setSession(prev => ({ ...prev, stage4: { ...prev.stage4, signalsMeta: {
              status: 'error', errorType: parsed.errorType,
              errorMessage: getSignalErrorMessage(parsed.errorType),
              failedAt: now, rawPreview: parsed.rawPreview, count: 0, generationMode: null, generatedAt: null,
            }}}))
            setIsGeneratingSignals(false); return
          }
        }
      }
      setSession(prev => ({ ...prev, stage4: { ...prev.stage4,
        learningSignals: signals, signalsGeneratedAt: now,
        signalsMeta: { status: 'current', generationMode, count: signals.length, generatedAt: now,
          errorType: null, errorMessage: null, failedAt: null, rawPreview: null },
      }}))
    } catch (e) {
      setSession(prev => ({ ...prev, stage4: { ...prev.stage4, signalsMeta: {
        status: 'error', errorType: 'parse_error', errorMessage: `Generation failed: ${e.message}`,
        failedAt: now, rawPreview: null, count: 0, generationMode: null, generatedAt: null,
      }}}))
    } finally { setIsGeneratingSignals(false) }
  }

  // ── Stage 5 generation ────────────────────────────────────────────────────────
  async function handleGenerateStage5() {
    setIsGeneratingStage5(true)
    setStep('stage5_generating')
    setError(null)
    try {
      let workingSession       = session
      const completedArtifacts = (workingSession.stage4?.artifacts || []).filter(a => a.status === 'complete')
      const existingSignals    = workingSession.stage4?.learningSignals || []
      const signalsMeta        = workingSession.stage4?.signalsMeta
      const hasValidSignals    = existingSignals.length > 0 && signalsMeta?.status !== 'error'
      const shouldAutoGenerate = !hasValidSignals && signalsMeta?.status !== 'error' && completedArtifacts.length > 0

      if (shouldAutoGenerate) {
        const s4Now = Date.now(); let s4Signals = []; let s4Mode = 'api'
        if (!apiKeySet) {
          await delay(1200)
          s4Signals = enrichSignals(MOCK_STAGE4_SIGNALS.learningSignals || [], s4Now); s4Mode = 'mock'
        } else {
          const prompt = buildStage4SignalsPrompt({ session: workingSession })
          if (prompt) {
            const raw    = await callClaude(prompt, 3000)
            const parsed = safeParseSignals(raw)
            if (parsed.ok && parsed.signals.length > 0) { s4Signals = enrichSignals(parsed.signals, s4Now); s4Mode = 'api' }
            else {
              const fallback = generateFallbackSignals(completedArtifacts, s4Now)
              if (fallback.length > 0) { s4Signals = fallback; s4Mode = 'fallback' }
            }
          }
        }
        workingSession = { ...workingSession, stage4: { ...workingSession.stage4,
          learningSignals: s4Signals, signalsGeneratedAt: s4Now,
          signalsMeta: s4Signals.length > 0
            ? { status: 'current', generationMode: s4Mode, count: s4Signals.length, generatedAt: s4Now, errorType: null, errorMessage: null, failedAt: null, rawPreview: null }
            : workingSession.stage4?.signalsMeta,
        }}
        setSession(workingSession)
      }

      let stage5Data
      let stage5Meta = null
      if (!apiKeySet) {
        await delay(2200); stage5Data = MOCK_STAGE5
        stage5Meta = {
          status: 'complete', generationPartial: false, truncationDetected: false,
          completedArrays: ['learningSignals', 'refinementTriggers', 'reusablePatterns'],
          missingArrays: [], outputBudget: COMPACT_GENERATION_LIMITS,
          generatedAt: null, errorMessage: null,
        }
      } else {
        const prompt  = buildStage5Prompt({ session: workingSession })
        // 4000 tokens is enough for compact output (5-8 signals + 3-4 triggers + 3-4 patterns
        // at strict word limits). Prior 6000 caused verbose outputs that truncated triggers.
        const raw     = await callClaude(prompt, 4000)
        const parsed  = safeParseStage5(raw)
        if (!parsed.ok) throw new Error('Stage 5 output could not be parsed. Try regenerating.')
        stage5Data    = parsed.data
        stage5Meta    = { ...(parsed.meta || {}), outputBudget: COMPACT_GENERATION_LIMITS }
      }

      const s5Now = Date.now()
      setSession(prev => {
        const nextSession = {
          ...prev,
          stage4: workingSession.stage4 !== session.stage4 ? workingSession.stage4 : prev.stage4,
          stage5: {
            learningSignals:    stage5Data.learningSignals    || [],
            reusablePatterns:   stage5Data.reusablePatterns   || [],
            refinementTriggers: stage5Data.refinementTriggers || [],
            generatedAt:        s5Now,
            updatedAt:          s5Now,
            generationPartial:  stage5Meta?.generationPartial ?? false,
            generationMeta:     { ...(stage5Meta || {}), generatedAt: s5Now, errorMessage: null },
          },
        }
        nextSession.stage5.sourceLearningSnapshot = captureSourceLearningSnapshot(nextSession)
        nextSession.stage5.freshness              = { isStale: false, staleSince: null }
        nextSession.stage5.updateHistory          = []
        return nextSession
      })
      setStep('stage5')
    } catch (e) {
      setError(`Stage 5 generation failed: ${e.message}`)
      setStep(session.stage4 ? 'stage4' : 'stage3')
    } finally { setIsGeneratingStage5(false) }
  }

  // ── Stage 5 — Update from latest learning signals ────────────────────────────
  async function handleUpdateStage5FromLatest() {
    if (!session.stage5) return
    setIsGeneratingStage5(true)
    setError(null)
    const freshness   = stage5Freshness
    const staleStages = freshness?.staleStages || []
    const now         = Date.now()
    try {
      const extraSignals = []
      if (staleStages.includes('stage1')) extraSignals.push(...generateStage1LearningSignals(session, now))
      if (staleStages.includes('stage2')) extraSignals.push(...generateStage2LearningSignals(session, now))
      if (staleStages.includes('stage3')) extraSignals.push(...generateStage3LearningSignals(session, now))

      let workingSession = session
      if (staleStages.includes('stage4')) {
        const completedArtifacts = (session.stage4?.artifacts || []).filter(a => a.status === 'complete')
        const existingSignals    = session.stage4?.learningSignals || []
        const hasValidSignals    = existingSignals.length > 0 && session.stage4?.signalsMeta?.status !== 'error'
        if (!hasValidSignals && completedArtifacts.length > 0) {
          const s4Now = now; let s4Signals = []; let s4Mode = 'api'
          if (!apiKeySet) {
            s4Signals = enrichSignals(MOCK_STAGE4_SIGNALS.learningSignals || [], s4Now); s4Mode = 'mock'
          } else {
            const prompt = buildStage4SignalsPrompt({ session: workingSession })
            if (prompt) {
              const raw    = await callClaude(prompt, 3000)
              const parsed = safeParseSignals(raw)
              if (parsed.ok && parsed.signals.length > 0) { s4Signals = enrichSignals(parsed.signals, s4Now); s4Mode = 'api' }
              else { const fb = generateFallbackSignals(completedArtifacts, s4Now); if (fb.length > 0) { s4Signals = fb; s4Mode = 'fallback' } }
            }
          }
          if (s4Signals.length > 0) {
            workingSession = { ...workingSession, stage4: { ...workingSession.stage4,
              learningSignals: s4Signals, signalsGeneratedAt: s4Now,
              signalsMeta: { status: 'current', generationMode: s4Mode, count: s4Signals.length, generatedAt: s4Now, errorType: null, errorMessage: null, failedAt: null, rawPreview: null },
            }}
          }
        }
      }

      let updateData
      if (!apiKeySet) {
        await delay(1800); updateData = MOCK_STAGE5_UPDATE
      } else {
        const prompt = buildStage5ReconcilePrompt({ session: workingSession, priorStage5: session.stage5, freshness })
        const raw    = await callClaude(prompt, 5000)
        let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
        try { updateData = JSON.parse(text) } catch (_) { updateData = MOCK_STAGE5_UPDATE }
      }

      const prior = session.stage5
      const merged = {
        learningSignals:    updateData.learningSignals    || prior.learningSignals    || [],
        reusablePatterns:   updateData.reusablePatterns   || prior.reusablePatterns   || [],
        refinementTriggers: updateData.refinementTriggers || prior.refinementTriggers || [],
        generatedAt:        prior.generatedAt,
        updatedAt:          now,
      }
      const historyEntry = {
        updatedAt: now, staleStages, changeSummary: updateData.changeSummary || `Reconciled from ${staleStages.join(', ')} changes.`,
        addedSignalIds: updateData.addedSignalIds || [], updatedPatternIds: updateData.updatedPatternIds || [],
        retiredPatternIds: updateData.retiredPatternIds || [], retiredSignalIds: updateData.retiredSignalIds || [],
        extraSignalsAdded: extraSignals.length,
      }
      setSession(prev => {
        const nextSession = { ...prev,
          stage4: workingSession.stage4 !== session.stage4 ? workingSession.stage4 : prev.stage4,
          stage5: { ...merged,
            sourceLearningSnapshot: captureSourceLearningSnapshot({ ...prev, stage4: workingSession.stage4 }),
            freshness: { isStale: false, staleSince: null },
            updateHistory: [...(prior.updateHistory || []), historyEntry],
          },
        }
        return nextSession
      })
    } catch (e) {
      setError(`Stage 5 update failed: ${e.message}`)
    } finally { setIsGeneratingStage5(false) }
  }

  // ── Pattern library — maturity lifecycle + user notes ────────────────────────
  function handleUpdatePattern({ patternId, updates }) {
    setSession(prev => {
      if (!prev.stage5?.reusablePatterns) return prev
      const reusablePatterns = prev.stage5.reusablePatterns.map(p =>
        p.patternId === patternId ? { ...p, ...updates } : p
      )
      return { ...prev, stage5: { ...prev.stage5, reusablePatterns } }
    })
  }

  // ── Stage 2 refinement acceptance (proposal only — Stage 1 not mutated) ─────
  function handleAcceptRefinement(nodeId) {
    setSession(prev => ({
      ...prev,
      stage2: {
        ...prev.stage2,
        refinedAssertions: prev.stage2.refinedAssertions.map(r =>
          r.nodeId === nodeId ? { ...r, userStatus: 'accepted' } : r
        ),
      },
    }))
  }

  function handleRejectRefinement(nodeId) {
    setSession(prev => ({
      ...prev,
      stage2: {
        ...prev.stage2,
        refinedAssertions: prev.stage2.refinedAssertions.map(r =>
          r.nodeId === nodeId ? { ...r, userStatus: 'rejected' } : r
        ),
      },
    }))
  }

  // ── Run pivot ─────────────────────────────────────────────────
  async function handleRunPivot({ type, title, targetNodeIds, userDirection }) {
    if ((session.stage2?.pivots || []).some(p => p.type === type && p.status === 'generating')) return
    const pivotId      = 'pivot_' + Date.now()
    const snapSession  = session

    setSession(prev => ({
      ...prev,
      stage2: {
        ...prev.stage2,
        pivots: [...(prev.stage2?.pivots || []), {
          id:                             pivotId,
          type,
          title,
          targetNodeIds,
          userDirection:                  userDirection || '',
          status:                         'generating',
          generatedAt:                    null,
          generatedFromStage1BasisHash:   snapSession.stage1BasisHash ?? null,
          generatedFromStage2GeneratedAt: snapSession.stage2?.generatedAt ?? null,
          displaySummary:                 '',
          analysisFoundation:             null,
          proposedUpdates:                [],
          unresolvedQuestions:            [],
          additionalSearchSuggestions:    [],
          stage3Implications:             [],
          errorMessage:                   null,
        }],
      },
    }))

    try {
      let pivotData

      if (!apiKeySet) {
        await delay(2000)
        pivotData = { ...MOCK_PIVOT_RESULT }
      } else {
        const ctx         = buildStage2ContextPacket(snapSession)
        const targetNodes = (snapSession.stage1?.nodes || []).filter(n => targetNodeIds.includes(n.id))
        const prompt      = buildPivotPrompt({
          entity:        ctx.entity,
          intent:        ctx.intent,
          policy:        snapSession.generationPolicy,
          stage1Summary: ctx.stage1Summary,
          acceptedNodes: ctx.acceptedNodes,
          stage2:        snapSession.stage2,
          pivotType:     type,
          pivotTitle:    title,
          targetNodes,
          userDirection: userDirection || '',
        })
        const { text, rawSearchBlocks } = await callClaudeWithSearch(prompt, 7000, 6)
        pivotData = safeParsePivotJson(text)
        pivotData._rawSearchBlocks = rawSearchBlocks
      }

      const proposedUpdates = (pivotData.proposedUpdates || []).map((u, i) => ({
        id:              u.id || `pu_${pivotId}_${i}`,
        targetSection:   u.targetSection || 'general',
        updateType:      u.updateType || 'modify',
        title:           u.title || '',
        currentText:     u.currentText || '',
        proposedText:    u.proposedText || '',
        rationale:       u.rationale || '',
        evidenceBasis:   u.evidenceBasis || '',
        stage3Relevance: u.stage3Relevance || '',
        confidence:      u.confidence || 'medium',
        status:          'proposed',
        userNote:        null,
        userRefinedText: null,
        decidedAt:       null,
      }))

      const af = pivotData.analysisFoundation || {}
      const analysisFoundation = {
        userDirectionInterpretation: af.userDirectionInterpretation || '',
        deeperFinding:               af.deeperFinding || '',
        evidenceSynthesis:           af.evidenceSynthesis || '',
        strategicTension:            af.strategicTension || '',
        implicationsForStage3:       af.implicationsForStage3 || '',
        assumptionsToTest:           Array.isArray(af.assumptionsToTest) ? af.assumptionsToTest : [],
        recommendedStage3Angle:      af.recommendedStage3Angle || '',
      }

      setSession(prev => ({
        ...prev,
        stage2: {
          ...prev.stage2,
          pivots: (prev.stage2?.pivots || []).map(p =>
            p.id !== pivotId ? p : {
              ...p,
              status:                      'complete',
              generatedAt:                 new Date().toISOString(),
              displaySummary:              pivotData.displaySummary || '',
              analysisFoundation,
              proposedUpdates,
              unresolvedQuestions:         pivotData.unresolvedQuestions || [],
              additionalSearchSuggestions: pivotData.additionalSearchSuggestions || [],
              stage3Implications:          pivotData.stage3Implications || [],
              _rawSearchBlocks:            pivotData._rawSearchBlocks || [],
              errorMessage:                null,
            }
          ),
        },
      }))
    } catch (e) {
      setSession(prev => ({
        ...prev,
        stage2: {
          ...prev.stage2,
          pivots: (prev.stage2?.pivots || []).map(p =>
            p.id !== pivotId ? p : { ...p, status: 'error', errorMessage: e.message }
          ),
        },
      }))
    }
  }

  // ── Pivot update decisions ────────────────────────────────────
  function handleAcceptPivotUpdate(pivotType, updateId) {
    setSession(prev => ({
      ...prev,
      stage2: {
        ...prev.stage2,
        pivots: (prev.stage2?.pivots || []).map(p =>
          p.type !== pivotType ? p : {
            ...p,
            proposedUpdates: p.proposedUpdates.map(u =>
              u.id !== updateId ? u : { ...u, status: 'accepted', decidedAt: new Date().toISOString() }
            ),
          }
        ),
      },
    }))
  }

  function handleRefinePivotUpdate(pivotType, updateId, userRefinedText) {
    setSession(prev => ({
      ...prev,
      stage2: {
        ...prev.stage2,
        pivots: (prev.stage2?.pivots || []).map(p =>
          p.type !== pivotType ? p : {
            ...p,
            proposedUpdates: p.proposedUpdates.map(u =>
              u.id !== updateId ? u : {
                ...u,
                status:          'refined',
                userRefinedText,
                decidedAt:       new Date().toISOString(),
              }
            ),
          }
        ),
      },
    }))
  }

  function handleRejectPivotUpdate(pivotType, updateId) {
    setSession(prev => ({
      ...prev,
      stage2: {
        ...prev.stage2,
        pivots: (prev.stage2?.pivots || []).map(p =>
          p.type !== pivotType ? p : {
            ...p,
            proposedUpdates: p.proposedUpdates.map(u =>
              u.id !== updateId ? u : { ...u, status: 'rejected', decidedAt: new Date().toISOString() }
            ),
          }
        ),
      },
    }))
  }

  // ── Render ───────────────────────────────────────────────────

  // If a candidate is pending and the user somehow navigated to 'stage2',
  // redirect them to the review panel without a full re-mount.
  const effectiveStep = (
    step === 'stage2' && session.stage2RerunCandidate?.status === 'pending_review'
  ) ? 'stage2_candidate_review' : step

  const isStage2Stale = !!(
    session.stage1BasisHash &&
    session.stage2?.generatedFromStage1BasisHash &&
    session.stage1BasisHash !== session.stage2.generatedFromStage1BasisHash
  )

  // Stage 3 stale — context-packet-based detection.
  // Recomputes the full Stage 3 context hash from current session state and compares
  // it against the hash stored at Stage 3 generation time. Detects Stage 1 node
  // changes, Stage 2 re-runs, and accepted pivot proposal changes — anything that
  // would have altered the prompt fed to Stage 3.
  // Short-circuit: hash is only recomputed when a stored hash exists (new sessions).
  // Existing Stage 3 sessions without the hash field show no warning until re-run.
  const isStage3Stale = !!(
    session.stage3?.generatedFromStage3ContextHash &&
    computeStage3ContextHash(session) !== session.stage3.generatedFromStage3ContextHash
  )

  // Stage 5 freshness — compares stored fingerprints to current stage state.
  // useMemo keeps it cheap: recomputes only when session changes.
  const stage5Freshness = useMemo(() => checkStage5Freshness(session), [session])

  // Severity of Stage 1 changes relative to the snapshot captured at Stage 2 generation.
  // Drives the StaleBanner button set in Stage2Panel — see classifyStage1ChangeSeverity.
  // Returns null when no snapshot exists (pre-feature session) → banner falls back to single rerun.
  const stage1Changes = session.stage2
    ? computeStage1Changes(session.stage1?.nodes || [], session.stage2.stage1Snapshot || null)
    : null
  const stage1ChangeSeverity       = classifyStage1ChangeSeverity(stage1Changes)
  const reconcileImpactedSections  = stage1Changes ? getReconcileImpactedSections(stage1Changes) : []

  const challengingNode = challengingNodeId
    ? session.stage1?.nodes.find(n => n.id === challengingNodeId)
    : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '0 16px', height: 40,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
        >
          <i className="ti ti-arrow-left" style={{ fontSize: 13 }} /> Back
        </button>
        <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>
          v4 session
        </span>
        {session.entity && (
          <>
            <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted2)' }}>{session.entity.name}</span>
          </>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <StepBadge step={effectiveStep} />
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {error && (
          <div style={{
            margin: '12px 16px', padding: '10px 14px',
            background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.25)',
            borderRadius: 'var(--r)', fontSize: 11, color: '#f87171',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i className="ti ti-alert-triangle" /> {error}
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
        )}

        {(effectiveStep === 'intent') && (
          <IntentCapture
            policy={session.generationPolicy}
            apiKeySet={apiKeySet}
            onSubmit={handleIntentSubmit}
          />
        )}

        {(effectiveStep === 'generating') && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Running Stage 1 orientation</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 20 }}>
              Extracting inspectable nodes · applying generation policy
            </div>
            <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 240, margin: '0 auto' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--a2),var(--accent))', borderRadius: 1, width: '60%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {(effectiveStep === 'stage2_generating') && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {session.stage2 ? 'Generating Stage 2 candidate for review…' : 'Running Stage 2 research expansion'}
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 20 }}>
              {session.stage2
                ? 'Existing Stage 2 is preserved — result will be staged for your review'
                : 'Retrieving evidence · comparing competitors · grounding assertions'}
            </div>
            <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 240, margin: '0 auto' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--a4),var(--a2))', borderRadius: 1, width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {(effectiveStep === 'inspect' || effectiveStep === 'regenerating') && session.stage1 && (
          <Stage1Panel
            session={session}
            diff={diff}
            regenerating={effectiveStep === 'regenerating'}
            onNodeStatusChange={handleNodeStatusChange}
            onChallengeClick={handleChallengeClick}
            onRegenNode={handleRegenNode}
            onNeedsReviewClick={handleNeedsReviewClick}
            onAcceptDiff={handleAcceptDiff}
            onDiscardDiff={handleDiscardDiff}
            onRunStage2={handleRunStage2}
            onViewStage2={() => setStep('stage2')}
          />
        )}

        {effectiveStep === 'stage2' && session.stage2 && (
          <Stage2Panel
            session={session}
            stage2={session.stage2}
            isStale={isStage2Stale}
            onAcceptRefinement={handleAcceptRefinement}
            onRejectRefinement={handleRejectRefinement}
            onBackToStage1={() => setStep('inspect')}
            onRunPivot={handleRunPivot}
            onAcceptPivotUpdate={handleAcceptPivotUpdate}
            onRefinePivotUpdate={handleRefinePivotUpdate}
            onRejectPivotUpdate={handleRejectPivotUpdate}
            onRerunStage2={handleRunStage2}
            hasStage3={!!session.stage3}
            onRunStage3={handleRunStage3}
            onViewStage3={() => setStep('stage3')}
            stage1ChangeSeverity={stage1ChangeSeverity}
            onReconcileStage2={() => handleRunStage2Reconcile(stage1Changes, reconcileImpactedSections)}
            onUpdateBasisOnly={handleUpdateBasisOnly}
          />
        )}

        {effectiveStep === 'stage2_candidate_review' && session.stage2RerunCandidate && (
          <Stage2RerunReview
            session={session}
            candidate={session.stage2RerunCandidate}
            onDecide={handleUpdateCandidateArtifact}
            onApply={handleApplyStage2Candidate}
            onDiscard={handleDiscardStage2Candidate}
          />
        )}

        {(effectiveStep === 'stage3_generating') && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Running Stage 3 synthesis</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 20 }}>
              Synthesizing thesis · clustering insights · assessing Stage 4 readiness
            </div>
            <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 240, margin: '0 auto' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--accent),var(--a3))', borderRadius: 1, width: '65%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {effectiveStep === 'stage3' && session.stage3 && (
          <Stage3Panel
            session={session}
            stage3={session.stage3}
            isStale={isStage3Stale}
            onBackToStage2={() => setStep('stage2')}
            onRerunStage3={handleRunStage3}
            onApplyEvidenceRefinement={handleApplyEvidenceRefinement}
            onMarkStrategyStale={handleMarkStrategyStale}
            onUpdateStrategyOptions={handleUpdateStrategyOptions}
            isStrategyMenuStale={!!session.stage3._strategyMenuNeedsRefresh}
            isUpdatingStrategyOptions={isUpdatingStrategyOptions}
            apiKeySet={apiKeySet}
            onGenerateStrategyMenu={handleGenerateStrategyMenu}
            isGeneratingStrategyMenu={isGeneratingStrategyMenu}
            onGenerateStage4Artifact={handleGenerateStage4Artifact}
            onViewStage4={() => setStep('stage4')}
          />
        )}

        {effectiveStep === 'stage4' && session.stage4 && (
          <Stage4Panel
            session={session}
            stage4={session.stage4}
            onBackToStage3={() => setStep('stage3')}
            onGenerateArtifact={handleGenerateStage4Artifact}
            onRefineArtifact={handleRefineStage4Artifact}
            onDeleteArtifact={handleDeleteStage4Artifact}
            onSetActiveArtifact={handleSetActiveArtifact}
            onGenerateSignals={handleGenerateStage4Signals}
            onViewStage5={() => setStep('stage5')}
            isGeneratingSignals={isGeneratingSignals}
            hasStage5={!!session.stage5}
            stage5Freshness={stage5Freshness}
          />
        )}

        {(effectiveStep === 'stage5_generating') && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Generating Stage 5 learning synthesis</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 20 }}>
              Synthesising cross-stage signals · building reusable patterns · extracting refinement triggers
            </div>
            <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 240, margin: '0 auto' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--a3),var(--accent))', borderRadius: 1, width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {effectiveStep === 'stage5' && (
          <Stage5Panel
            session={session}
            stage5={session.stage5}
            stage4Signals={session.stage4?.learningSignals || []}
            onBackToStage4={() => setStep('stage4')}
            onGenerate={handleGenerateStage5}
            isGenerating={isGeneratingStage5}
            freshness={stage5Freshness}
            onUpdate={handleUpdateStage5FromLatest}
            onUpdatePattern={handleUpdatePattern}
          />
        )}
      </div>

      {/* Challenge modal (portal-style overlay) */}
      {challengingNode && (
        <ChallengeModal
          node={challengingNode}
          onSave={handleChallengeSave}
          onCancel={() => setChallengeNodeId(null)}
        />
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function extractCompleteJsonObjects(arrayText) {
  const objects = []
  let i = 0
  while (i < arrayText.length) {
    if (arrayText[i] === '{') {
      let depth = 0; const start = i; let inStr = false; let escaping = false
      for (; i < arrayText.length; i++) {
        const c = arrayText[i]
        if (escaping) { escaping = false; continue }
        if (c === '\\' && inStr) { escaping = true; continue }
        if (c === '"') { inStr = !inStr; continue }
        if (!inStr) {
          if (c === '{') depth++
          else if (c === '}') { depth--; if (depth === 0) { try { objects.push(JSON.parse(arrayText.slice(start, i + 1))) } catch (_) {}; i++; break } }
        }
      }
    } else { i++ }
  }
  return objects
}

function safeParseSignals(raw) {
  const rawPreview = (raw || '').slice(0, 200)
  if (!raw || raw.trim().length === 0) return { ok: false, signals: [], errorType: 'empty_output', rawPreview }
  let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  try {
    const parsed = JSON.parse(text)
    if (parsed && Array.isArray(parsed.learningSignals)) return { ok: true, signals: parsed.learningSignals, errorType: null, rawPreview }
    return { ok: false, signals: [], errorType: 'parse_error', rawPreview }
  } catch (_) {}
  const arrMarker = text.indexOf('"learningSignals"')
  if (arrMarker !== -1) {
    const bracketIdx = text.indexOf('[', arrMarker)
    if (bracketIdx !== -1) {
      const extracted = extractCompleteJsonObjects(text.slice(bracketIdx))
      if (extracted.length > 0) return { ok: true, signals: extracted, errorType: null, rawPreview }
    }
  }
  return { ok: false, signals: [], errorType: raw.length > 800 ? 'truncated_output' : 'parse_error', rawPreview }
}

// Strips markdown fences and parses a JSON object — used for artifact + refinement responses.
function parseJsonResponse(raw) {
  if (!raw) throw new Error('Empty response from Claude')
  const text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  return JSON.parse(text)
}

// Safely parses Stage 5 JSON — handles markdown fences and truncated arrays.
// Returns { ok, data, partial, meta }
// meta shape: { status, generationPartial, truncationDetected, completedArrays, missingArrays }
// Output order in prompt: learningSignals → refinementTriggers → reusablePatterns.
// Using this order means triggers are generated before (verbose) patterns, so even
// partial responses include triggers if signals completed.
function safeParseStage5(raw) {
  const ARRAYS = ['learningSignals', 'refinementTriggers', 'reusablePatterns']

  if (!raw || raw.trim().length === 0) {
    return { ok: false, meta: { status: 'error', generationPartial: false, truncationDetected: false, completedArrays: [], missingArrays: ARRAYS, errorMessage: 'Empty response' } }
  }

  const text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  try {
    const d = JSON.parse(text)
    const completedArrays    = ARRAYS.filter(k => Array.isArray(d[k]) && d[k].length > 0)
    const missingArrays      = ARRAYS.filter(k => !(k in d))
    const truncationDetected = completedArrays.length > 0 && missingArrays.length > 0
    const partial            = truncationDetected
    return {
      ok: true, data: d, partial,
      meta: { status: partial ? 'partial' : 'complete', generationPartial: partial, truncationDetected, completedArrays, missingArrays },
    }
  } catch (_) {}

  // JSON.parse failed — bracket-depth per-array recovery
  // Array order matches prompt output order (signals → triggers → patterns)
  const result = { learningSignals: [], reusablePatterns: [], refinementTriggers: [] }
  let anyOk = false
  for (const key of ARRAYS) {
    const idx = text.indexOf(`"${key}"`)
    if (idx === -1) continue
    const bStart = text.indexOf('[', idx)
    if (bStart === -1) continue
    const objs = extractCompleteJsonObjects(text.slice(bStart))
    if (objs.length > 0) { result[key] = objs; anyOk = true }
  }
  if (!anyOk) {
    return { ok: false, meta: { status: 'error', generationPartial: false, truncationDetected: true, completedArrays: [], missingArrays: ARRAYS, errorMessage: 'Parse failed' } }
  }
  const completedArrays = ARRAYS.filter(k => result[k].length > 0)
  const missingArrays   = ARRAYS.filter(k => result[k].length === 0)
  return {
    ok: true, data: result, partial: true,
    meta: { status: 'partial', generationPartial: true, truncationDetected: true, completedArrays, missingArrays },
  }
}

function enrichSignals(signals, now) {
  return signals.map((sig, i) => ({
    sourceParentStrategyId: null, sourceRefinementIds: [], createdAt: now, updatedAt: now,
    ...sig, signalId: sig.signalId || `s4sig_${String(i + 1).padStart(3, '0')}`,
  }))
}

function getSignalErrorMessage(errorType) {
  if (errorType === 'truncated_output') return 'Learning signal generation failed because the response was incomplete. Try generating again — if it keeps failing, the response may be timing out.'
  if (errorType === 'empty_output') return 'Learning signal generation failed because no response was received. Check your API key and try again.'
  return 'Learning signal generation failed because the response could not be parsed. Try generating again.'
}

function safeParsePivotJson(text) {
  try { return JSON.parse(text) } catch (_) {}
  const stripped = text.replace(/```json|```/g, '').trim()
  try { return JSON.parse(stripped) } catch (_) {}
  const start = stripped.indexOf('{')
  if (start !== -1) {
    let depth = 0
    for (let i = start; i < stripped.length; i++) {
      if (stripped[i] === '{') depth++
      else if (stripped[i] === '}') {
        depth--
        if (depth === 0) {
          try { return JSON.parse(stripped.slice(start, i + 1)) } catch (_) {}
          break
        }
      }
    }
  }
  throw new Error('Could not extract valid JSON from pivot response')
}

function buildNewSession(id, policy) {
  return {
    id,
    ts:               Date.now(),
    entity:           null,
    intent:           null,
    stage1:           null,
    generationPolicy: { ...policy },
    linkedEntityIds:  [],
  }
}

function updateNode(session, nodeId, changes) {
  return {
    ...session,
    stage1: {
      ...session.stage1,
      nodes: session.stage1.nodes.map(n =>
        n.id === nodeId ? { ...n, ...changes, lastUpdated: Date.now() } : n
      ),
    },
  }
}

function StepBadge({ step }) {
  const labels = {
    intent:                   { label: 'Intent capture',             color: 'var(--a4)'    },
    generating:               { label: 'Generating…',                color: 'var(--a2)'    },
    inspect:                  { label: 'Inspect & refine',            color: 'var(--accent)'},
    regenerating:             { label: 'Pressure testing…',           color: '#fb923c'      },
    stage2_generating:        { label: 'Stage 2 — retrieving…',      color: 'var(--a2)'    },
    stage2:                   { label: 'Stage 2 — evidence',          color: 'var(--a4)'    },
    stage2_candidate_review:  { label: 'Stage 2 — reviewing update', color: 'var(--a4)'    },
    stage3_generating:        { label: 'Stage 3 — synthesizing…',    color: 'var(--a3)'    },
    stage3:                   { label: 'Stage 3 — synthesis',         color: '#fb923c'      },
    stage4:                   { label: 'Stage 4 — artifacts',          color: 'var(--accent)'},
  }
  const cfg = labels[step] || labels.intent
  return (
    <span style={{
      fontSize: 9, fontFamily: 'var(--fm)', padding: '2px 8px', borderRadius: 3,
      color: cfg.color, background: `${cfg.color}14`, border: `1px solid ${cfg.color}40`,
    }}>
      {cfg.label}
    </span>
  )
}
