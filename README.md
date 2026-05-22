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

The app runs in **demo mode** without an API key — the full UI is explorable using the Finlytica.ai reference analysis as seed data.

---

## Enable live AI analysis

Create `.env.local` in the project root:

```
VITE_ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```

Restart the dev server. The app will run live analysis via the Anthropic API.

---

## What DomainIQ does

1. **Operating model** — 8-dimension map: value prop, customers, revenue, capabilities, processes, tech, ecosystem, metrics
2. **Personas** — buyer/stakeholder profiles with objections, proof requirements, and buying triggers
3. **Opportunities** — ranked by impact, effort, and horizon with specific buying triggers
4. **Delivery model** — phased operating model with PM/BA leverage points and failure modes
5. **Governance** — risk surface with evidence typing (regulatory facts vs hypotheses)
6. **Evidence map** — every claim typed, sourced, and confidence-rated
7. **Artifacts** — portfolio artifact recommendations with credibility rationale and interview signal
8. **Narrative** — executive-level summary for interview and discovery call prep
9. **Pattern library** — cross-domain patterns that grow more precise with each analysis

---

## Five memory layers

| Layer | Contents |
|-------|----------|
| L1 | Raw project research — always labeled as inference |
| L2 | Extracted claims — verified / user-provided / inferred / hypothesis |
| L3 | Transferable patterns — with lineage, confidence, counterexamples |
| L4 | Portfolio artifact ideas — what to build, why credible, what it proves |
| L5 | Positioning overlays — role framing, always flagged separately |

These layers are **never silently blended**.

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

## Product scope

DomainIQ is **Product 1** in a three-product suite. It is standalone.

- **Product 2: PDLC Tool** — not implemented (future)
- **Product 3: Resume-JD Tool** — not implemented (future)

See `docs/PRODUCT_SUITE_ARCHITECTURE.md` for the full suite architecture and planned export schema.

---

## Persistence

- Sessions persist in **localStorage** (per browser)
- No server or database
- v4 keys: `diq_v4_sessions`, `diq_v4_policy`
- v3 keys (legacy): `diq_v3_projects`, `diq_v3_patterns`
- `_rawSearchBlocks` (Anthropic web search evidence) are stripped from persisted session data to avoid localStorage bloat — they are kept in memory only during the active session
- To reset v4: DevTools → Application → Local Storage → delete `diq_v4_sessions` and `diq_v4_policy`

---

## File structure

```
src/
  App.jsx            Main application — session list, routing, v3/v4 view switching
  main.jsx           React entry point
  index.css          Design tokens and global styles
  api.js             Anthropic API: callClaude(), callClaudeWithSearch()
  v4schema.js        Session schema, storage keys, default generation policy
  v4utils.js         Pure utilities: diff, dependency resolution, basis hash, pivot scoring
  v4storage.js       localStorage hooks for v4 sessions and generation policy
  v4prompts.js       Prompt builders: Stage 1, Pressure Test, Stage 2, Pivot + mock data
  v4/
    SessionFlow.jsx  Top-level v4 session orchestrator — all stage transitions and handlers
    IntentCapture.jsx  Entity + intent input form
    Stage1Panel.jsx  Node inspection, diff view, Stage 2 trigger
    Stage2Panel.jsx  Evidence consolidation display, investigative pivot launcher + results
    NodeCard.jsx     Individual assertion card with status controls
    DiffView.jsx     Pressure test result — before/after diff with accept/discard
    ChallengeModal.jsx  User challenge input
docs/
  DOMAINIQ_SPEC.md            Full product specification
  PRODUCT_SUITE_ARCHITECTURE.md  Three-product suite architecture + export schema
```

---

## Current v4 status

### Completed

- **Stage 1 — Orientation**: entity + intent capture, 8–12 typed assertion nodes, confidence ratings, open questions, inferred patterns
- **Node inspection**: accept / reject / challenge / needs-review status per node; challenge modal with preset and freeform note
- **Pressure testing**: user-directed or system-initiated; web retrieval via `callClaudeWithSearch`; four decisions — `revise_claim`, `preserve_original`, `mark_unresolved`, `retrieval_failed`; before/after diff view with accept/discard
- **Stage 1 basis hash**: deterministic hash of node content; detects when Stage 1 has changed after Stage 2 was generated; stale banner with one-click regeneration
- **Stage 2 — Research expansion**: evidence consolidation, competitor map, emerging entrants, adjacency opportunities, refined assertions, contradiction map, unresolved questions, Stage 3 readiness summary, recommended next actions
- **Stage 2 regeneration**: always available from Stage 1 via the Re-run button, regardless of whether Stage 2 has previously been generated
- **Investigative pivots** (inline Stage 2 layer, no new step):
  - Pivot recommendations scored from orientation data; manual add also available
  - Optional user direction per pivot
  - Live execution via `callClaudeWithSearch` (7 000 token budget, up to 6 searches)
  - Two-layer output: concise display summary always visible; analysis foundation (deeper finding, evidence synthesis, strategic tension, Stage 3 implications, assumptions to test) collapsed by default
  - Proposed updates target specific Stage 2 sections; Accept / Refine / Reject per proposal
  - Accepted and refined proposals are tracked for Stage 3 consumption
  - Pivot results persisted in `session.stage2.pivots`; stale badge when pivot was generated from an older Stage 2 pass
- **localStorage sanitization**: `_rawSearchBlocks` stripped from `session.stage2` and each `session.stage2.pivots[*]` at persistence boundary; kept in memory only

### In progress / needs validation

- Stage 2 section depth under live API: emerging entrants, adjacency opportunities, unresolved questions, and recommended next actions recently had their item caps and word caps increased — output quality with the updated prompt caps needs validation on real sessions
- Pivot proposal quality: proposals reference Stage 2 section text by string match; no structural linkage to the actual Stage 2 data objects yet

### Next milestone — Stage 3

Stage 3 will consume the curated analytical basis assembled in Stages 1 and 2:

- **Stage 1 canonical basis**: accepted and pressure-tested assertions with confidence ratings
- **Stage 2 evidence synthesis**: evidence consolidation, competitor map, contradiction map, Stage 3 readiness summary
- **Accepted / refined Stage 2 refinement proposals**: assertions already grounded by retrieval evidence
- **Accepted / refined pivot proposals**: focused analytical angles approved by the user

Stage 3 is not yet implemented.

---

## Checkpoint commit

```bash
git init
git add .
git commit -m "Checkpoint DomainIQ v4 Stage 2 + investigative pivots"
```
