# DomainIQ v3 — Product Specification

**Version:** 3.0.0  
**Status:** Checkpoint — evidence-first UI, standalone product  
**Last updated:** 2026-05-14

---

## What DomainIQ is

DomainIQ is **Product 1** in a three-product suite. It is a standalone evidence-first domain research and portfolio intelligence tool for PM and BA professionals.

It is not a PDLC tool. It is not a resume tool. Those are separate future products.

---

## What DomainIQ does

1. Analyze any company, industry, or domain
2. Generate an operating model map (8 dimensions)
3. Profile buyer and stakeholder personas with objections, triggers, and proof requirements
4. Identify strategic opportunities ranked by impact, effort, and horizon
5. Model the delivery operating model with phased outputs and PM/BA leverage points
6. Surface governance and risk concerns with evidence typing
7. Produce an Evidence Map — every significant claim typed, sourced, and confidence-rated
8. Extract transferable cross-domain patterns into a growing library
9. Recommend portfolio artifacts: what to build, why it's credible, what it proves
10. Maintain a separate positioning overlay layer (L5) for role-specific framing

---

## Five memory layers

| Layer | Name | Contents | Rule |
|-------|------|----------|------|
| L1 | Raw project research | AI-generated analysis output | Always labeled as inference |
| L2 | Extracted claims | Typed claims with source and confidence | verified_fact / user_provided / inferred_strategy / hypothesis |
| L3 | Transferable patterns | Cross-domain insights with lineage | Source, confidence, counterexamples, domain scope |
| L4 | Portfolio artifact ideas | What to build, why, what it proves | Per-analysis, role-aware |
| L5 | Positioning overlays | Role-specific framing | Always flagged separately. Never blended into L1–L3 |

**Invariant:** These layers are never silently blended. The UI always makes the layer and trust level visible.

---

## Trust taxonomy

| Code | Label | Color | Meaning |
|------|-------|-------|---------|
| `verified_fact` | Verified fact | Green | Publicly established, unambiguous |
| `user_provided` | User-provided | Blue | Came from user context input |
| `inferred_strategy` | Inferred | Orange | Logical inference from domain knowledge |
| `hypothesis` | Hypothesis | Purple | Speculative — needs validation before citing |

Every claim in every view carries one of these labels. No claim appears without a trust type.

---

## Tabs (per project)

| Tab | Layer | Contents |
|-----|-------|----------|
| Setup | — | Domain input, lens, stage, context, overlay, focus areas |
| Operating model | L1 | 8 operating model dimensions, each with evidence_type and confidence |
| Personas | L1 | Buyer/stakeholder profiles: use case, proof, objections, trigger, overlay note |
| Opportunities | L1 | Strategic opportunities: impact, effort, horizon, trigger, description |
| Delivery model | L1 | Phased delivery: archetype, phases, PM/BA leverage, failure modes |
| Governance | L1 | Risk areas with risk level, evidence type, and description |
| Evidence map | L2 | Full claim table: claim, type, source, confidence, used-in |
| Artifacts | L4 | Portfolio artifact plan + positioning overlay (L5) if enabled |
| Narrative | L1 | Executive narrative, labeled as inference |

---

## System views (sidebar)

| View | Contents |
|------|----------|
| Home | Product orientation, five layers, trust taxonomy, demo/new buttons |
| Pattern library | L3 patterns: title, category, insight, confidence, counterexamples, domains |
| My overlays | L5 overlays across all projects: safe language, avoid-claiming guidance |

---

## Persistence

- localStorage (browser) for this checkpoint
- Keys: `diq_v3_projects`, `diq_v3_patterns`
- Projects and patterns persist across sessions in the same browser
- No server, no database in this checkpoint

---

## API key

Set `VITE_ANTHROPIC_API_KEY=sk-ant-...` in `.env.local` to enable live analysis.  
Without a key, the app loads mock/seed data (Finlytica.ai reference analysis) and the full UI is explorable.

---

## What is NOT in this checkpoint

- PDLC tool (Product 2) — not implemented
- Resume-JD tool (Product 3) — not implemented
- Export to PDLC or Resume tools — not implemented (see PRODUCT_SUITE_ARCHITECTURE.md for schema)
- Server-side persistence — not implemented
- Multi-user / team features — not implemented
- GitHub push / CI — not implemented
