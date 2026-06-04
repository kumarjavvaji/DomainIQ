// Migration and IDB storage tests
//
// Covers:
//  - localStorage v4 sessions migrate into IndexedDB
//  - migration is idempotent
//  - localStorage remains intact after migration
//  - app reads sessions from IndexedDB after migration
//  - generation policy reads/writes from IndexedDB
//  - new session save/delete writes to IndexedDB

import { describe, it, expect, beforeEach } from 'vitest'
import { runMigrationIfNeeded, getMigrationStatus } from '../v4migration'
import { initializeV4Storage } from '../v4init'
import { openDB, idbGet, idbGetAll, idbPut, idbDelete, closeDB } from '../idb'
import { DEFAULT_GENERATION_POLICY } from '../v4schema'

// Helper: close open DB connection then delete the fake database between tests.
// closeDB() must come before deleteDatabase — an open connection blocks the delete
// and causes fake-indexeddb to hang indefinitely.
async function resetIDB() {
  closeDB()
  await new Promise(resolve => {
    const req = indexedDB.deleteDatabase('domainiq_v4')
    req.onsuccess = resolve
    req.onerror   = resolve
    req.onblocked = resolve
  })
}

// Sample localStorage data
const SAMPLE_SESSIONS = {
  v4s_111: { id: 'v4s_111', ts: 1000, entity: { name: 'Acme', type: 'company' }, intent: null, stage1: null },
  v4s_222: { id: 'v4s_222', ts: 2000, entity: { name: 'BetaCo', type: 'company' }, intent: null, stage1: null },
}
const SAMPLE_POLICY = { ...DEFAULT_GENERATION_POLICY, tokenBudget: 'high' }

function seedLocalStorage() {
  localStorage.setItem('diq_v4_sessions', JSON.stringify(SAMPLE_SESSIONS))
  localStorage.setItem('diq_v4_generation_policy', JSON.stringify(SAMPLE_POLICY))
}

beforeEach(async () => {
  localStorage.clear()
  await resetIDB()
})

// ── Migration ─────────────────────────────────────────────────────────────────

describe('runMigrationIfNeeded', () => {
  it('migrates sessions from localStorage into IndexedDB', async () => {
    seedLocalStorage()

    const result = await runMigrationIfNeeded()

    expect(result.migrated).toBe(true)
    expect(result.sessionCount).toBe(2)

    const idbSessions = await idbGetAll('sessions')
    const ids = idbSessions.map(s => s.id).sort()
    expect(ids).toEqual(['v4s_111', 'v4s_222'])
  })

  it('preserves entity data during migration', async () => {
    seedLocalStorage()
    await runMigrationIfNeeded()

    const session = await idbGet('sessions', 'v4s_111')
    expect(session).not.toBeNull()
    expect(session.entity.name).toBe('Acme')
    expect(session.migratedFrom).toBe('localStorage')
    expect(session.schemaVersion).toBe(4)
  })

  it('migrates generation policy into IndexedDB', async () => {
    seedLocalStorage()
    await runMigrationIfNeeded()

    const policy = await idbGet('policies', 'global_policy')
    expect(policy).not.toBeNull()
    expect(policy.tokenBudget).toBe('high')
    expect(policy.migratedFrom).toBe('localStorage')
  })

  it('migration is idempotent — running twice does not duplicate sessions', async () => {
    seedLocalStorage()

    await runMigrationIfNeeded()
    await runMigrationIfNeeded()  // second run should be a no-op

    const idbSessions = await idbGetAll('sessions')
    expect(idbSessions.length).toBe(2)
  })

  it('marks migration completed after success', async () => {
    seedLocalStorage()
    await runMigrationIfNeeded()

    const status = await getMigrationStatus()
    expect(status).toBe('completed')
  })

  it('skips migration when already completed', async () => {
    seedLocalStorage()
    await runMigrationIfNeeded()

    const result = await runMigrationIfNeeded()
    expect(result.skipped).toBe(true)
    expect(result.status).toBe('completed')
  })

  it('localStorage keys remain intact after migration (no deletion)', async () => {
    seedLocalStorage()
    await runMigrationIfNeeded()

    const rawSessions = localStorage.getItem('diq_v4_sessions')
    const rawPolicy   = localStorage.getItem('diq_v4_generation_policy')
    expect(rawSessions).not.toBeNull()
    expect(rawPolicy).not.toBeNull()
    expect(JSON.parse(rawSessions)).toEqual(SAMPLE_SESSIONS)
  })

  it('writes a backup of localStorage data into migrationMeta', async () => {
    seedLocalStorage()
    await runMigrationIfNeeded()

    const backup = await idbGet('migrationMeta', 'v4_ls_backup')
    expect(backup).not.toBeNull()
    expect(backup.rawSessions).toEqual(SAMPLE_SESSIONS)
    expect(backup.hasPolicy).toBe(true)
  })

  it('handles empty localStorage gracefully — no sessions, no policy', async () => {
    // localStorage is empty (no seedLocalStorage call)
    const result = await runMigrationIfNeeded()

    expect(result.migrated).toBe(true)
    expect(result.sessionCount).toBe(0)
    const idbSessions = await idbGetAll('sessions')
    expect(idbSessions.length).toBe(0)
  })

  it('recovers from in_progress state on restart', async () => {
    // Simulate a crash mid-migration by manually writing in_progress status
    await openDB()
    await idbPut('migrationMeta', {
      id: 'v4_ls_migration', status: 'in_progress', startedAt: Date.now(), attemptedAt: Date.now(), previousStatus: 'not_started',
    })

    seedLocalStorage()
    // Should restart cleanly and complete
    const result = await runMigrationIfNeeded()
    expect(result.migrated).toBe(true)

    const status = await getMigrationStatus()
    expect(status).toBe('completed')
  })
})

