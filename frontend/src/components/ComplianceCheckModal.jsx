/**
 * ComplianceCheckModal — RAG-grounded policy compliance review.
 *
 * Shows a checklist of compliance results from the backend RAG pipeline:
 *   🔴 red    — blocks publish (clear policy violation, must edit first)
 *   🟡 yellow — requires acknowledgment checkbox before publish
 *   🟢 green  — surfaced but cleared by policy check
 *
 * Red items prevent the publish button from activating.
 * Yellow items each require an individual acknowledgment checkbox.
 * Green items are collapsed by default (expandable).
 */
import { useState, useEffect } from 'react'
import { API_BASE } from '../config'
import './ComplianceCheckModal.css'

// ─── Icons ────────────────────────────────────────────────────────────────────

const ShieldX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="9" y1="9" x2="15" y2="15" />
    <line x1="15" y1="9" x2="9" y2="15" />
  </svg>
)

const ShieldAlert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const ShieldCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)

const ChevronDown = ({ open }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const Loader = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ccm-spinner">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

// ─── Severity config ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  red: {
    icon: <ShieldX />,
    label: 'Policy Violation',
    sublabel: 'Must fix before publishing',
    className: 'ccm-item--red',
    badgeClass: 'ccm-badge--red',
  },
  yellow: {
    icon: <ShieldAlert />,
    label: 'Borderline Claim',
    sublabel: 'Requires acknowledgment',
    className: 'ccm-item--yellow',
    badgeClass: 'ccm-badge--yellow',
  },
  green: {
    icon: <ShieldCheck />,
    label: 'Cleared',
    sublabel: 'No policy issue found',
    className: 'ccm-item--green',
    badgeClass: 'ccm-badge--green',
  },
}

// ─── ComplianceItem ───────────────────────────────────────────────────────────

