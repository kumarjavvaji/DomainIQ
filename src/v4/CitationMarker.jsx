import React, { useState } from 'react'

// ── CitationMarker ─────────────────────────────────────────────────────────────
//
// Renders a single inline citation superscript [n] with a hover/focus tooltip.
// Used identically in NodeCard (applied statement) and DiffView RevisionBlock
// (challenge preview) so both surfaces show the same tooltip without duplication.
//
// Tooltip disappears on mouse-leave, blur (unless focus moves to a child like the
// "Open source" link), and Escape. Renders entirely in-DOM — no native title attr.
export default function CitationMarker({ marker, citation }) {
  const [open, setOpen] = useState(false)
  const hasCitation = citation != null

  function handleBlur(e) {
    // Keep open when focus moves to a child (e.g., the "Open source" link).
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setOpen(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <sup
      tabIndex={0}
      data-citation-marker={marker}
      aria-label={
        hasCitation && citation.title
          ? `Citation ${marker}: ${citation.title}`
          : `Citation ${marker}`
      }
      style={{
        position: 'relative',
        fontSize: 8, fontFamily: 'var(--fm)', color: 'var(--accent)',
        background: 'rgba(0,229,180,.1)', padding: '1px 3px',
        borderRadius: 2, marginLeft: 1,
        cursor: hasCitation ? 'pointer' : 'default',
        userSelect: 'none', outline: 'none',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      [{marker}]
      {open && hasCitation && <Tooltip marker={marker} citation={citation} />}
    </sup>
  )
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
//
// Position: absolute above the marker. Inherits no typography from the <sup>.
// All font sizes / colors reset explicitly so the tooltip is readable at any
// nesting depth.
function Tooltip({ marker, citation }) {
  const snippet = citation.snippet || null
  const hasUrl  = Boolean(citation.url)

  return (
    <span
      role="tooltip"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        display: 'block',
        width: 240,
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 8,
        padding: '10px 12px',
        boxShadow: '0 4px 20px rgba(0,0,0,.3)',
        // Reset inherited <sup> styles so tooltip text is readable
        verticalAlign: 'initial',
        fontSize: 10,
        lineHeight: 1.6,
        fontStyle: 'normal',
        fontWeight: 'normal',
        fontFamily: 'inherit',
        color: 'var(--text)',
        textAlign: 'left',
        whiteSpace: 'normal',
        pointerEvents: 'auto',
      }}
    >
      {/* Marker badge + title */}
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5 }}>
        <span style={{
          fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--accent)',
          background: 'rgba(0,229,180,.1)', padding: '1px 4px', borderRadius: 3,
          flexShrink: 0,
        }}>
          [{marker}]
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'break-word' }}>
          {citation.title || '(untitled)'}
        </span>
      </span>

      {/* Domain */}
      {citation.domain && (
        <div style={{ fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--muted)', marginBottom: 6 }}>
          {citation.domain}
        </div>
      )}

      {/* Evidence excerpt / snippet */}
      <div style={{
        fontSize: 9, color: 'var(--muted2)', lineHeight: 1.55,
        fontStyle: 'italic', marginBottom: 7,
        padding: '5px 7px',
        background: 'var(--s2)',
        border: '1px solid var(--border)',
        borderRadius: 5,
      }}>
        {snippet
          ? `"${snippet}"`
          : 'No supporting excerpt captured for this source.'}
      </div>

      {/* Support level */}
      {citation.supportsClaim !== null && citation.supportsClaim !== undefined && (
        <div style={{
          fontSize: 9, fontFamily: 'var(--fm)',
          color: supportColor(citation.supportsClaim),
          marginBottom: hasUrl ? 8 : 0,
        }}>
          Supports: {formatSupportLevel(citation.supportsClaim)}
        </div>
      )}

      {/* Open source link */}
      {hasUrl && (
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 9, fontFamily: 'var(--fm)', color: 'var(--a4)',
            textDecoration: 'none',
            padding: '3px 8px',
            background: 'rgba(56,189,248,.06)',
            border: '1px solid rgba(56,189,248,.2)',
            borderRadius: 4,
          }}
        >
          Open source <span style={{ fontSize: 10, lineHeight: 1 }}>↗</span>
        </a>
      )}
    </span>
  )
}

// ── Private helpers ───────────────────────────────────────────────────────────

function formatSupportLevel(level) {
  if (level === 'direct')  return 'direct'
  if (level === 'partial') return 'partial'
  if (level === 'context') return 'context'
  if (level === false)     return 'contradicts'
  return String(level)
}

function supportColor(level) {
  if (level === 'direct')  return 'var(--accent)'
  if (level === 'partial') return 'var(--a3)'
  if (level === 'context') return 'var(--muted2)'
  if (level === false)     return '#f87171'
  return 'var(--muted)'
}