// ── initializeV4Storage ───────────────────────────────────────────────────────

describe('initializeV4Storage', () => {
  it('returns migrated sessions after init', async () => {
    seedLocalStorage()

    const { sessions } = await initializeV4Storage()
    expect(Object.keys(sessions).sort()).toEqual(['v4s_111', 'v4s_222'])
  })

  it('returns policy after init', async () => {
    seedLocalStorage()

    const { policy } = await initializeV4Storage()
    expect(policy).not.toBeNull()
    expect(policy.tokenBudget).toBe('high')
  })

  it('returns empty sessions when localStorage is empty', async () => {
    const { sessions } = await initializeV4Storage()
    expect(sessions).toEqual({})
  })

  it('returns default policy when no policy in localStorage', async () => {
    const { policy } = await initializeV4Storage()
    expect(policy).toBeNull()
  })

  it('sessions from IDB are available on second init without re-migrating', async () => {
    seedLocalStorage()
    await initializeV4Storage()

    // Close connection but keep fake-indexeddb data — simulates page reload
    closeDB()

    const { sessions } = await initializeV4Storage()
    expect(Object.keys(sessions)).toHaveLength(2)
  })
})

// ── IDB session CRUD (post-migration writes) ──────────────────────────────────

describe('IDB session writes', () => {
  it('saves a new session to IDB', async () => {
    const newSession = {
      id: 'v4s_new',
      ts: Date.now(),
      schemaVersion: 4,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      entity: { name: 'NewCo', type: 'company' },
    }

    await idbPut('sessions', newSession)
    const loaded = await idbGet('sessions', 'v4s_new')

    expect(loaded).not.toBeNull()
    expect(loaded.entity.name).toBe('NewCo')
  })

  it('deletes a session from IDB', async () => {
    await idbPut('sessions', { id: 'v4s_del', ts: Date.now(), schemaVersion: 4, createdAt: Date.now(), updatedAt: Date.now() })
    await idbDelete('sessions', 'v4s_del')

    const loaded = await idbGet('sessions', 'v4s_del')
    expect(loaded).toBeNull()
  })

  it('overwrites an existing session on save (upsert)', async () => {
    await idbPut('sessions', { id: 'v4s_up', ts: 1000, schemaVersion: 4, createdAt: 1000, updatedAt: 1000, entity: { name: 'Old' } })
    await idbPut('sessions', { id: 'v4s_up', ts: 2000, schemaVersion: 4, createdAt: 1000, updatedAt: 2000, entity: { name: 'New' } })

    const loaded = await idbGet('sessions', 'v4s_up')
    expect(loaded.entity.name).toBe('New')
    expect(loaded.updatedAt).toBe(2000)
  })
})

// ── IDB policy writes ─────────────────────────────────────────────────────────

describe('IDB policy writes', () => {
  it('saves and reads back the global policy', async () => {
    await idbPut('policies', { id: 'global_policy', schemaVersion: 4, updatedAt: Date.now(), tokenBudget: 'low' })
    const loaded = await idbGet('policies', 'global_policy')

    expect(loaded.tokenBudget).toBe('low')
  })

  it('overwrites policy on update (upsert)', async () => {
    await idbPut('policies', { id: 'global_policy', schemaVersion: 4, updatedAt: 1000, tokenBudget: 'low' })
    await idbPut('policies', { id: 'global_policy', schemaVersion: 4, updatedAt: 2000, tokenBudget: 'high' })

    const loaded = await idbGet('policies', 'global_policy')
    expect(loaded.tokenBudget).toBe('high')
  })
})
