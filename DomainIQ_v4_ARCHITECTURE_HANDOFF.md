# DomainIQ v4 — Architecture Handoff

Branch: `feature/domainiq-stage2`  
Stack: React 18 + Vite, plain JS, direct Anthropic browser API, localStorage persistence.  
Model: `claude-sonnet-4-6`

---

## Current Product Thesis

DomainIQ is an **evidence-anchored domain analysis workspace** where the analyst is the governing intelligence.

The system does not produce answers. It produces a structured, inspectable belief graph — assertions grounded in evidence, with confidence ratings, dependency relationships, and preserved contradictions — that an analyst can interrogate, challenge, and progressively sharpen.

The investigative workflow is a deliberate funnel:
1. **Stage 1 (Orientation)** — establish what the entity is, extract major assertions, surface open questions
2. **Stage 2 (Contextual Expansion)** — retrieve competitor signals, ground evidence, surface tensions; then execute bounded directional pivots to deepen specific analytical threads one at a time
3. **Stage 3+ (Synthesis)** — deferred; requires an accumulated pivot layer with meaningful material before synthesis is warranted

The pivot architecture is the core design bet: **depth through accumulation of bounded, typed, user-directed investigative calls — never through one giant synthesis prompt.**

---

## 1. Product Philosophy

### What DomainIQ IS
A **governed analysis workspace** for evidence-first domain research.  
The analyst remains the governing intelligence. The system surfaces evidence, flags uncertainty, and preserves contradiction. It never synthesises autonomously or hides its reasoning.

Core properties every feature must preserve:

- **Inspectability** — every assertion, every piece of evidence, every confidence rating is visible and addressable independently. No black-box outputs.
- **Bounded inference** — the system never expands scope beyond what the analyst has authorised. Each API call has a hard token budget and a specific analytical direction.
- **Evidence lineage** — every Stage 2 finding, every pivot result, every refinement traces back to a Stage 1 node ID. Lineage is structural, not cosmetic.
- **Anti-sycophancy** — pressure tests evaluate the original claim AND the challenge against retrieved evidence. The model is not instructed to agree with the user. The decision is evidence-driven.
- **Strategic reasoning under uncertainty** — unresolved tensions are preserved, not collapsed. `mark_unresolved` is a legitimate and valued outcome. Forced resolution is a failure mode.

### What DomainIQ IS NOT
- Not a market report generator
- Not an AI research assistant that synthesises everything at once
- Not a one-shot analysis tool
- Not AI-strategy-specific (AI adoption was only a stress-test category)
- Not a replacement for analyst judgment
- Not a multi-agent orchestration system — no autonomous agent chains, no recursive spawn, no self-directed pivot sequences without explicit analyst initiation and milestone approval

### Domain scope
DomainIQ must support all of: company analysis, industry analysis, domain/workflow analysis, operational analysis, product strategy, competitive positioning, ecosystem analysis. No feature should be hardcoded for any single analytical category.

---

## 2. Current Architecture

### Stage 1 — Orientation
**Purpose:** establish what the entity is, major assertions, tensions, open questions.  
**Input:** entity (name, type, optional context) + intent (what, why, role, depth, outcome) + generationPolicy.  
**Output:** `session.stage1` — `summary`, `nodes[]`, `openQuestions[]`, `inferredPatterns[]`, `refinementHistory[]`.  
**API call:** `callClaude(prompt, 3500)`  
**Prompt builder:** `buildStage1Prompt({ entity, intent, policy })`

#### InferenceNode shape
```js
{
  id:                'n1',
  type:              'finding|assumption|hypothesis|risk|opportunity|constraint',
  statement:         'single addressable claim ≤60 words',
  confidence:        'high|medium|low',
  evidence_type:     'verified_fact|user_provided|inferred_strategy|hypothesis',
  dependsOn:         [],          // IDs of nodes this logically depends on
  userStatus:        'pending|accepted|challenged|rejected|needs_review',
  userNote:          null,        // free text from challenge modal
  userPreset:        null,        // preset from challenge modal
  previousStatement: null,        // set on revise_claim; preserves pre-revision statement
  changeReason:      null,
  lastUpdated:       null,
}
```

