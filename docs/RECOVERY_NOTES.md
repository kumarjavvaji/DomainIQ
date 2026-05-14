# Recovery Notes — DomainIQ v3 Checkpoint

**Checkpoint name:** `domainiq-v3-checkpoint`  
**Commit message:** `Checkpoint DomainIQ v3 evidence-first UI`  
**Date:** 2026-05-14

---

## What this checkpoint contains

- Complete DomainIQ v3 React/Vite application
- Full evidence-first UI: operating model, personas, opportunities, delivery model, governance, evidence map, artifacts, narrative
- Five memory layers (L1–L5) — never silently blended
- Trust taxonomy on every claim: verified_fact, user_provided, inferred_strategy, hypothesis
- Persistent pattern library (localStorage)
- Persistent project library (localStorage)
- Positioning overlays (L5) — flagged separately
- Mock/seed data (Finlytica.ai reference analysis) — full UI works without an API key
- Product suite architecture documentation

---

## What is NOT in this checkpoint

- PDLC Tool (Product 2) — not implemented, not referenced in UI
- Resume-JD Tool (Product 3) — not implemented, not referenced in UI
- "Send to PDLC" sidebar action — removed
- "Tailor resume" sidebar action — removed
- Any cross-product navigation — removed
- Server-side persistence — not implemented
- GitHub remote — not pushed

---

## How to restore and run

```bash
# 1. Extract the zip to your dev folder
#    Place contents at: C:\Users\kumar\dev\DomainIQ

# 2. Open terminal in that folder
cd C:\Users\kumar\dev\DomainIQ

# 3. Install dependencies
npm install

# 4. Run dev server
npm run dev

# 5. Open in browser
#    http://localhost:5173
```

---

## How to enable live AI analysis

1. Create a file: `C:\Users\kumar\dev\DomainIQ\.env.local`
2. Add one line:
   ```
   VITE_ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
   ```
3. Restart the dev server: `npm run dev`

The `.env.local` file is gitignored and will never be committed.

---

## File tree at checkpoint

```
DomainIQ/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
├── .env.local          ← create this yourself, gitignored
├── docs/
│   ├── DOMAINIQ_SPEC.md
│   ├── PRODUCT_SUITE_ARCHITECTURE.md
│   └── RECOVERY_NOTES.md
├── public/
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── index.css
    ├── constants.js
    ├── api.js
    ├── useStorage.js
    └── mockData.js
```

---

## localStorage keys

| Key | Contents |
|-----|----------|
| `diq_v3_projects` | All analysis projects (JSON) |
| `diq_v3_patterns` | Cross-domain pattern library (JSON) |

To reset the app: open DevTools → Application → Local Storage → delete both keys.

---

## Known limitations at checkpoint

1. No API key = demo mode only (full UI, no live analysis)
2. localStorage only — no cross-device sync
3. Pattern library is per-browser — does not persist across machines
4. No export-to-file feature yet (see PRODUCT_SUITE_ARCHITECTURE.md for planned export schema)
5. No PDLC or Resume-JD integration (by design — separate future products)

---

## Git initialization (run locally after extracting zip)

```bash
cd C:\Users\kumar\dev\DomainIQ
git init
git add .
git commit -m "Checkpoint DomainIQ v3 evidence-first UI"
```

Do not push to GitHub until you are ready to share.
