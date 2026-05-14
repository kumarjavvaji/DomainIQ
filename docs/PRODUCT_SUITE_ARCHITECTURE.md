# Product Suite Architecture

**Version:** 1.0 — checkpoint  
**Date:** 2026-05-14  
**Status:** DomainIQ only implemented. PDLC and Resume-JD are future products.

---

## Three-product suite overview

```
┌─────────────────────────────────────────────────────────┐
│  Product 1: DomainIQ                   ← IMPLEMENTED    │
│  Evidence-first domain research &                       │
│  portfolio intelligence tool                            │
└──────────────────────┬──────────────────────────────────┘
                       │ (future: export context)
          ┌────────────┴────────────┐
          ▼                         ▼
┌─────────────────────┐   ┌──────────────────────────────┐
│  Product 2:         │   │  Product 3:                  │
│  PDLC Tool          │   │  Resume-JD Intelligence Tool │
│                     │   │                              │
│  NOT IMPLEMENTED    │   │  NOT IMPLEMENTED             │
└─────────────────────┘   └──────────────────────────────┘
```

---

## Product 1: DomainIQ (this repo)

**Status:** Implemented — checkpoint v3  
**Scope:** Standalone. Does not depend on Products 2 or 3.

DomainIQ's job is to help a PM or BA deeply understand a business domain and convert that research into defensible portfolio artifacts. It produces evidence-typed research, pattern libraries, and artifact recommendations — all from a clean analytical perspective.

DomainIQ does NOT:
- Generate product requirements or epics (Product 2)
- Map JDs to resume bullets (Product 3)
- Contain any UI elements or sidebar actions referencing Products 2 or 3

---

## Product 2: PDLC Tool (future)

**Status:** Not implemented. Do not build until DomainIQ is stable.

**Purpose:** Turn research into product delivery artifacts.

**Inputs (future):**
- May accept exported DomainIQ context (see Export Schema below)
- User-provided JD, product brief, or discovery notes

**Planned outputs:**
- Product strategy brief
- PRD (product requirements document)
- Jira-ready epics and user stories
- Acceptance criteria
- Release plan
- UI design brief

**Architecture note:** PDLC Tool will be a separate repo and separate app. It is not a tab, module, or sidebar action inside DomainIQ.

---

## Product 3: Resume-JD Intelligence Tool (future)

**Status:** Not implemented.

**Purpose:** Map job description requirements against experience bank, identify gaps, generate tailored resume bullets, and build interview prep material.

**Architecture note:**
- Remains fully distinct from DomainIQ and PDLC Tool
- May optionally import selected DomainIQ context (e.g. a domain narrative or artifact list) to inform positioning language
- Does NOT sit inside the DomainIQ → PDLC pipeline
- Its primary input is a JD + experience bank, not a domain analysis

---

## DomainIQ export schema (placeholder — not implemented in UI)

When DomainIQ eventually supports exporting context to downstream tools, the export payload will follow this schema:

```json
{
  "export_version": "1.0",
  "exported_at": "<ISO timestamp>",
  "source_tool": "DomainIQ v3",
  "project": {
    "domain": "<string>",
    "industry": "<string>",
    "stage": "<string>",
    "lens": "<string>",
    "analyzed_at": "<ISO timestamp>"
  },
  "claims": [
    {
      "claim": "<string>",
      "evidence_type": "verified_fact | user_provided | inferred_strategy | hypothesis",
      "source": "<string>",
      "confidence": "high | medium | low",
      "used_in": ["<section>"]
    }
  ],
  "evidence_map": "<same structure as claims — full evidence map>",
  "operating_model": {
    "value_proposition": { "text": "<string>", "evidence_type": "<string>", "confidence": "<string>" },
    "customers": "...",
    "revenue_model": "...",
    "key_capabilities": "...",
    "key_processes": "...",
    "technology_signals": "...",
    "ecosystem": "...",
    "success_metrics": "..."
  },
  "personas": [
    {
      "title": "<string>",
      "role": "<string>",
      "first_use_case": "<string>",
      "proof_needed": "<string>",
      "objections": "<string>",
      "buying_trigger": "<string>",
      "evidence_type": "<string>",
      "confidence": "<string>"
    }
  ],
  "opportunities": [
    {
      "title": "<string>",
      "impact": "high | medium | low",
      "effort": "high | medium | low",
      "horizon": "now | next | later",
      "category": "<string>",
      "trigger": "<string>",
      "description": "<string>",
      "evidence_type": "<string>",
      "confidence": "<string>"
    }
  ],
  "delivery_model": {
    "archetype": "<string>",
    "phases": [
      { "name": "<string>", "timing": "<string>", "description": "<string>", "outputs": ["<string>"] }
    ],
    "pm_ba_leverage": "<string>",
    "common_failure_modes": "<string>"
  },
  "governance": [
    {
      "area": "<string>",
      "risk_level": "high | medium | low",
      "description": "<string>",
      "evidence_type": "<string>",
      "confidence": "<string>"
    }
  ],
  "artifact_recommendations": [
    {
      "title": "<string>",
      "why_credible": "<string>",
      "claims_it_proves": ["<string>"],
      "data_needed": "<string>",
      "interview_signal": "<string>"
    }
  ],
  "transferable_patterns": [
    {
      "title": "<string>",
      "category": "<string>",
      "insight": "<string>",
      "evidence_type": "<string>",
      "confidence": "<string>",
      "counterexamples": "<string>",
      "domain_applicability": "broad | sector-specific | niche",
      "domains_seen": ["<string>"],
      "times_seen": "<number>"
    }
  ],
  "kumar_overlay": {
    "applied": "<boolean>",
    "role_target": "<string>",
    "positioning_notes": "<string>",
    "safe_language": "<string>",
    "avoid_claiming": "<string>"
  }
}
```

---

## Build order

1. ✅ DomainIQ v3 — checkpoint (this repo)
2. ⬜ DomainIQ v3 — live API, additional analyses, pattern library growth
3. ⬜ DomainIQ — export endpoint (produces payload above)
4. ⬜ PDLC Tool — separate repo, consumes DomainIQ export
5. ⬜ Resume-JD Tool — separate repo, optional DomainIQ context import

---

## Guiding principles across all products

1. **Evidence typing is non-negotiable.** No claim is presented without its trust level.
2. **Layers never blend silently.** L1 research, L2 claims, L3 patterns, L4 artifacts, L5 overlays are always visually distinct.
3. **Positioning overlays are always flagged.** Role-specific framing (L5) never contaminates domain research (L1–L3).
4. **Defensibility over impressiveness.** Every artifact recommendation must be buildable without overclaiming.
5. **Each product is standalone first.** Integration comes after each product proves its own value.