#### Pressure testing
Two modes — governed by `mode` param in `buildPressureTestPrompt`:
- `'user_challenge'` — adversarial; evaluates user challenge against retrieved evidence
- `'system_review'` — precision hardening; no user input; sharpens vague or weak claims

Four decisions: `preserve_original | revise_claim | mark_unresolved | retrieval_failed`

**API call:** `callClaudeWithSearch(prompt, 3500, 3)` (max 3 web searches)

`computeDiff` + `applyDiff` in `v4utils.js` handle the node mutation. Stage 1 nodes are never mutated by Stage 2 — only by accepted pressure test results.

#### `inferredPatterns`
Reusable analytical strategy lenses — NOT company-specific observations.  
Each pattern must describe a transferable heuristic an analyst would carry into a *different* domain.  
Schema: `{ title, insight, transferability: 'broad|sector-specific|niche', confidence }`

---

### Stage 2 — Orientation Pass
**Purpose:** contextual expansion — deepen Stage 1 assertions with competitor signals, evidence grounding, strategic tensions, refinement proposals.  
**Input:** `buildStage2ContextPacket(session)` → accepted/refined/unresolved nodes + open questions + patterns.  
**Output:** `session.stage2` with 10 sections + `pivots: []` extension point.  
**API call:** `callClaudeWithSearch(prompt, 5500, 5)` (max 5 web searches)

> **Design intent:** The orientation pass is **intentionally broad-but-shallow**. It surveys the competitive landscape, surfaces tensions, and identifies open questions — but does not attempt to resolve them. Depth comes from directional pivots executed after the pass. The orientation pass is the map; pivots are the investigations.

#### Stage 2 `session.stage2` shape
```js
{
  id, stageNumber: 2, generatedAt,
  summary:                { whatChanged, strongestEvidence, weakestAreas, dominantTensions, likelyDirection },
  evidenceConsolidation:  [],   // max 3; nodeId + sources[]
  competitorMap:          [],   // max 3
  emergingEntrants:       [],   // max 2
  adjacencyOpportunities: [],   // max 2; connectedNodeIds[]
  refinedAssertions:      [],   // max 3; proposals only — Stage 1 NOT auto-mutated
  contradictionMap:       [],   // max 3; tensions preserved, not collapsed
  unresolvedQuestions:    [],   // max 3
  stage3ReadinessSummary: {},   // 6 arrays; max 2 items each
  recommendedNextActions: [],   // max 3
  pivots:                 [],   // ← pivot accumulation layer; empty post-orientation
}
```

**CRITICAL:** `refinedAssertions` are proposals only. `userStatus: 'pending|accepted|rejected'` lives on the Stage 2 object. Stage 1 nodes are NOT touched until the analyst accepts a refinement (Milestone 3+ concern).

#### Output size constraints (in prompt)
All string fields ≤20 words. Snippet excerpts ≤25 words. No paragraphs, no narration before/after JSON. Response must begin with `{` and end with `}`.

#### Known render failure mode — `InvalidStage2Banner`
`parseSearchResponse` fallback (designed for pressure tests) returns a `retrieval_failed` sentinel without a `summary` key. When this lands in `session.stage2`, `SummarySection` crashes.  
**Fix in place:** `SummarySection` null guard + `InvalidStage2Banner` renders a visible diagnostic when `!stage2.summary`. No silent blank screen.

---

### Stage 2 — Pivot Architecture (Milestone 2 scaffold)

**Purpose:** directional investigative pivots that deepen one analytical direction at a time, grounded in Stage 1 assertion lineage.

**Conceptual flow:**
```
Stage 1 orientation
  → Stage 2 orientation pass  (contextual landscape)
    → Pivot launcher           (recommended pivots, user-directed)
      → Executed pivots        (bounded, typed, lineage-linked)
        → Accumulated pivot layer  (foundation for Stage 3)
```

Each pivot:
- One bounded API call, one analytical direction
- Tied to specific Stage 1 node IDs (`targetNodeIds`)
- Produces a small, inspectable result
- Appended to `session.stage2.pivots[]`
- Never triggers automatically; user executes each

