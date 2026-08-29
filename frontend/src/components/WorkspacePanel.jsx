/**
 * WorkspacePanel — Code/Preview tab switcher + ActionBar.
 * Right pane of the dashboard.
 */
import { useState, useEffect } from 'react'
import CodeStream from './CodeStream'
import ActionBar from './ActionBar'
import './WorkspacePanel.css'

/**
 * Injects <base target="_blank"> into the preview HTML so all links/forms
 * open in a new tab instead of navigating the iframe itself.
 */
function injectBaseTarget(html) {
  if (!html) return html
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, '$1<base target="_blank">')
  }
  return '<base target="_blank">' + html
}

const DEFAULT_STAGES = [
  'Analysing prompt & brand voice…',
  'Crafting high-converting headlines…',
  'Writing value props & social proof…',
  'Sourcing high-res product visuals…',
  'Styling responsive CSS layout…',
  'Polishing interactive elements…',
  'Finalising conversion triggers…',
]

function GeneratingOverlay({ statusMessage, lineCount, onSwitchToCode }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex(i => (i + 1) % DEFAULT_STAGES.length)
    }, 3200)
    return () => clearInterval(timer)
  }, [])

  const currentMsg = statusMessage || DEFAULT_STAGES[stageIndex]

  return (
    <div className="generating-overlay">
      <div className="gen-grid" aria-hidden="true" />

      {/* Central animated pulse indicator */}
      <div className="gen-pulse-rings" aria-hidden="true">
        <span className="ring ring-1" />
        <span className="ring ring-2" />
        <span className="ring ring-3" />
        <span className="gen-core" />
      </div>

      {/* Main status headline */}
      <div className="gen-status">
        <div className="gen-badge">
          <span className="tab-streaming-dot" />
          <span>AI Engine Active</span>
        </div>
        <h3 className="gen-label">Building your custom page</h3>
        <p className="gen-message" key={currentMsg}>
          {currentMsg}
        </p>
      </div>

      {/* Progress track */}
      <div className="gen-progress-track">
        <div className="gen-progress-bar" />
      </div>

      {/* Token / line stream indicator if tokens started */}
      {lineCount > 0 && (
        <div className="gen-stats">
          <span className="gen-stat-pill">
            ⚡ {lineCount} lines generated so far
          </span>
          {onSwitchToCode && (
            <button
              type="button"
              className="btn btn-ghost btn-sm gen-code-btn"
              onClick={onSwitchToCode}
            >
              Watch live code stream →
            </button>
          )}
        </div>
      )}

      {/* Step pipeline */}
      <div className="gen-steps">
        {['1. Brief', '2. Copy', '3. Visuals', '4. Code', '5. Preview'].map((step, i) => {
          const isActive = lineCount > 0 ? i <= 3 : i <= Math.min(stageIndex, 2)
          return (
            <div
              key={step}
              className={`gen-step ${isActive ? 'gen-step--active' : ''}`}
            >
              <div className="gen-step-dot" />
              <span>{step}</span>
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
  const isGenerating =
    isStreaming ||
    project?.status === 'generating' ||
    project?.status === 'enhancing'

  const lineCount = code ? code.split('\n').length : 0

  return (
    <div className="workspace-panel">
      {/* Header bar: Tabs on left, Actions on right */}
      <div className="workspace-header">
        <div className="workspace-tabs" role="tablist">
          <button
            role="tab"
            id="tab-code"
            aria-selected={activeTab === 'code'}
            className={`workspace-tab ${activeTab === 'code' ? 'workspace-tab--active' : ''}`}
            onClick={() => onTabChange('code')}
          >
            Code
            {isStreaming && <span className="tab-streaming-dot" />}
          </button>
          <button
            role="tab"
            id="tab-preview"
            aria-selected={activeTab === 'preview'}
            className={`workspace-tab ${activeTab === 'preview' ? 'workspace-tab--active' : ''}`}
            onClick={() => onTabChange('preview')}
          >
            Preview
            {isStreaming && <span className="preview-live-badge">Building…</span>}
          </button>
        </div>

        <ActionBar
          project={project}
          code={code}
          isStreaming={isStreaming}
          onPublish={onPublish}
          onProjectUpdate={onProjectUpdate}
        />
      </div>

      {/* Main content body */}
      <div
        className="workspace-content"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
      >
        {sseError && (
          <div className="workspace-error">
            <span>⚠ {sseError}</span>
          </div>
        )}

        {/* CODE TAB */}
        {activeTab === 'code' && (
          <>
            {isGenerating && !code ? (
              <GeneratingOverlay
                statusMessage={statusMessage}
                lineCount={0}
              />
            ) : (
              <CodeStream code={code} isStreaming={isStreaming} />
            )}
          </>
        )}

        {/* PREVIEW TAB */}
        {activeTab === 'preview' && (
          <div className="preview-wrapper">
            {isGenerating ? (
              // While generating, show high-tech animated overlay instead of half-rendered HTML
              <GeneratingOverlay
                statusMessage={statusMessage}
                lineCount={lineCount}
                onSwitchToCode={() => onTabChange('code')}
              />
            ) : code ? (
              // When done, show full preview iframe
              <iframe
                id="preview-iframe"
                className="preview-iframe"
                title="Page preview"
                srcDoc={injectBaseTarget(code)}
                sandbox="allow-scripts"
              />
            ) : (
              // Empty fallback
              <div className="preview-empty">
                <div className="preview-empty-icon">⟡</div>
                <p>Generate your page to see the preview here.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
