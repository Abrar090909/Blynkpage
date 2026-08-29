/**
 * WorkspacePanel — Code/Preview tab switcher + Device Modes (Desktop/Tablet/Phone) + Fullscreen Mode.
 * Fully responsive across mobile devices and desktop.
 */
import { useState, useEffect } from 'react'
import CodeStream from './CodeStream'
import ActionBar from './ActionBar'
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
 * Injects <base target="_blank"> into preview HTML so all links/forms
 * open in a new tab instead of navigating the iframe itself.
 */
function injectBaseTarget(html) {
  if (!html) return html
  let clean = html.replace(/^```html\s*/i, '').replace(/```\s*$/i, '')
  if (/<head[^>]*>/i.test(clean)) {
    return clean.replace(/(<head[^>]*>)/i, '$1<base target="_blank">')
  }
  return '<base target="_blank">' + clean
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
                    srcDoc={injectBaseTarget(code)}
                    sandbox="allow-scripts allow-same-origin"
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
