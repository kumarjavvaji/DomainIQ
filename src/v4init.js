// DomainIQ v4 — storage initialization
//
// Single entry point called by App.jsx on boot.
// Sequence: open IndexedDB → run migration if needed → load initial state.
// App.jsx gates v4 UI rendering until this resolves, so hooks receive
// already-populated initial data and never race with migration.

import { openDB, idbGetAll, idbGet } from './idb'
import { runMigrationIfNeeded } from './v4migration'
import { DEFAULT_GENERATION_POLICY } from './v4schema'

export async function initializeV4Storage() {
  // 1. Open DB — creates schema on first boot
  await openDB()

  // 2. Run migration — failure is non-fatal; app continues with whatever IDB has
  await runMigrationIfNeeded().catch(err => {
    console.warn('[DomainIQ] Migration error (non-fatal, continuing):', err)
  })

  // 3. Load sessions
  const sessionRecords = await idbGetAll('sessions')
  const sessions = Object.fromEntries(sessionRecords.map(r => [r.id, r]))

  // 4. Load policy, stripping IDB metadata before handing to hook
  const policyRecord = await idbGet('policies', 'global_policy')
  let policy = null
  if (policyRecord) {
    const { id: _id, schemaVersion: _sv, updatedAt: _ua, migratedFrom: _mf, ...policyData } = policyRecord
    policy = { ...DEFAULT_GENERATION_POLICY, ...policyData }
  }

  return { sessions, policy }
}
