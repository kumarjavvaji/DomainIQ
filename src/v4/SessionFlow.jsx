import React, { useState, useEffect } from 'react'
import IntentCapture from './IntentCapture'
import Stage1Panel from './Stage1Panel'
import Stage2Panel from './Stage2Panel'
import Stage2RerunReview from './Stage2RerunReview'
import Stage3Panel from './Stage3Panel'
import ChallengeModal from './ChallengeModal'
import {
  buildStage1Prompt,
  buildPressureTestPrompt,
  buildStage2Prompt,
  buildStage2ReconcilePrompt,
  buildPivotPrompt,
  buildStage3Prompt,
  MOCK_V4_STAGE1,
  MOCK_PRESSURE_TEST_RESULT_REVISE,
  MOCK_PRESSURE_TEST_RESULT_PRESERVE,
  MOCK_V4_STAGE2,
  MOCK_V4_STAGE2_RECONCILE,
  MOCK_PIVOT_RESULT,
  MOCK_V4_STAGE3,
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
} from '../v4utils'
import { callClaude, callClaudeWithSearch } from '../api'

// step: 'intent' | 'generating' | 'inspect' | 'regenerating'
//     | 'stage2_generating' | 'stage2' | 'stage2_candidate_review'
//     | 'stage3_generating' | 'stage3'
export default function SessionFlow({ sessionId, savedSession, globalPolicy, apiKeySet, onSave, onBack }) {
  const [step, setStep]           = useState(
    savedSession?.stage2RerunCandidate?.status === 'pending_review' ? 'stage2_candidate_review' :
    savedSession?.stage3  ? 'stage3'  :
    savedSession?.stage2  ? 'stage2'  :
    savedSession?.stage1  ? 'inspect' : 'intent'
  )
  const [session, setSession]     = useState(savedSession || buildNewSession(sessionId, globalPolicy))
  const [challengingNodeId, setChallengeNodeId] = useState(null)
  const [diff, setDiff]           = useState(null)
  const [error, setError]         = useState(null)

  // Persist whenever session changes
  useEffect(() => {
    if (session) onSave(sessionId, session)
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  // Guard: if step resolved to a data-dependent step but the data is absent, fall back.
  useEffect(() => {
    if (step === 'stage2' && !session.stage2 && session.stage1) { setStep('inspect') }
    if (step === 'stage3' && !session.stage3 && session.stage2) { setStep('stage2') }
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
        stage1Data = JSON.parse(raw)
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
        stage2Data = JSON.parse(text)
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
        stage3Data = JSON.parse(raw)
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
