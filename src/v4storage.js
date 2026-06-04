// DomainIQ v4 — IndexedDB-backed storage hooks
//
// Both hooks accept an `init*` argument that carries the pre-loaded data from
// initializeV4Storage(). App.jsx passes null until init resolves, then passes
// the real data. Hooks apply it exactly once (via ref guard) so they never
// race with migration and never re-apply stale init data after the user edits.
//
// localStorage is no longer written to. Existing keys remain untouched as
// backup until an explicit cleanup task removes them.

import { useState, useCallback, useEffect, useRef } from 'react'
import { V4_STORAGE_KEYS, DEFAULT_GENERATION_POLICY } from './v4schema'
import { idbPut, idbDelete } from './idb'

// Strip large ephemeral search blocks before persisting — they bloat storage
// and are re-fetched on demand. Called on every save.
function sanitizeSessionForStorage(session) {
  if (!session?.stage2 || typeof session.stage2 !== 'object') return session
  const { _rawSearchBlocks, ...safeStage2 } = session.stage2
  const safePivots = (safeStage2.pivots || []).map(({ _rawSearchBlocks: _rb, ...safePivot }) => safePivot)
  return { ...session, stage2: { ...safeStage2, pivots: safePivots } }
}

// ── Sessions ──────────────────────────────────────────────────────────────────
//
// initSessions: null  — not yet initialized (App is still running initializeV4Storage)
//               {}    — initialized, no sessions in IDB
//               {...} — initialized, sessions loaded from IDB
//
export function useSessions(initSessions) {
  const [sessions, setSessions] = useState({})
  const initApplied = useRef(false)

  // Apply init data exactly once — when it transitions from null to real data.
  // After that, sessions are managed locally and mirrored to IDB on every write.
  useEffect(() => {
    if (initSessions !== null && !initApplied.current) {
      initApplied.current = true
      setSessions(initSessions)
    }
  }, [initSessions])

  const saveSession = useCallback((id, session) => {
    const sanitized = sanitizeSessionForStorage(session)
    const record = {
      ...sanitized,
      id,
      schemaVersion: 4,
      createdAt:     sanitized.createdAt || sanitized.ts || Date.now(),
      updatedAt:     Date.now(),
    }
    setSessions(prev => ({ ...prev, [id]: record }))
    idbPut('sessions', record).catch(err =>
      console.error('[DomainIQ] Failed to persist session to IDB', { id, err })
    )
  }, [])

  const deleteSession = useCallback((id) => {
    setSessions(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    idbDelete('sessions', id).catch(err =>
      console.error('[DomainIQ] Failed to delete session from IDB', { id, err })
    )
  }, [])

  return { sessions, saveSession, deleteSession }
}

// ── Generation policy ─────────────────────────────────────────────────────────
//
// initPolicy: null    — not yet initialized
//             {...}   — policy loaded from IDB (already merged with DEFAULT_GENERATION_POLICY
//                       by initializeV4Storage)
//
export function useGenerationPolicy(initPolicy) {
  const [policy, setPolicyState] = useState(DEFAULT_GENERATION_POLICY)
  const initApplied = useRef(false)

  useEffect(() => {
    if (initPolicy !== null && !initApplied.current) {
      initApplied.current = true
      setPolicyState({ ...DEFAULT_GENERATION_POLICY, ...initPolicy })
    }
  }, [initPolicy])

  const updatePolicy = useCallback((updates) => {
    setPolicyState(prev => {
      const next = { ...prev, ...updates }
      idbPut('policies', {
        id:            'global_policy',
        schemaVersion: 4,
        updatedAt:     Date.now(),
        ...next,
      }).catch(err => console.error('[DomainIQ] Failed to persist policy to IDB', err))
      return next
    })
  }, [])

  const resetPolicy = useCallback(() => {
    setPolicyState(DEFAULT_GENERATION_POLICY)
    idbPut('policies', {
      id:            'global_policy',
      schemaVersion: 4,
      updatedAt:     Date.now(),
      ...DEFAULT_GENERATION_POLICY,
    }).catch(err => console.error('[DomainIQ] Failed to reset policy in IDB', err))
  }, [])

  return { policy, updatePolicy, resetPolicy }
}

// ── Legacy localStorage key reference — do not remove ────────────────────────
// Kept here so migration.js and tests can import the canonical key list.
export { V4_STORAGE_KEYS }
