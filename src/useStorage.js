import { useState, useEffect, useCallback } from 'react'
import { STORAGE_KEYS } from './constants'

export function useProjects() {
  const [projects, setProjectsState] = useState({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS)
      if (raw) setProjectsState(JSON.parse(raw))
    } catch (e) {
      console.warn('DomainIQ: could not load projects from localStorage', e)
    }
  }, [])

  const setProjects = useCallback((updater) => {
    setProjectsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next)) } catch (e) {}
      return next
    })
  }, [])

  const saveProject = useCallback((id, project) => {
    setProjects(prev => ({ ...prev, [id]: project }))
  }, [setProjects])

  const deleteProject = useCallback((id) => {
    setProjects(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [setProjects])

  return { projects, saveProject, deleteProject }
}

export function usePatterns() {
  const [patterns, setPatternsState] = useState({})

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PATTERNS)
      if (raw) setPatternsState(JSON.parse(raw))
    } catch (e) {
      console.warn('DomainIQ: could not load patterns from localStorage', e)
    }
  }, [])

  const mergePatterns = useCallback((newPatterns, domain) => {
    setPatternsState(prev => {
      const next = { ...prev }
      ;(newPatterns || []).forEach(pat => {
        const key = pat.title.toLowerCase().replace(/\s+/g, '_').slice(0, 50)
        if (!next[key]) {
          next[key] = { ...pat, domains: [domain], count: 1, last_seen: Date.now() }
        } else {
          next[key] = {
            ...next[key],
            count: (next[key].count || 1) + 1,
            last_seen: Date.now(),
            domains: next[key].domains.includes(domain)
              ? next[key].domains
              : [...next[key].domains, domain],
          }
        }
      })
      try { localStorage.setItem(STORAGE_KEYS.PATTERNS, JSON.stringify(next)) } catch (e) {}
      return next
    })
  }, [])

  return { patterns, mergePatterns }
}
