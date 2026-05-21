import React, { useState, useCallback } from 'react'
import { useProjects, usePatterns } from './useStorage'
import { callClaude, buildPrompt, hasApiKey } from './api'
import { getTrust, confPct, TABS, FOCUS_OPTIONS, PERSONA_ICONS, ANALYSIS_STAGES } from './constants'
import { MOCK_PROJECT, MOCK_PATTERNS } from './mockData'
import { useSessions, useGenerationPolicy } from './v4storage'
import SessionFlow from './v4/SessionFlow'

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────
export default function App() {
  const { projects, saveProject, deleteProject } = useProjects()
  const { patterns, mergePatterns } = usePatterns()

  // v4 state — additive, does not replace v3
  const { sessions, saveSession, deleteSession } = useSessions()
  const { policy: globalPolicy } = useGenerationPolicy()
  const [activeSessionId, setActiveSessionId] = useState(null)

  const [view, setView]             = useState('home')   // home | project | patterns | overlays | v4session
  const [activeTab, setActiveTab]   = useState('setup')
  const [activeProjectId, setActiveId] = useState(null)

  // Setup form state
  const [domain, setDomain]         = useState('')
  const [lens, setLens]             = useState('Business Analyst')
  const [stage, setStage]           = useState('Unknown / infer')
  const [context, setContext]       = useState('')
  const [role, setRole]             = useState('')
  const [background, setBackground] = useState('')
  const [focuses, setFocuses]       = useState(['Operating model', 'Buyer personas', 'Pain & triggers', 'Growth levers'])

  // Loading state
  const [loading, setLoading]       = useState(false)
  const [loadStage, setLoadStage]   = useState(0)
  const [loadPct, setLoadPct]       = useState(0)
  const [loadLabel, setLoadLabel]   = useState('')

  const activeProject = activeProjectId ? projects[activeProjectId] : null
  const data = activeProject?.data || null

  const patternCount = Object.keys(patterns).length
  const sessionCount = Object.keys(sessions).length

  // ── Navigation ─────────────────────────────────────────────
  function goHome()     { setView('home');     setActiveId(null); setActiveSessionId(null) }
  function goPatterns() { setView('patterns'); setActiveId(null); setActiveSessionId(null) }
  function goOverlays() { setView('overlays'); setActiveId(null); setActiveSessionId(null) }

  // v4 session navigation — additive route, v3 routes unchanged
  function newV4Session() {
    const id = 'v4s_' + Date.now()
    setActiveSessionId(id)
    setActiveId(null)
    setView('v4session')
  }

  function openV4Session(id) {
    setActiveSessionId(id)
    setActiveId(null)
    setView('v4session')
  }

  function newProject() {
    const id = 'p_' + Date.now()
    setActiveId(id)
    setDomain(''); setContext(''); setRole(''); setBackground('')
    setFocuses(['Operating model', 'Buyer personas', 'Pain & triggers', 'Growth levers'])
    setView('project')
    setActiveTab('setup')
  }

  function openProject(id) {
    const p = projects[id]
    if (!p) return
    setActiveId(id)
    setDomain(p.domain || '')
    setContext(p.context || '')
    setView('project')
    setActiveTab(p.data ? 'model' : 'setup')
  }

  function toggleFocus(label) {
    setFocuses(prev =>
      prev.includes(label) ? prev.filter(f => f !== label) : [...prev, label]
    )
  }

  // ── Load mock demo ──────────────────────────────────────────
  function loadMockDemo() {
    const id = 'mock_' + Date.now()
    setActiveId(id)
    saveProject(id, {
      domain: MOCK_PROJECT.domain,
      context: '',
      ts: Date.now(),
      data: MOCK_PROJECT,
    })
    mergePatterns(MOCK_PROJECT.patterns, MOCK_PROJECT.domain)
    setView('project')
    setActiveTab('model')
  }

  // ── Run analysis ────────────────────────────────────────────
  async function runAnalysis() {
    if (!domain.trim()) return

    // If no API key, load mock instead
    if (!hasApiKey()) {
      loadMockDemo()
      return
    }

    setLoading(true)
    setLoadStage(0); setLoadPct(0)
    const existingPats = Object.values(patterns).slice(0, 6).map(p => p.title).join('; ')
    const prompt = buildPrompt({ domain, lens, stage, context, role, background, focuses, existingPatterns: existingPats })

    let si = 0
    const tick = setInterval(() => {
      if (si < ANALYSIS_STAGES.length) {
        setLoadStage(si)
        setLoadPct(ANALYSIS_STAGES[si].p)
        setLoadLabel(ANALYSIS_STAGES[si].l)
        si++
      } else clearInterval(tick)
    }, 800)

    try {
      const raw = await callClaude(prompt)
      clearInterval(tick)
      setLoadPct(100)
      const parsed = JSON.parse(raw)
      const pid = activeProjectId || ('p_' + Date.now())
      setActiveId(pid)
      saveProject(pid, { domain: parsed.domain || domain, context, ts: Date.now(), data: parsed })
      if (parsed.patterns) mergePatterns(parsed.patterns, parsed.domain || domain)
      setLoading(false)
      setActiveTab('model')
    } catch (e) {
      clearInterval(tick)
      setLoading(false)
      alert('Analysis failed. Check your API key and try again.')
    }
  }

  return (
    <div style={S.shell}>
      {/* Topbar */}
      <header style={S.topbar}>
        <span style={S.logo}>DOMAINIQ</span>
        <div style={S.sep} />
        <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--fm)' }}>
          Governed inference workspace
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Pill label="Sessions" value={sessionCount} accent="var(--accent)" />
          <Pill label="Patterns" value={patternCount} />
        </div>
      </header>

      {/* Body */}
      <div style={S.body}>
        {/* Sidebar */}
        <aside style={S.sidebar}>
          <div style={S.sidebarTop}>
            <button style={S.newBtn} onClick={newV4Session}>
              <i className="ti ti-plus" /> New session
            </button>
          </div>
          <div style={S.sidebarScroll}>
            <div style={S.sbSection}>
              <div style={S.sbLabel}>Views</div>
              <NavItem icon="ti-layout-dashboard" label="Home"            active={view === 'home'}     onClick={goHome} />
              <NavItem icon="ti-dna"              label="Pattern library" active={view === 'patterns'} onClick={goPatterns} badge={patternCount || null} />
              <NavItem icon="ti-user-star"        label="My overlays"     active={view === 'overlays'} onClick={goOverlays} />
            </div>

            {/* v4 sessions section */}
            <div style={S.sbSection}>
              <div style={S.sbLabel}>Sessions</div>
              {Object.keys(sessions).length === 0 && (
                <div style={{ fontSize: 10, color: 'var(--muted)', padding: '3px 8px' }}>No sessions yet</div>
              )}
              {Object.entries(sessions)
                .sort(([, a], [, b]) => (b.ts || 0) - (a.ts || 0))
                .map(([id, s]) => (
                  <div
                    key={id}
                    style={{
                      ...S.projItem,
                      color: activeSessionId === id ? 'var(--accent)' : 'var(--muted2)',
                      background: activeSessionId === id ? 'var(--s2)' : 'transparent',
                    }}
                    onClick={() => openV4Session(id)}
                  >
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: activeSessionId === id ? 'var(--accent)' : 'var(--border2)',
                    }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontFamily: 'var(--fm)' }}>
                      {s.entity?.name || 'New session'}
                    </span>
                    <button
                      style={S.delBtn}
                      onClick={e => { e.stopPropagation(); deleteSession(id); if (activeSessionId === id) goHome() }}
                    >
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ))
              }
            </div>

          </div>
        </aside>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {view === 'home'     && <HomeView onNew={newV4Session} apiKeySet={hasApiKey()} />}
          {view === 'patterns' && <PatternsView patterns={patterns} />}
          {view === 'overlays' && <OverlaysView projects={projects} />}
          {view === 'v4session' && (
            <SessionFlow
              key={activeSessionId}
              sessionId={activeSessionId}
              savedSession={sessions[activeSessionId] || null}
              globalPolicy={globalPolicy}
              apiKeySet={hasApiKey()}
              onSave={saveSession}
              onBack={goHome}
            />
          )}
          {view === 'project'  && (
            <>
              {/* Tab bar */}
              <div style={S.tabBar}>
                {TABS.map(t => (
                  <button
                    key={t.id}
                    style={{
                      ...S.tab,
                      color: activeTab === t.id ? 'var(--text)' : 'var(--muted)',
                      borderBottom: `2px solid ${activeTab === t.id ? 'var(--accent)' : 'transparent'}`,
                    }}
                    onClick={() => setActiveTab(t.id)}
                  >
                    <i className={`ti ${t.icon}`} /> {t.label}
                  </button>
                ))}
              </div>
              {/* Tab content */}
              <div style={S.tabContent}>
                {loading
                  ? <LoadingView stages={ANALYSIS_STAGES} currentStage={loadStage} pct={loadPct} label={loadLabel} />
                  : activeTab === 'setup'      ? <SetupPanel {...{ domain, setDomain, lens, setLens, stage, setStage, context, setContext, role, setRole, background, setBackground, focuses, toggleFocus, runAnalysis, apiKeySet: hasApiKey() }} />
                  : activeTab === 'model'      ? <ModelPanel data={data} />
                  : activeTab === 'personas'   ? <PersonasPanel data={data} />
                  : activeTab === 'opps'       ? <OppsPanel data={data} />
                  : activeTab === 'delivery'   ? <DeliveryPanel data={data} />
                  : activeTab === 'governance' ? <GovernancePanel data={data} />
                  : activeTab === 'evidence'   ? <EvidencePanel data={data} />
                  : activeTab === 'artifacts'  ? <ArtifactsPanel data={data} />
                  : activeTab === 'narrative'  ? <NarrativePanel data={data} />
                  : null
                }
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────────
function Pill({ label, value, accent }) {
  const c = accent || 'var(--accent)'
  return (
    <div style={{ fontSize: 9, fontFamily: 'var(--fm)', background: 'var(--s2)', border: '1px solid var(--border)', padding: '3px 7px', borderRadius: 3, color: 'var(--muted2)' }}>
      {label}: <span style={{ color: c }}>{value}</span>
    </div>
  )
}

function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 8px',
        borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        paddingLeft: active ? 6 : 8,
        borderRadius: 7, cursor: 'pointer',
        color: active ? 'var(--text)' : 'var(--muted2)',
        background: active ? 'var(--s2)' : 'transparent',
        marginBottom: 1, fontSize: 11,
      }}
      onClick={onClick}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 13, width: 15, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', background: 'var(--a2)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>
          {badge}
        </span>
      )}
    </div>
  )
}

