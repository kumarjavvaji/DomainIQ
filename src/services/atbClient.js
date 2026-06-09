/**
 * AI Tool Bridge (ATB) HTTP client for DomainIQ.
 *
 * Calls the local ATB server at VITE_ATB_BASE_URL (default: http://localhost:3000).
 * All requests carry an AbortController timeout so a stalled ATB server never
 * blocks DIQ's UI indefinitely.
 *
 * No provider object crosses HTTP — ATB resolves its own provider server-side.
 * Failed bridge calls never mutate DIQ session state; callers must handle errors.
 */

const ATB_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ATB_BASE_URL)
  || 'http://localhost:3000'

const HEALTH_TIMEOUT_MS   = 3_000
const GENERATE_TIMEOUT_MS = 30_000

/**
 * Ping ATB health endpoint. Returns true if ATB is up and responding.
 * Never throws — network errors resolve to false.
 */
export async function checkATBHealth() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const res = await fetch(`${ATB_BASE_URL}/health`, { signal: controller.signal })
    if (!res.ok) return false
    const body = await res.json()
    return body?.ok === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Call ATB POST /diq/stage2/pivot.
 *
 * payload shape:
 *   { sessionId, pivotId, pivotType, pivotTitle, targetNodeIds, userDirection, fixture }
 *
 * Forbidden payload fields: apiKey, anthropicApiKey, providerKey, provider.
 * ATB resolves its own provider server-side based on sourceApp.
 *
 * Returns the pivot result from ATB:
 *   { pivotType, displaySummary, analysisFoundation, proposedUpdates,
 *     unresolvedQuestions, stage3Implications, additionalSearchSuggestions,
 *     diagnostics, isUsable }
 *
 * Throws if the request fails or ATB returns a non-2xx status.
 */
export async function generateDIQStage2PivotViaBridge(payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
  try {
    const res = await fetch(`${ATB_BASE_URL}/diq/stage2/pivot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`ATB error: ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Call ATB POST /diq/stage1/generate.
 *
 * payload shape:
 *   { generationMode, session, sessionId, nodeId, operation, fixture }
 *
 * Returns the DIQStage1IntegrationResult from ATB (applied, session, diagnostics, …).
 * Throws if the request fails or ATB returns a non-2xx status.
 */
export async function generateDIQStage1ViaBridge(payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS)
  try {
    const res = await fetch(`${ATB_BASE_URL}/diq/stage1/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`ATB error: ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}