#### Pivot result shape (universal wrapper)
```js
{
  id, type, label, targetNodeIds, generatedAt, status,
  result: {
    pivotSummary:         '≤20 words',
    nodeImpacts:          [{ nodeId, impact, impactNote }],   // max 3
    openTensions:         ['≤15 words each'],                 // max 2
    suggestedNextPivots:  ['pivot_type'],                     // max 2
    findings:             [...],   // type-specific; max 3–5 items
  }
}
```

#### `contextual_competition` findings shape (first live pivot type)
```js
{ name, type, segmentOverlap, strategicDivergence, implication, url }
```

#### `operational_constraints` findings shape (second planned pivot type)
```js
{ constraint, constraintType, affectedNodeIds, severity, implication, url }
```

---

### Evidence Model
- `verified_fact` — publicly established, unambiguous
- `user_provided` — from entity context field (L2 trust)
- `inferred_strategy` — logical inference from domain knowledge
- `hypothesis` — speculative, needs validation

Evidence type propagates from Stage 1 node through all pressure test and Stage 2 references. It is never upgraded without retrieval evidence.

---

## 3. Stable Implementation Decisions

### Intentionally preserved
- **Stage 1 is immutable from Stage 2.** Only pressure test `applyDiff` can mutate Stage 1 nodes.
- **Orientation pass is retained.** It is the entrypoint to the pivot system, not replaced by it.
- **Free-text `recommendedNextActions` preserved alongside typed pivot recommendations.** They serve different purposes (strategic guidance vs executable workflow hooks).
- **Pressure test decisions include `mark_unresolved`.** Forced resolution is worse than acknowledged uncertainty.
- **`inferredPatterns` label unchanged.** Content framing changed (transferable lenses, not company observations), but the UI section label stays until the workflow stabilises.
- **`pivots: []` initialised explicitly after `...stage2Data` spread** to prevent API response keys from polluting the pivot accumulation layer.

### Intentionally deferred
- Stage 3 synthesis — needs M3–M5 pivot accumulation to have something to synthesise
- Stage 4 artifact generation — deferred
- Stage 5 transferable pattern intelligence — deferred
- Cross-pivot synthesis — deferred; recreates orchestration chaos
- `refinedAssertions` acceptance → Stage 1 mutation — deferred to Milestone 3+
- Auto-pivot chaining — explicitly prohibited
- Dependency propagation systems — deferred
- `adoptionDynamics`, `businessModelPressures`, `emergingDisruption`, `adjacentCapabilities` live pivot types — deferred until M3 `contextual_competition` is stable

---

## 4. Pivot Taxonomy

All pivot types are **domain-agnostic**. They apply equally to company, industry, workflow, operational, product, competitive, and ecosystem analysis.

| Type | Analytical question | Most useful when |
|---|---|---|
| `contextual_competition` | Who else operates here; what does their approach imply about maturity and positioning? | `competitorMap.length > 0` or `opportunity` nodes exist |
| `operational_constraints` | What structural friction, regulation, or implementation reality limits the assertions? | `constraint`/`risk` nodes exist or compliance tensions in contradictionMap |
| `adoption_dynamics` | How do buyers/users actually behave? What triggers, blockers, change-management needs exist? | Multiple `assumption` nodes or `business_model_tension` |
| `business_model_pressures` | How is value captured and distributed? Where do tensions and ceiling effects live? | `pricing_conflict` or `business_model_tension` in contradictionMap |
| `emerging_disruption` | What new entrants or approaches threaten the assumptions Stage 1 is built on? | `emergingEntrants.length > 0` or ≥3 unresolved questions |
| `adjacent_capabilities` | What capabilities from adjacent spaces are encroaching, enabling, or creating acquisition pressure? | `adjacencyOpportunities.length > 0` |

### Recommendation logic
`computePivotRecommendations(session)` in `v4utils.js` — pure JS, no AI call, runs client-side.  
Produces up to 3 recommendations sorted by score. Score thresholds: ≥3 → high, ≥2 → medium, ≥1 → low.

