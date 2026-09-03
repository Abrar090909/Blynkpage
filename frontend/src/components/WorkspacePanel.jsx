/**
 * WorkspacePanel — Code/Preview tab switcher + Device Modes (Desktop/Tablet/Phone) + Fullscreen Mode.
 * Fully responsive across mobile devices and desktop.
 */
import { useState, useEffect } from 'react'
import CodeStream from './CodeStream'
import ActionBar from './ActionBar'
import { useAuth } from '../context/AuthContext'
import './WorkspacePanel.css'

// Precision SVG Icons
const Icons = {
  Desktop: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  Tablet: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  Phone: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  Maximize: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  ),
  Minimize: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M4 10h6m0 0V4m0 6L3 3m17 7h-6m0 0V4m0 6l7-7" />
    </svg>
  ),
  Close: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/**
 * Injects responsive viewport meta, mobile overflow guard, and a preview
 * click interceptor so that clicks on landing page buttons/links do not navigate
 * or submit forms while inside the workspace editor.
 */
function injectBaseTarget(html, testHeadline = '') {
  if (!html) return html
  let clean = html.replace(/^```html\s*/i, '').replace(/```\s*$/i, '')

  // 1. Mandatory Viewport Meta for True Mobile Responsiveness
  const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
  if (!/<meta[^>]*name=["']viewport["']/i.test(clean)) {
    if (/<head[^>]*>/i.test(clean)) {
      clean = clean.replace(/(<head[^>]*>)/i, `$1\n    ${viewportMeta}`)
    } else {
      clean = viewportMeta + '\n' + clean
    }
  }

  // 2. Mobile Responsive Safety Guard & Preview Click Blocker
  const previewScriptAndStyles = `
  <style id="bp-preview-guard">
    *, *::before, *::after { box-sizing: border-box !important; }
    html, body { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; margin: 0; padding: 0; }
    img, svg, video { max-width: 100% !important; height: auto !important; }
    @media (max-width: 768px) {
      .hero-grid, .product-grid, .specs-grid, .two-col, .grid-2, [class*="grid"], [class*="col"] {
        grid-template-columns: 1fr !important;
      }
      .container, .section, header, footer {
        padding-left: 16px !important;
        padding-right: 16px !important;
        max-width: 100% !important;
      }
    }
  </style>
  <script id="bp-preview-click-blocker">
    (function() {
      // Intercept all interactive clicks in workspace preview so buttons are non-functional
      document.addEventListener('click', function(e) {
        var el = e.target.closest('a, button, [role="button"], input[type="submit"], input[type="button"]');
        if (el) {
          e.preventDefault();
          e.stopPropagation();

          // Allow visual selection toggles for size chips / accordions without navigating
          if (el.classList.contains('size-btn') || el.classList.contains('size-chip') || el.dataset.size) {
            var siblings = el.parentElement ? el.parentElement.querySelectorAll('button, .size-btn, .size-chip') : [];
            siblings.forEach(function(s) { s.classList.remove('active'); s.style.borderColor = ''; });
            el.classList.add('active');
            el.style.borderColor = '#000000';
          }
          return false;
        }
      }, true);

      // Disable form submissions in preview
      document.addEventListener('submit', function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }, true);
    })();
  </script>`

  if (/<head[^>]*>/i.test(clean)) {
    clean = clean.replace(/(<head[^>]*>)/i, `$1<base target="_blank">\n${previewScriptAndStyles}`)
  } else {
    clean = `<base target="_blank">\n${previewScriptAndStyles}\n` + clean
  }

  if (testHeadline && testHeadline.trim()) {
    const script = `<script>
      (function() {
        const updateHeadline = () => {
          const el = document.querySelector('[data-dynamic="headline"]') || document.querySelector('h1');
          if (el) el.textContent = ${JSON.stringify(testHeadline.trim())};
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', updateHeadline);
        } else {
          updateHeadline();
        }
      })();
    </script>`
    if (clean.includes('</body>')) {
      clean = clean.replace('</body>', `${script}</body>`)
    } else {
      clean += script
    }
  }
  return clean
}

const DEFAULT_STAGES = [
  'Analysing prompt & brand voice…',
  'Crafting high-converting headlines…',
  'Writing value props & social proof…',
  'Sourcing high-res product visuals…',
  'Styling responsive CSS layout…',
  'Polishing interactive elements…',
]

function GeneratingOverlay({ statusMessage, lineCount, onSwitchToCode }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex(i => Math.min(i + 1, DEFAULT_STAGES.length - 1))
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const currentMsg = statusMessage || DEFAULT_STAGES[stageIndex]
  const steps = ['Brief', 'Copy', 'Visuals', 'Code', 'Preview']
  const getStepState = (idx) => {
    if (lineCount > 150) return idx <= 3 ? 'done' : 'active'
    if (lineCount > 0) return idx <= 2 ? 'done' : idx === 3 ? 'active' : 'pending'
    if (idx < stageIndex) return 'done'
    if (idx === stageIndex) return 'active'
    return 'pending'
  }

  return (
    <div className="apple-loader-overlay">
      <div className="apple-spinner-wrapper" aria-hidden="true">
        <div className="apple-spinner-ring" />
      </div>

      <div className="apple-loader-header">
        <span className="apple-loader-badge">Generating with Gemini</span>
        <h3 className="apple-loader-title">Building your custom page</h3>
        <p className="apple-loader-sub" key={currentMsg}>
          {currentMsg}
        </p>
      </div>

      <div className="apple-progress-track">
        <div className="apple-progress-indicator" />
      </div>

      {lineCount > 0 && (
        <div className="apple-loader-meta">
          <span className="apple-pill-stat">
            {lineCount} lines generated
          </span>
          {onSwitchToCode && (
            <button
              type="button"
              className="btn btn-ghost btn-sm apple-stream-btn"
              onClick={onSwitchToCode}
            >
              Watch code stream →
            </button>
          )}
        </div>
      )}

      <div className="apple-pipeline-steps" aria-label="Pipeline progress">
        {steps.map((step, idx) => {
          const state = getStepState(idx)
          return (
            <div key={step} className={`apple-step-item apple-step-item--${state}`}>
              <div className="apple-step-dot">
                {state === 'done' ? (
                  <span className="apple-step-check">✓</span>
                ) : (
                  <span className="apple-step-num">{idx + 1}</span>
                )}
              </div>
              <span className="apple-step-label">{step}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function WorkspacePanel({
  code,
  isStreaming,
  isDone,
  sseError,
  statusMessage,
  activeTab,
  onTabChange,
  project,
  onPublish,
  onProjectUpdate,
}) {
  const [viewportMode, setViewportMode] = useState('desktop') // 'desktop' | 'tablet' | 'phone'
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [testHeadline, setTestHeadline] = useState('')
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const { authFetch } = useAuth()

  useEffect(() => {
    if (project?.id && (project.status === 'published' || project.published_url)) {
      fetchAnalytics()
    }
  }, [project?.id, project?.status, isStreaming])

  const fetchAnalytics = async () => {
    try {
      const res = await authFetch(`/api/projects/${project.id}/analytics/`)
      if (res.ok) {
        const data = await res.json()
        setAnalytics(data)
      }
    } catch (err) {
      // Non-critical
    }
  }

  const lineCount = code ? code.split('\n').length : 0
  const hasCode = Boolean(code && code.trim().length > 50)

  // Listen for Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen])

  const handleCopyAdUrl = () => {
    const slug = project?.published_url ? project.published_url.replace('/p/', '') : (project?.slug || project?.id)
    const baseUrl = window.location.origin
    const headlineParam = testHeadline ? `&headline=${encodeURIComponent(testHeadline)}` : ''
    const fullAdUrl = `${baseUrl}/p/${slug}?utm_source=meta&utm_medium=cpc&utm_campaign=ad_variant${headlineParam}`
    navigator.clipboard.writeText(fullAdUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  return (
    <div className={`workspace-panel ${isFullscreen ? 'workspace-panel--fullscreen' : ''}`}>
      {/* Sub-Nav Bar */}
      <div className="workspace-header">
        {/* Left: Code / Preview tabs */}
        <div className="workspace-tabs" role="tablist">
          <button
            role="tab"
            id="tab-code"
            aria-selected={activeTab === 'code'}
            className={`workspace-tab ${activeTab === 'code' ? 'workspace-tab--active' : ''}`}
            onClick={() => onTabChange('code')}
          >
            Code
            {isStreaming && <span className="apple-tab-spinner" />}
          </button>
          <button
            role="tab"
            id="tab-preview"
            aria-selected={activeTab === 'preview'}
            className={`workspace-tab ${activeTab === 'preview' ? 'workspace-tab--active' : ''}`}
            onClick={() => onTabChange('preview')}
          >
            Preview
            {isStreaming && <span className="preview-status-pill">Generating…</span>}
          </button>
        </div>

        {/* Center: Responsive Device Switcher (Visible in Preview mode) */}
        {activeTab === 'preview' && (
          <div className="viewport-switcher" role="group" aria-label="Device viewport modes">
            <button
              type="button"
              className={`viewport-btn ${viewportMode === 'desktop' ? 'viewport-btn--active' : ''}`}
              onClick={() => setViewportMode('desktop')}
              title="Desktop View (100%)"
            >
              <Icons.Desktop />
              <span className="viewport-label">Desktop</span>
            </button>
            <button
              type="button"
              className={`viewport-btn ${viewportMode === 'tablet' ? 'viewport-btn--active' : ''}`}
              onClick={() => setViewportMode('tablet')}
              title="Tablet View (768px)"
            >
              <Icons.Tablet />
              <span className="viewport-label">Tablet</span>
            </button>
            <button
              type="button"
              className={`viewport-btn ${viewportMode === 'phone' ? 'viewport-btn--active' : ''}`}
              onClick={() => setViewportMode('phone')}
              title="Phone View (375px)"
            >
              <Icons.Phone />
              <span className="viewport-label">Phone</span>
            </button>
          </div>
        )}

        {/* Right: Actions & Fullscreen Toggle */}
        <div className="workspace-header-actions">
          {activeTab === 'preview' && (
            <button
              type="button"
              className={`btn-fullscreen-toggle ${isFullscreen ? 'btn-fullscreen-toggle--active' : ''}`}
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen mode'}
            >
              {isFullscreen ? <Icons.Minimize /> : <Icons.Maximize />}
              <span className="fullscreen-btn-text">
                {isFullscreen ? 'Exit' : 'Full screen'}
              </span>
            </button>
          )}

          {!isFullscreen && (
            <ActionBar
              project={project}
              code={code}
              isStreaming={isStreaming}
              onPublish={onPublish}
              onProjectUpdate={onProjectUpdate}
            />
          )}

          {isFullscreen && (
            <button
              type="button"
              className="btn-exit-fullscreen"
              onClick={() => setIsFullscreen(false)}
              title="Exit full screen (Esc)"
            >
              <Icons.Close />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        className="workspace-content"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {sseError && (
          <div className="workspace-error">
            <span>{sseError}</span>
          </div>
        )}

        {/* CODE TAB */}
        {activeTab === 'code' && (
          <>
            {hasCode ? (
              <CodeStream code={code} isStreaming={isStreaming} />
            ) : (
              <GeneratingOverlay
                statusMessage={statusMessage}
                lineCount={0}
              />
            )}
          </>
        )}

        {/* PREVIEW TAB */}
        {activeTab === 'preview' && (
          <div className={`preview-wrapper preview-wrapper--${viewportMode}`}>
            {hasCode && (
              <div className="ad-congruence-bar">
                <div className="ad-congruence-left">
                  <span className="ad-congruence-tag">1:1 Ad Congruence</span>
                  <input
                    type="text"
                    className="ad-congruence-input"
                    placeholder="Test Ad Hook (?headline=... or ?utm_content=...)"
                    value={testHeadline}
                    onChange={(e) => setTestHeadline(e.target.value)}
                  />
                </div>

                <div className="ad-congruence-right">
                  <div className="ad-congruence-checklist">
                    <span className="checklist-badge">✓ Scent Match</span>
                    <span className="checklist-badge">✓ Dynamic UTM</span>
                    <span className="checklist-badge">✓ Mobile Sticky Buy</span>
                  </div>
                  <button
                    type="button"
                    className={`btn-copy-ad-url ${copiedUrl ? 'btn-copy-ad-url--copied' : ''}`}
                    onClick={handleCopyAdUrl}
                    title="Copy URL with Meta Ads UTM parameters"
                  >
                    {copiedUrl ? '✓ Copied Meta URL!' : 'Copy Meta Ad URL'}
                  </button>
                </div>
              </div>
            )}

            {/* Live Analytics Strip */}
            {analytics && (analytics.total_views > 0 || analytics.total_clicks > 0 || analytics.total_leads > 0) && (
              <div className="live-analytics-strip">
                <div className="analytics-strip-left">
                  <span className="live-indicator"><span className="live-dot" /> LIVE METRICS</span>
                  <span className="analytics-metric"><strong>{analytics.total_views}</strong> views</span>
                  <span className="analytics-metric"><strong>{analytics.total_clicks}</strong> clicks</span>
                  <span className="analytics-metric"><strong>{analytics.ctr}%</strong> CTR</span>
                  <span className="analytics-metric"><strong>{analytics.total_leads}</strong> orders/leads</span>
                </div>
                {analytics.top_angles && analytics.top_angles.length > 0 && (
                  <div className="analytics-strip-right">
                    <span className="top-angle-label">Top Angle:</span>
                    <span className="top-angle-name">"{analytics.top_angles[0].campaign}"</span>
                    <span className="top-angle-ctr">({analytics.top_angles[0].ctr}% CTR)</span>
                  </div>
                )}
              </div>
            )}

            {hasCode ? (
              <div className="preview-stage">
                <div className={`device-frame device-frame--${viewportMode}`}>
                  {/* Phone Notch & Speaker (When in Phone mode) */}
                  {viewportMode === 'phone' && (
                    <div className="phone-notch-island" aria-hidden="true">
                      <span className="notch-camera" />
                      <span className="notch-speaker" />
                    </div>
                  )}

                  <iframe
                    id="preview-iframe"
                    className="preview-iframe"
                    title={`Page preview (${viewportMode})`}
                    srcDoc={injectBaseTarget(code, testHeadline)}
                    sandbox="allow-scripts allow-forms allow-popups"
                  />
                </div>
              </div>
            ) : (
              <GeneratingOverlay
                statusMessage={statusMessage}
                lineCount={lineCount}
                onSwitchToCode={() => onTabChange('code')}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
