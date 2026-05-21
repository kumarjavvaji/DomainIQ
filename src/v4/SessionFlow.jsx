import React, { useState, useEffect } from 'react'
import IntentCapture from './IntentCapture'
import Stage1Panel from './Stage1Panel'
import Stage2Panel from './Stage2Panel'
import ChallengeModal from './ChallengeModal'
import {
  buildStage1Prompt,
  buildPressureTestPrompt,
  buildStage2Prompt,
  MOCK_V4_STAGE1,
  MOCK_PRESSURE_TEST_RESULT_REVISE,
  MOCK_PRESSURE_TEST_RESULT_PRESERVE,
  MOCK_V4_STAGE2,
} from '../v4prompts'
import {
  getDirectDeps,
  getDirectDownstream,
  buildAcceptedSummary,
  buildStage2ContextPacket,
  computeDiff,
  applyDiff,
} from '../v4utils'
import { callClaude, callClaudeWithSearch } from '../api'

// step: 'intent' | 'generating' | 'inspect' | 'regenerating' | 'stage2_generating' | 'stage2'
export default function SessionFlow({ sessionId, savedSession, globalPolicy, apiKeySet, onSave, onBack }) {
  const [step, setStep]           = useState(
    savedSession?.stage2 ? 'stage2'  :
    savedSession?.stage1 ? 'inspect' : 'intent'
  )
  const [session, setSession]     = useState(savedSession || buildNewSession(sessionId, globalPolicy))
  const [challengingNodeId, setChallengeNodeId] = useState(null)
  const [diff, setDiff]           = useState(null)
  const [error, setError]         = useState(null)

  // Persist whenever session changes
  useEffect(() => {
    if (session) onSave(sessionId, session)
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setSession(prev => updateNode(prev, nodeId, { userStatus: newStatus }))
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
    setSession(prev => ({
      ...prev,
      stage1: { ...prev.stage1, nodes: updatedNodes },
    }))
    setDiff(null)
  }

  // ── Discard diff — keep original nodes, keep challenge status ─
  function handleDiscardDiff() {
    setDiff(null)
  }

  // ── Run Stage 2 ───────────────────────────────────────────────
  async function handleRunStage2() {
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

      const stage2 = {
        id:          'stage2_' + Date.now(),
        stageNumber: 2,
        generatedAt: Date.now(),
        ...stage2Data,
      }

      setSession(prev => ({ ...prev, stage2 }))
      setStep('stage2')
    } catch (e) {
      setError(`Stage 2 generation failed: ${e.message}`)
      setStep('inspect')
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

  // ── Render ───────────────────────────────────────────────────
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
          <StepBadge step={step} />
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

        {(step === 'intent') && (
          <IntentCapture
            policy={session.generationPolicy}
            apiKeySet={apiKeySet}
            onSubmit={handleIntentSubmit}
          />
        )}

        {(step === 'generating') && (
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

        {(step === 'stage2_generating') && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Running Stage 2 research expansion</div>
            <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--muted2)', marginBottom: 20 }}>
              Retrieving evidence · comparing competitors · grounding assertions
            </div>
            <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 240, margin: '0 auto' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--a4),var(--a2))', borderRadius: 1, width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        )}

        {(step === 'inspect' || step === 'regenerating') && session.stage1 && (
          <Stage1Panel
            session={session}
            diff={diff}
            regenerating={step === 'regenerating'}
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

        {step === 'stage2' && session.stage2 && (
          <Stage2Panel
            session={session}
            stage2={session.stage2}
            onAcceptRefinement={handleAcceptRefinement}
            onRejectRefinement={handleRejectRefinement}
            onBackToStage1={() => setStep('inspect')}
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
    intent:            { label: 'Intent capture',         color: 'var(--a4)' },
    generating:        { label: 'Generating…',             color: 'var(--a2)' },
    inspect:           { label: 'Inspect & refine',        color: 'var(--accent)' },
    regenerating:      { label: 'Pressure testing…',       color: '#fb923c' },
    stage2_generating: { label: 'Stage 2 — retrieving…',  color: 'var(--a2)' },
    stage2:            { label: 'Stage 2 — evidence',      color: 'var(--a4)' },
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