### Target node inference
`recommendTargetNodes(pivotType, stage1Nodes, stage2)` in `v4utils.js` — returns max 3 node IDs.  
Pre-populates `TargetNodeSelector`. User can edit before executing.

---

## 5. Known Failure Modes

### Token overrun → truncated JSON → `retrieval_failed` fallback
`parseSearchResponse` falls back to a pressure-test sentinel object (no `summary` key) when `extractJsonObject` cannot find a closed `{...}` block. This happens when the Stage 2 JSON is truncated at the `maxTokens` ceiling.  
**Mitigation in place:** output size constraints (3/3/2/2/3/3/3 limits), ≤20 word strings, "output MUST begin with `{` and end with `}`" instruction, `InvalidStage2Banner` for visibility.  
**Not yet fixed:** `parseSearchResponse` fallback is still a pressure-test shape. A Stage 2–specific validation step before `setSession` would catch this at the data layer.

### Giant synthesis blobs
Single-call comprehensive synthesis → token pressure → truncation → silent failure.  
**Mitigation:** pivot architecture fragments synthesis into bounded, typed, individually-executed units.

### Orchestration chaos
Autonomous pivot chains, recursive synthesis, cross-pivot dependency propagation.  
**Mitigation:** each pivot is one API call, user-initiated, no automatic follow-on.

### Schema drift
Model occasionally wraps JSON in container keys (`{ "stage2Analysis": {...} }`) or uses different field names. `extractJsonObject` finds the outermost `{...}` correctly, but wrapped shapes produce `stage2.summary = undefined`.  
**Mitigation:** `InvalidStage2Banner` surfaces the available keys; parser hardening is a future task.

### Context-window degradation
Long sessions with many pressure tests → context grows → Stage 2 prompt grows → less room for output.  
**Mitigation:** `buildStage2ContextPacket` extracts only accepted/refined/unresolved nodes, not all nodes. Token budget enforced in prompt.

### Recursive refinement traps
Chaining: pressure test → revise → pressure test → revise → ... without analyst review.  
**Mitigation:** every revision requires explicit `handleAcceptDiff` from the analyst. No auto-apply.

### `needs_review` immediate firing
"Needs review" click triggers `system_review` pressure test immediately (by design). No confirmation modal. This is intentional — the system auto-hardenes the node. Document this so future sessions don't "fix" it.

---

## 6. Key Architectural Lessons Learned

These were learned through implementation failures and design iteration. Preserve them — do not repeat the underlying mistakes.

### Bounded prompts beat comprehensive prompts
Stage 2 was initially designed as a single comprehensive research-and-synthesis call. Token overrun caused silent JSON truncation, which caused parse failures, which caused blank renders with no diagnostic. The failure was invisible until `InvalidStage2Banner` was added.  
**Lesson:** Bounded, typed, purpose-specific API calls produce reliable, inspectable results. Comprehensive synthesis calls accumulate failure modes faster than they accumulate analytical value.

### Giant synthesis is a failure mode dressed as a feature
There is a recurring temptation to produce one large, complete output per call. Under token pressure this produces outputs that *look* complete but are analytically shallower than what the budget actually supports — and they fail silently.  
**Lesson:** When token pressure appears, reduce analytical breadth before reducing reasoning quality. Fewer, sharper items beat more, flatter items.

### Preserved uncertainty is analytically superior to forced resolution
`mark_unresolved` was added late, after early designs forced every pressure test to reach a `preserve_original` or `revise_claim` decision. Ambiguous evidence forced into a binary decision produces analytically confident but unreliable outputs.  
**Lesson:** Unresolved tensions are first-class outputs. The system must make it easy to express uncertainty, not mask it.

### Orchestration complexity grows faster than analytical value
Every time autonomous chaining was considered — auto-pivots, cross-pivot synthesis, recursive dependency propagation — the complexity overhead of managing state exceeded the analytical benefit.  
**Lesson:** User-initiated, one-at-a-time execution is not a UX limitation. It is the mechanism that keeps the analyst in the governing role and prevents undetected reasoning failures.

