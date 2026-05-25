# DomainIQ v4

**Evidence-first domain research and portfolio intelligence tool for PM and BA professionals.**

> Analyze any company or industry. Map the operating model. Profile personas. Identify opportunities. Surface portfolio artifacts. Every claim is typed, traced, and confidence-rated.

---

## Quick start

```bash
npm install
npm run dev
# Open http://localhost:5173
```

The app runs in **demo mode** without an API key — the full UI is explorable using mock Finlytica.ai session data.

---

## Enable live AI analysis

Create `.env.local` in the project root:

```
VITE_ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

Restart the dev server. The app will run live analysis via the Anthropic API.

---

## What DomainIQ does

| Stage | Name | Output |
|-------|------|--------|
| 1 | **Orientation** | 8-dimension operating model: value prop, customers, revenue, capabilities, processes, tech, ecosystem, metrics |
| 2 | **Research expansion** | Evidence consolidation, competitor map, investigative pivots, contradiction map |
| 3 | **Strategy synthesis** | Thesis, personas, opportunities, risk/governance, evidence map, artifact recommendations |
| 4 | **Artifact workspace** | Strategy one-pagers per persona/posture — generate, refine, version, diff lineage |
| 5 | **Learning synthesis** | Cross-stage learning signals, reusable analysis patterns, refinement triggers |

Every claim is typed (`verified fact` / `user-provided` / `inferred` / `hypothesis`), traced to its source stage, and confidence-rated. Nothing is silently blended.

---

## Persistence

- Sessions persist in **localStorage** (per browser, no server required)
- No database, no auth, no backend
- v4 keys: `diq_v4_sessions`, `diq_v4_policy`
- `_rawSearchBlocks` (Anthropic web search evidence) are stripped at the persistence boundary — kept in memory only during the active session
- **Limitation:** localStorage is per-browser. Sessions cannot be shared or synced across devices without export/import (not yet implemented).

---

## Trust taxonomy

Every claim carries one label:

| Label | Meaning |
|-------|---------|
| ✅ Verified fact | Publicly established, unambiguous |
| 🔵 User-provided | Came from your context input |
| 🟠 Inferred | Logical inference from domain knowledge |
| 🟣 Hypothesis | Speculative — validate before citing |

---

## File structure

```
src/
  App.jsx               Session list, routing, v3/v4 switching
  main.jsx              React entry point
  index.css             Design tokens and global styles
  api.js                Anthropic API: callClaude(), callClaudeWithSearch()
  v4schema.js           Session schema, storage keys, default generation policy
  v4utils.js            Pure utilities: diff, dependency resolution, basis hash, pivot scoring
  v4storage.js          localStorage hooks for v4 sessions and policy
  v4prompts.js          Prompt builders for Stages 1–4 + mock data
  v4stage4signals.js    Stage 4 learning signals prompt, fallback generator
  v4stage5.js           Stage 5 prompt, COMPACT_GENERATION_LIMITS, MOCK_STAGE5
  v4/
    SessionFlow.jsx     Top-level orchestrator — all stage transitions and handlers
    IntentCapture.jsx   Entity + intent input form
    Stage1Panel.jsx     Node inspection, diff view, Stage 2 trigger
    Stage2Panel.jsx     Evidence display, investigative pivot launcher
    Stage3Panel.jsx     Strategy synthesis display
    Stage4Panel.jsx     Artifact workspace: generate, refine, version, diff, signals
    Stage5Panel.jsx     Learning synthesis: signals, patterns, triggers
    learningSignals.js  Freshness fingerprints, staleness detection, reconcile prompt
    NodeCard.jsx        Assertion card with status controls
    DiffView.jsx        Pressure test before/after diff
    ChallengeModal.jsx  User challenge input
    Stage2RerunReview.jsx  Stage 2 rerun candidate review
docs/
  DOMAINIQ_SPEC.md               Full product specification
  PRODUCT_SUITE_ARCHITECTURE.md  Suite architecture + planned export schema
```

---

## Current MVP scope (v4 demoable)

### Complete
- **Stage 1 — Orientation**: entity + intent capture, 8-dimension operating model, typed assertion nodes, confidence ratings, open questions, pressure testing with web retrieval
- **Stage 2 — Research expansion**: evidence consolidation, competitor map, contradiction map, investigative pivots (scored recommendations, live search execution, accept/refine/reject proposals)
- **Stage 3 — Strategy synthesis**: thesis, persona profiles, opportunity ranking, risk/governance, evidence map, artifact recommendations
- **Stage 4 — Artifact workspace**: per-persona/posture one-pagers, generate via Claude, refine with commentary, full version history, diff lineage, learning signals drawer
- **Stage 5 — Learning synthesis**: cross-stage learning signals, reusable analysis patterns (with maturity lifecycle: seed → validated → contradicted → retired), refinement triggers, freshness detection, partial-generation recovery

### Known limitations
- localStorage only — no cross-device persistence or export
- Large sessions may approach localStorage size limits (~5 MB typical)
- Stage 5 generation is token-budget constrained (4 000 tokens); partial responses are detected and flagged in the UI
- Demo mode uses mock data — live analysis requires an Anthropic API key
- No mobile layout optimization

---

## Hosting (Vercel / Netlify)

```bash
npm run build
# output directory: dist/
```

**Vercel** (recommended for Vite):
- Connect repo → Framework: Vite → Build: `npm run build` → Output: `dist`
- Add `VITE_ANTHROPIC_API_KEY` as an environment variable if you want live analysis in the hosted demo
- Without the key, the app runs in demo mode automatically

**Netlify:**
- Build command: `npm run build` → Publish directory: `dist`
- Add redirect: `/* → /index.html → 200` (Netlify `_redirects` file or `netlify.toml`)

**GitHub Pages:**
- Requires `base` path config in `vite.config.js` if serving from a subdirectory
- Vercel/Netlify are simpler for SPA routing — GitHub Pages is not recommended without extra config

---

## Phase 2 — planned work

> Do not build these inside DomainIQ. These are separate workstreams.

- **Strategy Basis Package export** — JSON export of curated Stage 1–3 basis from a DomainIQ session; import bridge for downstream tools
- **PDLC / business strategy tool** — separate application; consumes the Strategy Basis Package; product roadmap, cross-functional execution planning, department-level PDLC alignment
- **Section-level strategy refinement** — inline editing and re-generation of individual Stage 3 sections
- **Session sharing / import-export** — JSON round-trip for cross-device and team use

Next branch: `feature/strategy-basis-export`
