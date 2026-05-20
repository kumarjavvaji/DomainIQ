import React, { useState, useEffect } from 'react'
import IntentCapture from './IntentCapture'
import Stage1Panel from './Stage1Panel'
import ChallengeModal from './ChallengeModal'
import {
  buildStage1Prompt,
  buildScopedRegenPrompt,
  MOCK_V4_STAGE1,
  MOCK_SCOPED_REGEN_RESULT,
} from '../v4prompts'
import {
  getDirectDeps,
  getDirectDownstream,
  buildAcceptedSummary,
  computeDiff,
  applyDiff,
} from '../v4utils'
import { callClaude } from '../api'

// step: 'intent' | 'generating' | 'inspect' | 'regenerating'
export default function SessionFlow({ sessionId, savedSession, globalPolicy, apiKeySet, onSave, onBack }) {
  const [step, setStep]           = useState(savedSession?.stage1 ? 'inspect' : 'intent')
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
        const raw = await callClaude(prompt, 1800)
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

  // ── Scoped regeneration for a single challenged node ─────────
  async function handleRegenNode(nodeId) {
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

      let regenResult

      if (!apiKeySet) {
        // Demo mode — use mock result if challenging n3, otherwise echo a trivial no-op
        await delay(900)
        if (nodeId === 'n3') {
          regenResult = MOCK_SCOPED_REGEN_RESULT
        } else {
          regenResult = {
            revisedNode:            { ...challengedNode, changeReason: 'Demo: no live API key — no real revision performed.' },
            updatedDownstream:      [],
            preservedDownstreamIds: directDownstream.map(n => n.id),
          }
        }
      } else {
        const prompt = buildScopedRegenPrompt({
          challengedNode,
          directDeps,
          directDownstream,
          intent:        session.intent,
          policy:        session.generationPolicy,
          policyOverride: null,
          acceptedSummary,
        })
        const raw = await callClaude(prompt, 900)
        regenResult = JSON.parse(raw)
      }

      const newDiff = computeDiff(nodes, regenResult)
      // Attach the regenResult to the diff so applyDiff has what it needs
      newDiff._regenResult = regenResult

      setDiff(newDiff)
      setStep('inspect')

      // Record refinement in history
      const record = {
        triggeredBy:    nodeId,
        userNote:       challengedNode.userNote,
        timestamp:      Date.now(),
        policyOverride: null,
        nodesChanged:   [regenResult.revisedNode.id, ...(regenResult.updatedDownstream || []).map(n => n.id)],
      }
      setSession(prev => ({
        ...prev,
        stage1: {
          ...prev.stage1,
          refinementHistory: [...(prev.stage1.refinementHistory || []), record],
        },
      }))
    } catch (e) {
      setError('Regeneration failed. Check your API key and try again.')
      setStep('inspect')
    }
  }

  // ── Accept diff — apply changes to nodes ─────────────────────
  function handleAcceptDiff() {
    if (!diff?._regenResult) return
    const updatedNodes = applyDiff(session.stage1.nodes, diff._regenResult)
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

        {(step === 'inspect' || step === 'regenerating') && session.stage1 && (
          <Stage1Panel
            session={session}
            diff={diff}
            regenerating={step === 'regenerating'}
            onNodeStatusChange={handleNodeStatusChange}
            onChallengeClick={handleChallengeClick}
            onRegenNode={handleRegenNode}
            onAcceptDiff={handleAcceptDiff}
            onDiscardDiff={handleDiscardDiff}
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
    intent:       { label: 'Intent capture',   color: 'var(--a4)' },
    generating:   { label: 'Generating…',       color: 'var(--a2)' },
    inspect:      { label: 'Inspect & refine',  color: 'var(--accent)' },
    regenerating: { label: 'Regenerating…',     color: '#fb923c' },
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