### Evidence lineage must be structural, not cosmetic
When lineage is prose (e.g., "based on Stage 1 findings"), it erodes under model summarisation and token pressure. When it is structural (pivot `targetNodeIds[]`, Stage 2 `nodeId` references, dependency graph in `dependsOn[]`), it survives compression.  
**Lesson:** Wire lineage as data. Every Stage 2 output and every pivot result must reference its source node IDs explicitly in the schema — not only in natural language.

---

## 7. Current Milestone State

### ✅ Milestone 1 — Stable orientation pass
- Stage 1 orientation: complete
- Pressure testing (user challenge + system review): complete
- Stage 2 orientation pass: complete
- Output size constraints (3/3/2/2/3/3 limits): complete
- `InvalidStage2Banner` for invalid Stage 2 state: complete
- `SummarySection` null guard: complete
- `inferredPatterns` as transferable analytical lenses: complete (one-line insight description fix)

### ✅ Milestone 2 — Pivot scaffold
- `pivots: []` extension point on `session.stage2`: complete
- `computePivotRecommendations(session)` pure utility: complete
- `recommendTargetNodes(pivotType, stage1Nodes, stage2)` pure utility: complete
- `PivotLauncher` component (collapsed, indicator badge): complete
- `PivotCard` with priority badge, target node chips: complete
- `TargetNodeSelector` inline checkbox list (max 3): complete
- `PivotTypePicker` for manual pivot addition: complete
- `handleRunPivot` stub in SessionFlow (wired, no-op): complete
- `PIVOT_TYPE_META` registry for 6 pivot types: complete

### 🔲 Milestone 3 — First live pivot: `contextual_competition`
- `buildContextualCompetitionPivotPrompt(targetNodes, entity, intent, policy)` in `v4prompts.js`
- `MOCK_CONTEXTUAL_COMPETITION_PIVOT` for demo mode
- `handleRunPivot` filled in SessionFlow: calls `callClaudeWithSearch(prompt, 3500, 3)`, parses, appends to `session.stage2.pivots[]`
- `PivotResultSection` component in Stage2Panel
- Inline failed-pivot state on `PivotCard` (localized, not stage-wide)
- Pivot running state on `PivotCard`

### ⏳ Milestone 4 — Deferred
Pivot recommendations surfaced during orientation pass generation. User selects which pivots to queue before leaving Stage 2.

### ⏳ Milestone 5 — Deferred
Accumulated pivots form a persistent contextual investigation graph. Tension map built across pivots. Stage 3 synthesis consumes `stage2.pivots[]` as a structured, lineage-linked evidence base rather than a flat list.

---

## 8. Next Implementation Target: Milestone 3

**Scope:** ONE live pivot type — `contextual_competition` only.

### What changes
1. **`src/v4prompts.js`** — add `buildContextualCompetitionPivotPrompt` and `MOCK_CONTEXTUAL_COMPETITION_PIVOT`
2. **`src/v4/SessionFlow.jsx`** — fill `handleRunPivot` for `contextual_competition` type; parse result; append to `session.stage2.pivots[]`; handle pivot `status: 'running' | 'complete' | 'failed'`
3. **`src/v4/Stage2Panel.jsx`** — add `PivotResultSection` renderer; update `PivotCard` with running/failed/complete states

### Pivot prompt constraints
- Single API call: `callClaudeWithSearch(prompt, 3500, 3)` (3500 tokens, max 3 searches)
- Context: only `targetNodeIds` nodes + entity/intent (not all Stage 1 nodes)
- Output: universal pivot wrapper + `findings[]` (max 3 items, `contextual_competition` shape)
- Must begin with `{` and end with `}`, no narration

### Failed pivot handling (Decision 3 from approval)
- Localized to the `PivotCard` — NOT a stage-wide banner
- Inline error message within the card
- Retry button re-executes with same type + targetNodeIds
- No blank render, no escalation

### Success criteria
- Running `contextual_competition` pivot on a live Paylocity session produces a visible, bounded result with ≤3 findings and ≥1 `nodeImpacts` entry
- Failed pivot shows inline error on card, not blank screen
- Other Stage 2 sections unaffected
- Build clean, zero errors

