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
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// Sessions — each session owns its entity, intent, stage1 result, and policy snapshot.
export function useSessions() {
  const [sessions, setSessions] = useState(() => load(V4_STORAGE_KEYS.SESSIONS, {}))

  const saveSession = useCallback((id, session) => {
    setSessions(prev => {
      const next = { ...prev, [id]: session }
      persist(V4_STORAGE_KEYS.SESSIONS, next)
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