function TrustBadge({ type }) {
  const cfg = getTrust(type)
  return (
    <span className={`trust ${cfg.cls}`}>
      <i className={`ti ${cfg.icon}`} /> {cfg.label}
    </span>
  )
}

function TrustLegend({ note }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
      {note && <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', width: '100%', marginBottom: 4 }}>{note}</div>}
      <TrustBadge type="verified_fact" />
      <TrustBadge type="user_provided" />
      <TrustBadge type="inferred_strategy" />
      <TrustBadge type="hypothesis" />
    </div>
  )
}

function SecHeader({ title, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600 }}>{title}</h2>
      {badge && (
        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', background: 'rgba(0,229,180,.08)', color: 'var(--accent)', border: '1px solid rgba(0,229,180,.2)', padding: '2px 6px', borderRadius: 3 }}>
          {badge}
        </span>
      )}
    </div>
  )
}

function EmptyState({ icon, message, hint }) {
  return (
    <div className="empty">
      <i className={`ti ${icon}`} />
      <p>{message}</p>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

function Card({ label, icon, trust, children }) {
  return (
    <div className="card">
      <div className="card-label">
        {icon && <i className={`ti ${icon}`} />}
        {label}
        {trust && <TrustBadge type={trust} />}
      </div>
      <div className="card-body">{children}</div>
    </div>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 10, ...style }}>
      <label style={{ display: 'block', fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', padding: '9px 12px 3px', fontFamily: 'var(--fm)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle = { width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--fd)', fontSize: 12, padding: '3px 12px 9px' }

// ─────────────────────────────────────────────────────────────
// LOADING VIEW
// ─────────────────────────────────────────────────────────────
function LoadingView({ stages, currentStage, pct, label }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>Building evidence-layered analysis</div>
      <div style={{ fontSize: 10, color: 'var(--muted2)', fontFamily: 'var(--fm)', marginBottom: 20 }}>{label}</div>
      <div style={{ height: 2, background: 'var(--border)', borderRadius: 1, maxWidth: 260, margin: '0 auto 16px' }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--a2),var(--accent))', borderRadius: 1, width: `${pct}%`, transition: 'width .5s' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 240, margin: '0 auto' }}>
        {stages.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontFamily: 'var(--fm)', color: i < currentStage ? 'var(--accent)' : i === currentStage ? 'var(--a2)' : 'var(--muted)' }}>
            <span style={{ width: 11, fontSize: 9 }}>{i < currentStage ? '✓' : i === currentStage ? '◎' : '○'}</span>
            {s.l}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// HOME VIEW
// ─────────────────────────────────────────────────────────────
function HomeView({ onNew, apiKeySet }) {
  const layers = [
    { n: 'L1', t: 'Raw project research — AI output, always labeled as inference' },
    { n: 'L2', t: 'Extracted claims — verified_fact / user_provided / inferred_strategy / hypothesis' },
    { n: 'L3', t: 'Transferable patterns — source lineage, confidence, counterexamples, domain scope' },
    { n: 'L4', t: 'Portfolio artifact ideas — what to build, why credible, what it proves' },
    { n: 'L5', t: 'Positioning overlays — role framing, always flagged separately, never blended' },
  ]
  return (
    <div style={{ padding: 16, maxWidth: 640 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>DomainIQ</h2>
      <p style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.8, marginBottom: 16 }}>
        Evidence-first domain research and strategic analysis. Each session generates inspectable
        inference nodes — accept, challenge, or reject each claim. Challenges trigger scoped
        pressure testing: the system evaluates your challenge as a hypothesis, not an instruction,
        and returns an explicit preserve / revise / unresolved decision with rationale.
      </p>

      {!apiKeySet && (
        <div style={{ background: 'rgba(56,189,248,.06)', border: '1px solid rgba(56,189,248,.2)', borderRadius: 'var(--r)', padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--a4)', marginBottom: 4 }}>
            <i className="ti ti-info-circle" style={{ fontSize: 11, verticalAlign: -1 }} /> Running in demo mode
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7 }}>
            No API key detected. Sessions run on seed data.
            To enable live analysis, add <code style={{ fontFamily: 'var(--fm)', color: 'var(--accent)' }}>VITE_ANTHROPIC_API_KEY=sk-ant-...</code> to a <code style={{ fontFamily: 'var(--fm)' }}>.env.local</code> file and restart.
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 10, borderColor: 'rgba(0,229,180,.2)' }}>
        <div className="card-label">
          <i className="ti ti-sparkles" style={{ color: 'var(--accent)' }} />
          Governed inference loop
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 10 }}>
          Stage 1 generates inspectable nodes. Accept, challenge (with a note), or reject each one.
          Challenges are pressure-tested — only the challenged node and its direct downstream are
          in scope. Token budgets and generation policy are enforced on every run.
        </div>
        <button style={{ ...S.goBtn, maxWidth: 200 }} onClick={onNew}>
          <i className="ti ti-sparkles" style={{ fontSize: 12 }} /> New session
        </button>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="card-label"><i className="ti ti-database" style={{ color: 'var(--a4)' }} /> Five memory layers — never silently blended</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {layers.map(l => (
            <div key={l.n} style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--muted2)' }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', width: 20, flexShrink: 0, paddingTop: 1 }}>{l.n}</span>
              {l.t}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-label"><i className="ti ti-certificate" style={{ color: 'var(--accent)' }} /> Trust taxonomy — visible on every claim</div>
        <TrustLegend />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SETUP PANEL
// ─────────────────────────────────────────────────────────────
function SetupPanel({ domain, setDomain, lens, setLens, stage, setStage, context, setContext, role, setRole, background, setBackground, focuses, toggleFocus, runAnalysis, apiKeySet }) {
  return (
    <div style={{ maxWidth: 680 }}>
      <SecHeader title="New analysis" />

      <Field label="Domain / company / industry">
        <input value={domain} onChange={e => setDomain(e.target.value)} style={inputStyle}
          placeholder="e.g. Finlytica.ai, healthcare revenue cycle, community bank analytics, regional logistics..." />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Your role lens">
          <select value={lens} onChange={e => setLens(e.target.value)} style={inputStyle}>
            {['Product Manager', 'Business Analyst', 'Product Strategy', 'Consultant / advisor', 'Operations leader', 'Investor / due diligence'].map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Organization stage">
          <select value={stage} onChange={e => setStage(e.target.value)} style={inputStyle}>
            {['Startup (seed–Series B)', 'Growth (Series C+)', 'Enterprise / large org', 'Public company', 'Government / nonprofit', 'Unknown / infer'].map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Additional context / prior research">
        <textarea value={context} onChange={e => setContext(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Paste notes, prior research, or framing. This is treated as user-provided evidence (L2) — higher trust than AI inference." />
      </Field>

      {/* Kumar overlay — L5 */}
      <div style={{ background: 'rgba(168,139,250,.04)', border: '1px solid rgba(168,139,250,.2)', borderRadius: 'var(--r)', padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--a5)', marginBottom: 8, fontFamily: 'var(--fm)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className="ti ti-user-star" /> Positioning overlay (L5) — kept separate from domain research
        </div>
        <Field label="Role I'm targeting" style={{ background: 'var(--s2)', marginBottom: 8 }}>
          <input value={role} onChange={e => setRole(e.target.value)} style={inputStyle}
            placeholder="e.g. Product Owner at a fintech, BA at a community bank analytics vendor..." />
        </Field>
        <Field label="Background to weave in (optional)" style={{ background: 'var(--s2)', marginBottom: 0 }}>
          <textarea value={background} onChange={e => setBackground(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="e.g. QA-to-PM path, Salesforce analytics, IAM/RBAC, support signal synthesis..." />
        </Field>
      </div>

      {/* Focus areas */}
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, fontFamily: 'var(--fm)' }}>
        Focus areas
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 14 }}>
        {FOCUS_OPTIONS.map(f => (
          <div
            key={f.label}
            style={{
              border: `1px solid ${focuses.includes(f.label) ? 'var(--accent)' : 'var(--border)'}`,
              background: focuses.includes(f.label) ? 'rgba(0,229,180,.06)' : 'var(--surface)',
              borderRadius: 7, padding: '7px 8px', cursor: 'pointer', fontSize: 10,
              color: focuses.includes(f.label) ? 'var(--accent)' : 'var(--muted2)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
            onClick={() => toggleFocus(f.label)}
          >
            <i className={`ti ${f.icon}`} style={{ fontSize: 12 }} /> {f.label}
          </div>
        ))}
      </div>

      {!apiKeySet && (
        <div style={{ fontSize: 10, color: 'var(--a4)', fontFamily: 'var(--fm)', marginBottom: 10 }}>
          <i className="ti ti-info-circle" style={{ fontSize: 11, verticalAlign: -1 }} /> No API key — will load demo data for Finlytica.ai
        </div>
      )}

      <button style={S.goBtn} onClick={runAnalysis}>
        {apiKeySet ? 'Analyze domain →' : 'Load demo analysis →'}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// OPERATING MODEL
// ─────────────────────────────────────────────────────────────
function ModelPanel({ data }) {
  if (!data) return <EmptyState icon="ti-sitemap" message="Run an analysis to populate this view." />
  const om = data.operating_model || {}
  const fields = [
    { k: 'value_proposition', l: 'Value proposition', i: 'ti-award' },
    { k: 'customers',         l: 'Customer segments',  i: 'ti-users' },
    { k: 'revenue_model',     l: 'Revenue model',      i: 'ti-coins' },
    { k: 'key_capabilities',  l: 'Core capabilities',  i: 'ti-settings' },
    { k: 'key_processes',     l: 'Key processes',      i: 'ti-git-branch' },
    { k: 'technology_signals',l: 'Tech signals',       i: 'ti-cpu' },
    { k: 'ecosystem',         l: 'Ecosystem',          i: 'ti-network' },
    { k: 'success_metrics',   l: 'Success metrics',    i: 'ti-chart-bar' },
  ]
  return (
    <div>
      <SecHeader title="Operating model" badge={data.industry || ''} />
      <TrustLegend note="Each card carries its evidence type. Tech signals and revenue model are typically hypothesis-grade without confirmed public data." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {fields.map(f => {
          const v = om[f.k] || {}
          return (
            <Card key={f.k} label={f.l} icon={f.i} trust={v.evidence_type || 'inferred_strategy'}>
              {v.text || '—'}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PERSONAS
// ─────────────────────────────────────────────────────────────
function PersonasPanel({ data }) {
  if (!data) return <EmptyState icon="ti-users" message="Run an analysis to populate this view." />
  const ps = data.personas || []
  return (
    <div>
      <SecHeader title="Buyer & stakeholder personas" badge={`${ps.length} personas`} />
      <TrustLegend note="Personas are AI-inferred unless your context explicitly confirms them." />
      {ps.map((p, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--s2)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`ti ${PERSONA_ICONS[i % PERSONA_ICONS.length]}`} style={{ fontSize: 13, color: 'var(--a2)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{p.title}</div>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)' }}>{p.role}</div>
            </div>
            <TrustBadge type={p.evidence_type || 'inferred_strategy'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            {[{ l: 'First use case', v: p.first_use_case }, { l: 'Proof needed', v: p.proof_needed }, { l: 'Objections', v: p.objections }].map(col => (
              <div key={col.l}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--fm)' }}>{col.l}</div>
                <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{col.v}</div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge b-blue"><i className="ti ti-bolt" style={{ fontSize: 9 }} /> {p.buying_trigger}</span>
            {p.kumar_overlay && (
              <span className="badge b-pink"><i className="ti ti-user-star" style={{ fontSize: 9 }} /> {p.kumar_overlay}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// OPPORTUNITIES
// ─────────────────────────────────────────────────────────────
function OppsPanel({ data }) {
  if (!data) return <EmptyState icon="ti-bulb" message="Run an analysis to populate this view." />
  const os = data.opportunities || []
  return (
    <div>
      <SecHeader title="Opportunities & buying triggers" badge={`${os.length} identified`} />
      {os.map((o, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 8 }}>
            <span className="badge b-purple">OPP-{String(i + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{o.title}</span>
            <TrustBadge type={o.evidence_type || 'inferred_strategy'} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className={`badge ${o.impact === 'high' ? 'b-high' : o.impact === 'medium' ? 'b-med' : 'b-low'}`}>Impact: {o.impact}</span>
            <span className={`badge ${o.effort === 'low' ? 'b-med' : o.effort === 'medium' ? 'b-low' : 'b-high'}`}>Effort: {o.effort}</span>
            <span className="badge b-blue">Horizon: {o.horizon}</span>
            <span className="badge b-low">{o.category}</span>
          </div>
          {o.trigger && <div style={{ fontSize: 10, fontFamily: 'var(--fm)', color: 'var(--a3)', marginBottom: 6 }}><i className="ti ti-bolt" style={{ fontSize: 10, verticalAlign: -1 }} /> Trigger: {o.trigger}</div>}
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7 }}>{o.description}</div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DELIVERY MODEL
// ─────────────────────────────────────────────────────────────
function DeliveryPanel({ data }) {
  if (!data) return <EmptyState icon="ti-route" message="Run an analysis to populate this view." />
  const dm = data.delivery_model || {}
  return (
    <div>
      <SecHeader title="Delivery operating model" badge={dm.archetype || ''} />
      {(dm.phases || []).map((ph, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', background: 'var(--s2)', border: '1px solid var(--border2)', color: 'var(--muted2)', padding: '2px 6px', borderRadius: 3 }}>Phase {i + 1}</span>
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{ph.name}</span>
            <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)' }}>{ph.timing}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 8 }}>{ph.description}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {(ph.outputs || []).map((o, j) => <span key={j} className="pd-tag">{o}</span>)}
          </div>
        </div>
      ))}
      {dm.pm_ba_leverage && <Card label="PM/BA leverage point" icon="ti-target">{dm.pm_ba_leverage}</Card>}
      {dm.common_failure_modes && <Card label="Common failure modes" icon="ti-alert-triangle">{dm.common_failure_modes}</Card>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// GOVERNANCE
// ─────────────────────────────────────────────────────────────
function GovernancePanel({ data }) {
  if (!data) return <EmptyState icon="ti-shield-check" message="Run an analysis to populate this view." />
  const gs = data.governance || []
  return (
    <div>
      <SecHeader title="Governance & risk surface" badge={`${gs.length} areas`} />
      <TrustLegend note="Governance risks carry their own evidence type — regulatory facts vs inferred risks vs hypotheses." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {gs.map((g, i) => {
          const rc = g.risk_level === 'high' ? '#fb923c' : g.risk_level === 'medium' ? 'var(--accent)' : 'var(--muted2)'
          return (
            <div key={i} className="card">
              <div className="card-label" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className={`ti ${g.icon || 'ti-shield'}`} style={{ color: rc }} />
                  {g.area}
                </span>
                <TrustBadge type={g.evidence_type || 'inferred_strategy'} />
              </div>
              <div className="card-body">{g.description}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// EVIDENCE MAP
// ─────────────────────────────────────────────────────────────
function EvidencePanel({ data }) {
  if (!data) return <EmptyState icon="ti-list-check" message="Run an analysis to populate this view." />
  const claims = data.evidence_map || []
  return (
    <div>
      <SecHeader title="Evidence map" badge="L2 · Extracted claims" />
      <p style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 12 }}>
        Every significant claim from this analysis — typed, sourced, and confidence-rated. Check this before
        citing anything in a portfolio artifact or interview.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr>
              {['Claim', 'Type', 'Source', 'Confidence', 'Used in'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--fm)', padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {claims.length === 0
              ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>No claims extracted.</td></tr>
              : claims.map((c, i) => {
                const { pct, color } = confPct(c.confidence || 'medium')
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 8px', color: 'var(--text)', fontSize: 10, minWidth: 200, verticalAlign: 'top', lineHeight: 1.5 }}>{c.claim}</td>
                    <td style={{ padding: '8px 8px', verticalAlign: 'top', whiteSpace: 'nowrap' }}><TrustBadge type={c.evidence_type} /></td>
                    <td style={{ padding: '8px 8px', fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--muted2)', minWidth: 120, verticalAlign: 'top' }}>{c.source}</td>
                    <td style={{ padding: '8px 8px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 44, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted2)' }}>{c.confidence}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 8px', verticalAlign: 'top', minWidth: 130 }}>
                      {(c.used_in || []).map((u, j) => <span key={j} className="pd-tag" style={{ margin: '1px 2px' }}>{u}</span>)}
                    </td>
                  </tr>
                )
              })
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ARTIFACTS
// ─────────────────────────────────────────────────────────────
function ArtifactsPanel({ data }) {
  if (!data) return <EmptyState icon="ti-package" message="Run an analysis to populate this view." />
  const arts = data.artifacts || []
  const ko = data.kumar_overlay || {}
  return (
    <div>
      <SecHeader title="Portfolio artifact plan" badge="L4 · What to build" />
      <p style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 12 }}>
        Concrete artifacts you can build from this analysis — with credibility rationale, proof, data requirements, and interview signal.
      </p>

      {ko.applied && (
        <div className="overlay-card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--a5)', marginBottom: 8, fontFamily: 'var(--fm)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <i className="ti ti-user-star" /> Positioning overlay (L5) applied · {ko.role_target}
          </div>
          {ko.positioning_notes && <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 10 }}>{ko.positioning_notes}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', marginBottom: 4 }}>SAFE LANGUAGE</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{ko.safe_language}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c', marginBottom: 4 }}>AVOID CLAIMING</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{ko.avoid_claiming}</div>
            </div>
          </div>
        </div>
      )}

      {arts.map((a, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 14, marginBottom: 10 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a2)', background: 'rgba(124,108,250,.1)', border: '1px solid rgba(124,108,250,.2)', padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginBottom: 8 }}>
            ARTIFACT-{String(i + 1).padStart(2, '0')}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{a.title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 10 }}>{a.why_credible}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div style={{ background: 'var(--s2)', borderRadius: 7, padding: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 5, fontFamily: 'var(--fm)' }}>Claims it proves</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.7 }}>
                {(a.claims_it_proves || []).map((c, j) => <div key={j}>• {c}</div>)}
              </div>
            </div>
            <div style={{ background: 'var(--s2)', borderRadius: 7, padding: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 5, fontFamily: 'var(--fm)' }}>Data needed</div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.7 }}>{a.data_needed}</div>
            </div>
          </div>
          <div style={{ background: 'rgba(0,229,180,.05)', border: '1px solid rgba(0,229,180,.15)', borderRadius: 7, padding: 10, marginBottom: a.kumar_fit ? 6 : 0 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', marginBottom: 4 }}><i className="ti ti-antenna" style={{ fontSize: 10, verticalAlign: -1 }} /> Interview signal</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{a.interview_signal}</div>
          </div>
          {a.kumar_fit && (
            <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a5)', marginTop: 6 }}>
              <i className="ti ti-user-star" style={{ fontSize: 9, verticalAlign: -1 }} /> {a.kumar_fit}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// NARRATIVE
// ─────────────────────────────────────────────────────────────
function NarrativePanel({ data }) {
  if (!data) return <EmptyState icon="ti-notes" message="Run an analysis to populate this view." />
  return (
    <div>
      <SecHeader title="Executive narrative" badge="L1 · Inferred · interview-ready" />
      <TrustLegend note="AI-inferred narrative. Validate claims before citing in interviews or portfolio artifacts." />
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, fontSize: 11, color: 'var(--muted2)', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
        {data.narrative}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// PATTERN LIBRARY (system view)
// ─────────────────────────────────────────────────────────────
function PatternsView({ patterns }) {
  const pats = Object.values(patterns).sort((a, b) => (b.count || 1) - (a.count || 1))
  return (
    <div style={{ padding: 16 }}>
      <SecHeader title="Pattern library" badge="L3 · Cross-domain intelligence" />
      <p style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 14 }}>
        Patterns extracted across every analysis. Each carries source lineage, confidence, counterexamples, and
        domain applicability. The library grows more precise — not just larger — with each project.
      </p>
      {pats.length === 0
        ? <EmptyState icon="ti-dna" message="Complete your first analysis to start building the pattern library." hint="Patterns accumulate with evidence tracking across projects." />
        : pats.map((p, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.title}</span>
              <span style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)' }}>{p.count || 1}× seen</span>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              <span className="badge b-purple">{p.category}</span>
              <TrustBadge type={p.evidence_type || 'inferred_strategy'} />
              <span className={`badge ${p.confidence === 'high' ? 'b-med' : p.confidence === 'low' ? 'b-low' : 'b-high'}`}>{p.confidence} confidence</span>
              <span className="badge b-low">{p.domain_applicability || 'broad'}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: p.counterexamples ? 7 : 0 }}>{p.insight}</div>
            {p.counterexamples && (
              <div style={{ fontSize: 10, color: 'var(--a3)', fontFamily: 'var(--fm)', fontStyle: 'italic', marginBottom: 5 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 10, verticalAlign: -1 }} /> Limits: {p.counterexamples}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
              {(p.domains || []).map((d, j) => <span key={j} className="pd-tag">{d}</span>)}
            </div>
          </div>
        ))
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// OVERLAYS VIEW (system view)
// ─────────────────────────────────────────────────────────────
function OverlaysView({ projects }) {
  const overlays = Object.values(projects)
    .filter(p => p.data?.kumar_overlay?.applied)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
  return (
    <div style={{ padding: 16 }}>
      <SecHeader title="Positioning overlays" badge="L5 · Always flagged separately" />
      <p style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 14 }}>
        Role-specific framing applied during analysis. These are always kept separate from domain research
        and never blended into L1–L3 outputs. Use for interview prep and positioning only.
      </p>
      {overlays.length === 0
        ? <EmptyState icon="ti-user-star" message="Overlays are generated when you fill in the Positioning overlay section in Setup." />
        : overlays.map((p, i) => {
          const ko = p.data.kumar_overlay
          return (
            <div key={i} className="overlay-card">
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--a5)', marginBottom: 8, fontFamily: 'var(--fm)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="ti ti-user-star" /> {p.domain} · {ko.role_target || 'role not specified'}
              </div>
              {ko.positioning_notes && <div style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 10 }}>{ko.positioning_notes}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)', marginBottom: 4 }}>SAFE LANGUAGE</div>
                  <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{ko.safe_language}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: '#fb923c', marginBottom: 4 }}>AVOID CLAIMING</div>
                  <div style={{ fontSize: 10, color: 'var(--muted2)', lineHeight: 1.65 }}>{ko.avoid_claiming}</div>
                </div>
              </div>
            </div>
          )
        })
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// STYLE CONSTANTS
// ─────────────────────────────────────────────────────────────
const S = {
  shell:  { display: 'grid', gridTemplateRows: '44px 1fr', height: '100vh', overflow: 'hidden' },
  topbar: { background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', flexShrink: 0 },
  logo:   { fontSize: 13, fontWeight: 700, letterSpacing: '.12em', color: 'var(--accent)' },
  sep:    { width: 1, height: 16, background: 'var(--border)' },
  body:   { display: 'grid', gridTemplateColumns: '200px 1fr', overflow: 'hidden' },
  sidebar:      { background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sidebarTop:   { padding: 10, borderBottom: '1px solid var(--border)' },
  sidebarScroll:{ flex: 1, overflowY: 'auto', padding: '6px 0' },
  sbSection:    { padding: '0 10px 4px' },
  sbLabel:      { fontSize: 9, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', padding: '8px 0 3px', fontFamily: 'var(--fm)' },
  newBtn:  { width: '100%', padding: 8, background: 'var(--accent)', color: '#0a0b0d', fontWeight: 700, fontSize: 11, letterSpacing: '.04em', border: 'none', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 },
  projItem:{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 7, cursor: 'pointer', marginBottom: 1 },
  delBtn:  { fontSize: 9, color: 'var(--muted)', background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', opacity: 0.6 },
  tabBar:  { background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 1, padding: '0 10px', flexShrink: 0, overflowX: 'auto' },
  tab:     { padding: '9px 10px', fontSize: 10, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', transition: 'color .15s', flexShrink: 0 },
  tabContent: { flex: 1, overflowY: 'auto', padding: 16 },
  goBtn:   { width: '100%', padding: 11, background: 'var(--accent)', color: '#0a0b0d', fontWeight: 700, fontSize: 12, letterSpacing: '.04em', border: 'none', borderRadius: 'var(--r)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
}