### Non-goals for Milestone 3
- Other pivot types
- Accepting `refinedAssertions` to mutate Stage 1
- Cross-pivot synthesis
- Pivot ordering or dependency
- Pivot deletion or editing post-execution

---

## 9. Operational Guardrails

These are non-negotiable constraints for all future implementation work:

| Guardrail | What it means |
|---|---|
| No giant prompts | Every API call has a specific analytical scope. Stage 2 orientation is the largest — `callClaudeWithSearch(prompt, 5500, 5)`. Pivots use `(prompt, 3500, 3)`. |
| No recursive orchestration | Each API call is triggered by explicit user action. No call spawns another call. No chains. |
| Bounded pivots | Each pivot: one call, one direction, one result, appended to `pivots[]`. Max 3 findings, max 3 node impacts. |
| Preserve inspectability | Every output must be addressable by node ID. No synthesised prose blobs without lineage. |
| No hidden mutation | Stage 1 nodes are immutable except via `applyDiff` after explicit analyst accept. Stage 2 refinements are proposals only. |
| No AI-specific hardcoding | All pivot types, prompt framing, and output schemas must work for any analytical domain. |
| No uncontrolled synthesis | Cross-pivot synthesis, Stage 3 synthesis, pattern extraction — all require explicit milestone gates and analyst direction. |
| No autonomous multi-agent orchestration | No self-directed pivot chains, no recursive agent spawning, no automatic follow-on calls. Every API call is triggered by explicit analyst action. Any multi-step orchestration requires explicit milestone approval before implementation. |
| Scope-over-depth under token pressure | When token budget pressure appears, reduce analytical breadth (fewer items, narrower scope) before reducing reasoning quality. A shallow answer across 5 topics is worse than a sharp answer across 2. Never compress reasoning to fit more output. |
| Edit protocol | Confirm branch + git status → read relevant files → propose change → wait for approval → edit → `npm run build`. Never edit without reading first. |
| Dependency rule | No new npm dependencies without explicit approval. No Tailwind, shadcn, lucide, path aliases unless already configured. |
| CLAUDE.md scope rule | DomainIQ stays focused on: company/domain analysis, operating model, personas, opportunities/triggers, governance/risk, evidence map, pattern library, portfolio artifact recommendations. No PDLC or Resume-JD modules. |

---

## Quick Reference: Key Files

| File | Role |
|---|---|
| `src/api.js` | `callClaude`, `callClaudeWithSearch`, `parseSearchResponse`, `extractJsonObject` |
| `src/v4utils.js` | Pure utilities: `computeDiff`, `applyDiff`, `buildAcceptedSummary`, `buildStage2ContextPacket`, `computePivotRecommendations`, `recommendTargetNodes`, `policyLabel` |
| `src/v4prompts.js` | Prompt builders: `buildStage1Prompt`, `buildPressureTestPrompt`, `buildStage2Prompt` + mocks |
| `src/v4/SessionFlow.jsx` | Main orchestrator: all handlers, step state, session persistence |
| `src/v4/Stage1Panel.jsx` | Stage 1 UI: nodes, diffs, open questions, inferred patterns, Stage 2 trigger |
| `src/v4/Stage2Panel.jsx` | Stage 2 UI: orientation sections, `InvalidStage2Banner`, `PivotLauncher` + pivot components |
| `src/v4/NodeCard.jsx` | Individual node: status actions, challenge/needs-review routing |
| `src/v4/DiffView.jsx` | Pressure test diff: before/after, quality delta, evidence citations |
| `src/v4/ChallengeModal.jsx` | User challenge input: preset + free-text note |
| `src/v4/IntentCapture.jsx` | Entity + intent form |

## Quick Reference: Step States
`'intent' | 'generating' | 'inspect' | 'regenerating' | 'stage2_generating' | 'stage2'`

## Quick Reference: localStorage
Keys: `diq_v4_*` — sessions keyed by session ID. Full `session` object serialised per key.

## Quick Reference: API Token Budgets
| Call | Tokens | Max searches |
|---|---|---|
| Stage 1 | 3500 | — |
| Pressure test | 3500 | 3 |
| Stage 2 orientation | 5500 | 5 |
| Pivot (M3) | 3500 | 3 |
