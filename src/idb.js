// DomainIQ v4 — IndexedDB adapter
// Primary persistence layer. Four stores are active in this pass:
//   sessions      — one record per session (id = sessionId)
//   policies      — one record for 'global_policy'
//   rawResponses  — failed / fallback AI responses saved for inspection
//   migrationMeta — migration state and localStorage backup

const DB_NAME    = 'domainiq_v4'
const DB_VERSION = 1
const STORES     = ['sessions', 'policies', 'rawResponses', 'migrationMeta']

let _db = null

export async function openDB() {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = e.target.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db) }
    req.onerror    = (e) => reject(e.target.error)
    req.onblocked  = ()  => reject(new Error('IndexedDB open blocked — close other DomainIQ tabs and reload'))
  })
}

export async function idbGet(store, id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = (e) => reject(e.target.error)
  })
}

export async function idbPut(store, record) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).put(record)
    req.onsuccess = () => resolve()
    req.onerror   = (e) => reject(e.target.error)
  })
}

export async function idbGetAll(store) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror   = (e) => reject(e.target.error)
  })
}

export async function idbDelete(store, id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readwrite').objectStore(store).delete(id)
    req.onsuccess = () => resolve()
    req.onerror   = (e) => reject(e.target.error)
  })
}

// Close the active DB connection and clear the singleton.
// Must be called before indexedDB.deleteDatabase() in tests — an open connection
// blocks delete and causes fake-indexeddb to hang indefinitely.
export function closeDB() {
  if (_db) _db.close()
  _db = null
}
