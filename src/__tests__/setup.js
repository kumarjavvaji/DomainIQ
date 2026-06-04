// Test environment setup
// Installs fake-indexeddb globals and a minimal localStorage mock into Node

import 'fake-indexeddb/auto'

// Minimal localStorage shim for Node test environment.
// Each test file that touches localStorage should call ls.clear() in beforeEach.
const _store = {}
global.localStorage = {
  getItem:    (key)        => _store[key] ?? null,
  setItem:    (key, val)   => { _store[key] = String(val) },
  removeItem: (key)        => { delete _store[key] },
  clear:      ()           => { for (const k in _store) delete _store[k] },
}