function ComplianceItem({ result, acknowledged, onAcknowledge }) {
  const [expanded, setExpanded] = useState(result.severity !== 'green')
  const cfg = SEVERITY_CONFIG[result.severity] || SEVERITY_CONFIG.yellow

  return (
    <div className={`ccm-item ${cfg.className}`}>
      <div className="ccm-item-header" onClick={() => setExpanded(e => !e)} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}>
        <span className={`ccm-severity-icon`}>{cfg.icon}</span>
        <div className="ccm-item-titles">
          <span className={`ccm-badge ${cfg.badgeClass}`}>{cfg.label}</span>
          <code className="ccm-claim-text">"{result.claim}"</code>
        </div>
        <ChevronDown open={expanded} />
      </div>

      {expanded && (
        <div className="ccm-item-body">
          {result.policy_section && (
            <div className="ccm-policy-ref">
              <span className="ccm-policy-label">Policy:</span>
              <span>{result.policy_section}</span>
            </div>
          )}
          <p className="ccm-explanation">{result.explanation}</p>
          {result.source && result.source.startsWith('regex') && (
            <p className="ccm-source-note">⚠ Policy corpus not loaded — this is a pattern-match estimate. Load policy docs for precise checking.</p>
          )}

          {result.severity === 'yellow' && (
            <label className="ccm-ack-checkbox">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={e => onAcknowledge(e.target.checked)}
                id={`ack-${result.claim?.slice(0, 20)}`}
              />
              <span>I understand this risk and take responsibility as the advertiser</span>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function ComplianceCheckModal({ projectId, onClose, onPublish }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [checkData, setCheckData] = useState(null)
  const [acknowledged, setAcknowledged] = useState({})
  const [publishing, setPublishing] = useState(false)
  const [showGreen, setShowGreen] = useState(false)

  // Run compliance check on mount
  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = localStorage.getItem('access_token')
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/compliance-check/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        setCheckData(data)
        // Pre-acknowledge green items
        const preAck = {}
        data.results.forEach((r, i) => {
          if (r.severity === 'green') preAck[i] = true
        })
        setAcknowledged(preAck)
      } catch (err) {
        setError(err.message || 'Compliance check failed')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [projectId])

  const results = checkData?.results || []
  const reds = results.filter(r => r.severity === 'red')
  const yellows = results.filter(r => r.severity === 'yellow')
  const greens = results.filter(r => r.severity === 'green')

  // Yellow items must each be individually acknowledged
  const allYellowsAcknowledged = yellows.every((r, i) => {
    const idx = results.indexOf(r)
    return acknowledged[idx]
  })

  const canPublish = reds.length === 0 && allYellowsAcknowledged

  const handlePublish = async () => {
    if (!canPublish || publishing) return
    setPublishing(true)
    try {
      await onPublish()
      onClose()
    } catch {
      // onPublish handles its own error display
    } finally {
      setPublishing(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ccm-overlay" role="dialog" aria-modal="true" aria-label="Compliance Review">
      <div className="ccm-modal">

        {/* Header */}
        <div className="ccm-header">
          <div className="ccm-header-title">
            <ShieldAlert />
            <div>
              <h3>Pre-Publish Policy Review</h3>
              <p>RAG-grounded check against Meta Ad Policy before you go live</p>
            </div>
          </div>
          <button className="ccm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="ccm-body">
          {loading && (
            <div className="ccm-loading">
              <Loader />
              <span>Checking your copy against ad policy…</span>
            </div>
          )}

          {error && (
            <div className="ccm-error">
              <p>⚠ {error}</p>
              <p className="ccm-error-note">Policy check failed. You can still publish, but review the copy manually.</p>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="ccm-clean">
              <ShieldCheck />
              <p>No compliance issues detected.</p>
              <p className="ccm-clean-note">No risky claims found in your copy. You're clear to publish.</p>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="ccm-summary">
                {reds.length > 0 && (
                  <span className="ccm-summary-pill ccm-summary-pill--red">
                    🔴 {reds.length} must fix
                  </span>
                )}
                {yellows.length > 0 && (
                  <span className="ccm-summary-pill ccm-summary-pill--yellow">
                    🟡 {yellows.length} needs acknowledgment
                  </span>
                )}
                {greens.length > 0 && (
                  <span className="ccm-summary-pill ccm-summary-pill--green">
                    🟢 {greens.length} cleared
                  </span>
                )}
              </div>

              {/* Red items */}
              {reds.length > 0 && (
                <div className="ccm-section">
                  <div className="ccm-section-label ccm-section-label--red">
                    Policy Violations — Edit in chat before publishing
                  </div>
                  {reds.map((r, i) => (
                    <ComplianceItem
                      key={i}
                      result={r}
                      acknowledged={false}
                      onAcknowledge={() => {}}
                    />
                  ))}
                </div>
              )}

              {/* Yellow items */}
              {yellows.length > 0 && (
                <div className="ccm-section">
                  <div className="ccm-section-label ccm-section-label--yellow">
                    Borderline Claims — Acknowledge each to enable publish
                  </div>
                  {yellows.map((r) => {
                    const idx = results.indexOf(r)
                    return (
                      <ComplianceItem
                        key={idx}
                        result={r}
                        acknowledged={!!acknowledged[idx]}
                        onAcknowledge={v => setAcknowledged(a => ({ ...a, [idx]: v }))}
                      />
                    )
                  })}
                </div>
              )}

              {/* Green items (collapsed by default) */}
              {greens.length > 0 && (
                <div className="ccm-section ccm-section--green">
                  <button
                    className="ccm-green-toggle"
                    onClick={() => setShowGreen(v => !v)}
                    id="ccm-toggle-green"
                  >
                    <ChevronDown open={showGreen} />
                    {showGreen ? 'Hide' : 'Show'} {greens.length} cleared item{greens.length !== 1 ? 's' : ''}
                  </button>
                  {showGreen && greens.map((r) => {
                    const idx = results.indexOf(r)
                    return (
                      <ComplianceItem
                        key={idx}
                        result={r}
                        acknowledged={true}
                        onAcknowledge={() => {}}
                      />
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="ccm-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose} id="ccm-btn-cancel">
            Fix in chat first
          </button>
          <button
            id="ccm-btn-publish"
            className={`btn btn-sm ${canPublish || error ? 'btn-primary' : 'btn-disabled'}`}
            onClick={error ? onPublish : handlePublish}
            disabled={(reds.length > 0 && !error) || publishing || loading}
            title={
              reds.length > 0
                ? `Fix ${reds.length} red violation${reds.length !== 1 ? 's' : ''} before publishing`
                : !allYellowsAcknowledged
                ? 'Acknowledge all borderline claims to enable publish'
                : 'Publish to live URL'
            }
          >
            {publishing ? (
              <>
                <span className="apple-spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }} />
                Publishing…
              </>
            ) : reds.length > 0 ? (
              `Fix ${reds.length} issue${reds.length !== 1 ? 's' : ''} first`
            ) : error ? (
              'Publish anyway'
            ) : (
              'Publish'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
