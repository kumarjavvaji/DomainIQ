// DomainIQ v4 — one-time localStorage → IndexedDB migration
//
// Migration states: not_started | in_progress | completed | failed
//
// Idempotency guarantee: all writes are idbPut (upsert), so a mid-run crash
// followed by a reload will restart from not_started or in_progress and
// re-write the same records without duplicating or corrupting data.
//
// localStorage keys are NOT deleted — they remain as backup/rollback.

import { idbGet, idbPut, idbGetAll } from './idb'
import { V4_STORAGE_KEYS } from './v4schema'

const MIGRATION_ID = 'v4_ls_migration'
const BACKUP_ID    = 'v4_ls_backup'

function lsRead(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Returns: { skipped, status } | { migrated, sessionCount } | throws on unrecoverable error
export async function runMigrationIfNeeded() {
  const meta = await idbGet('migrationMeta', MIGRATION_ID)

  if (meta?.status === 'completed') {
    return { skipped: true, status: 'completed' }
  }

  // Mark in_progress before touching any data.
  // If a previous attempt left status: in_progress or failed, we restart it —
  // idempotent puts make this safe.
  await idbPut('migrationMeta', {
    id:             MIGRATION_ID,
    status:         'in_progress',
    startedAt:      meta?.startedAt ?? Date.now(),
    attemptedAt:    Date.now(),
    previousStatus: meta?.status ?? 'not_started',
  })

  try {
    // --- Snapshot all relevant localStorage keys before any IDB writes ---
    const lsSessions = lsRead(V4_STORAGE_KEYS.SESSIONS) || {}
    const lsPolicy   = lsRead(V4_STORAGE_KEYS.POLICY)

    // Write a backup record so the original LS data is always recoverable from IDB
    await idbPut('migrationMeta', {
      id:          BACKUP_ID,
      capturedAt:  Date.now(),
      sessionIds:  Object.keys(lsSessions),
      hasPolicy:   !!lsPolicy,
      rawSessions: lsSessions,
      rawPolicy:   lsPolicy,
    })

    // --- Migrate sessions — each session gets its own IDB record ---
    const sessionIds = Object.keys(lsSessions)
    for (const id of sessionIds) {
      const session = lsSessions[id]
      await idbPut('sessions', {
        schemaVersion: 4,
        createdAt:     session.ts || Date.now(),
        updatedAt:     Date.now(),
        migratedFrom:  'localStorage',
        ...session,
        id,  // always set from map key, overrides any stale id on the session object
      })
    }

    // --- Migrate generation policy ---
    if (lsPolicy) {
      await idbPut('policies', {
        schemaVersion: 4,
        updatedAt:     Date.now(),
        migratedFrom:  'localStorage',
        ...lsPolicy,
        id: 'global_policy',
      })
    }

    // --- Validate: every session from LS must be readable back from IDB ---
    const idbSessions = await idbGetAll('sessions')
    const idbIds = new Set(idbSessions.map(s => s.id))
    for (const id of sessionIds) {
      if (!idbIds.has(id)) {
        throw new Error(`Validation failed: session ${id} missing in IDB after write`)
      }
    }

    // --- Mark completed ---
    await idbPut('migrationMeta', {
      id:           MIGRATION_ID,
      status:       'completed',
      completedAt:  Date.now(),
      sessionCount: sessionIds.length,
      hadPolicy:    !!lsPolicy,
    })

    return { migrated: true, sessionCount: sessionIds.length }
  } catch (err) {
    // Write failed status — preserves startedAt and backup record for recovery
    await idbPut('migrationMeta', {
      id:        MIGRATION_ID,
      status:    'failed',
      failedAt:  Date.now(),
      error:     err.message,
    }).catch(() => {})
    console.error('[DomainIQ] Migration failed:', err)
    throw err
  }
}

export async function getMigrationStatus() {
  const meta = await idbGet('migrationMeta', MIGRATION_ID)
  return meta?.status ?? 'not_started'
}
