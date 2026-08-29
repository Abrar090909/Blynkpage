/**
 * WorkspacePanel — Apple-Designed Code/Preview tab switcher + ActionBar.
 * Complies with DESIGN.md: Action Blue, SF Pro typography, no blinking green dots.
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

/**
 * Apple-style minimalist activity indicator loader.
 * Completely eliminates neon green dots and erratic blinking in favor of
 * a calm, refined Cupertino activity spinner and typography.
 */
function AppleGeneratingOverlay({ statusMessage, lineCount, onSwitchToCode }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIndex(i => (i + 1) % DEFAULT_STAGES.length)
    }, 3200)
    return () => clearInterval(timer)
  }, [])

  const currentMsg = statusMessage || DEFAULT_STAGES[stageIndex]

  return (
    <div className="apple-loader-overlay">
      {/* Background subtle atmospheric canvas */}
      <div className="apple-loader-canvas" aria-hidden="true" />

      {/* Apple-style clean activity spinner */}
      <div className="apple-spinner-wrapper" aria-hidden="true">
        <div className="apple-spinner-ring" />
      </div>

      {/* Headline & status */}
      <div className="apple-loader-header">
        <span className="apple-loader-badge">Generating with Gemini</span>
        <h3 className="apple-loader-title">Building your custom page</h3>
        <p className="apple-loader-sub" key={currentMsg}>
          {currentMsg}
        </p>
      </div>

      {/* Minimalist 2px progress bar in Action Blue */}
      <div className="apple-progress-track">
        <div className="apple-progress-indicator" />
      </div>

      {/* Line count & live stream switcher */}
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

      {/* Clean Apple pipeline steps */}
      <div className="apple-pipeline">
        {['Brief', 'Copy', 'Visuals', 'Code', 'Preview'].map((step, i) => {
          const isDone = lineCount > 0 ? i <= 3 : i < stageIndex
          const isCurrent = lineCount > 0 ? i === 3 : i === stageIndex

          return (
            <div
              key={step}
              className={`apple-step ${isCurrent ? 'apple-step--active' : ''} ${isDone ? 'apple-step--done' : ''}`}
            >
              <span className="apple-step-marker">
                {isDone ? '✓' : ''}
              </span>
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
  const isGenerating =
    isStreaming ||
    project?.status === 'generating' ||
    project?.status === 'enhancing'

  const lineCount = code ? code.split('\n').length : 0

  return (
    <div className="workspace-panel">
      {/* Apple-style Sub-Nav Bar */}
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

        <ActionBar
          project={project}
          code={code}
          isStreaming={isStreaming}
          onPublish={onPublish}
          onProjectUpdate={onProjectUpdate}
        />
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
            {isGenerating && !code ? (
              <AppleGeneratingOverlay
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
              <AppleGeneratingOverlay
                statusMessage={statusMessage}
                lineCount={lineCount}
                onSwitchToCode={() => onTabChange('code')}
              />
            ) : code ? (
              <iframe
                id="preview-iframe"
                className="preview-iframe"
                title="Page preview"
                srcDoc={injectBaseTarget(code)}
                sandbox="allow-scripts"
              />
            ) : (
              <div className="preview-empty">
                <p>Enter a prompt to generate and preview your page.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
