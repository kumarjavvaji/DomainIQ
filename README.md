# DomainIQ v3

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

- Projects and patterns persist in **localStorage** (per browser)
- No server or database in this checkpoint
- To reset: DevTools → Application → Local Storage → delete `diq_v3_projects` and `diq_v3_patterns`

---

## File structure

```
src/
  App.jsx          Main application — all UI panels and views
  main.jsx         React entry point
  index.css        Design tokens and global styles
  constants.js     Tab config, focus options, trust config, stage labels
  api.js           Anthropic API call + prompt builder
  useStorage.js    localStorage hooks for projects and patterns
  mockData.js      Seed data (Finlytica.ai reference analysis)
docs/
  DOMAINIQ_SPEC.md            Full product specification
  PRODUCT_SUITE_ARCHITECTURE.md  Three-product suite architecture + export schema
  RECOVERY_NOTES.md           How to restore and run from this checkpoint
```

---

## Checkpoint commit

```bash
git init
git add .
git commit -m "Checkpoint DomainIQ v3 evidence-first UI"
```
