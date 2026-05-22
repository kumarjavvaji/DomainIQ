// DomainIQ v4 — localStorage hooks
// Mirrors the pattern of v3 useStorage.js but uses diq_v4_* keys.
// v3 hooks are untouched.

import { useState, useCallback } from 'react'
import { V4_STORAGE_KEYS, DEFAULT_GENERATION_POLICY } from './v4schema'

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.error('[DomainIQ] Failed to persist to localStorage', { key, error: err })
  }
}

function sanitizeSessionForStorage(session) {
  if (!session?.stage2 || typeof session.stage2 !== 'object') return session
  const { _rawSearchBlocks, ...safeStage2 } = session.stage2
  const safePivots = (safeStage2.pivots || []).map(({ _rawSearchBlocks: _rb, ...safePivot }) => safePivot)
  return { ...session, stage2: { ...safeStage2, pivots: safePivots } }
}

function sanitizeSessionsForStorage(sessions) {
  const out = {}
  for (const [id, session] of Object.entries(sessions)) {
    out[id] = sanitizeSessionForStorage(session)
  }
  return out
}

// Sessions — each session owns its entity, intent, stage1 result, and policy snapshot.
export function useSessions() {
  const [sessions, setSessions] = useState(() => load(V4_STORAGE_KEYS.SESSIONS, {}))

  const saveSession = useCallback((id, session) => {
    setSessions(prev => {
      const next = { ...prev, [id]: session }
      persist(V4_STORAGE_KEYS.SESSIONS, sanitizeSessionsForStorage(next))
      return next
    })
  }, [])

  const deleteSession = useCallback((id) => {
    setSessions(prev => {
      const next = { ...prev }
      delete next[id]
      persist(V4_STORAGE_KEYS.SESSIONS, next)
      return next
    })
  }, [])

  return { sessions, saveSession, deleteSession }
}

// Global generation policy — provides the default snapshot applied to new sessions.
// Sessions snapshot this at creation time; edits here don't retroactively affect saved sessions.
export function useGenerationPolicy() {
  const [policy, setPolicyState] = useState(() =>
    load(V4_STORAGE_KEYS.POLICY, DEFAULT_GENERATION_POLICY)
  )

  const updatePolicy = useCallback((updates) => {
    setPolicyState(prev => {
      const next = { ...prev, ...updates }
      persist(V4_STORAGE_KEYS.POLICY, next)
      return next
    })
  }, [])

  const resetPolicy = useCallback(() => {
    setPolicyState(DEFAULT_GENERATION_POLICY)
    persist(V4_STORAGE_KEYS.POLICY, DEFAULT_GENERATION_POLICY)
  }, [])

  return { policy, updatePolicy, resetPolicy }
}
