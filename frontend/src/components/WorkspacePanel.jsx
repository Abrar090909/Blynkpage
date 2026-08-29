/**
 * WorkspacePanel — Apple-Designed Code/Preview tab switcher + ActionBar.
 * Complies with DESIGN.md: Action Blue, SF Pro typography, no blinking green dots,
 * real non-looping pipeline progress, and immediate preview when code is available.
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
  // Strip any accidental markdown fences from the preview
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

/**
 * Apple-style minimalist activity indicator loader.
 * Linear progression without looping checkboxes.
 */
function AppleGeneratingOverlay({ statusMessage, lineCount, onSwitchToCode }) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    // Advance linearly up to the final stage — never loop back to 0!
    const timer = setInterval(() => {
      setStageIndex(i => Math.min(i + 1, DEFAULT_STAGES.length - 1))
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const currentMsg = statusMessage || DEFAULT_STAGES[stageIndex]

  // Pipeline steps mapped to real progress
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

      {/* Clean Apple pipeline steps — linear, no looping */}
      <div className="apple-pipeline">
        {steps.map((step, i) => {
          const state = getStepState(i)
          return (
            <div
              key={step}
              className={`apple-step ${state === 'active' ? 'apple-step--active' : ''} ${state === 'done' ? 'apple-step--done' : ''}`}
            >
              <span className="apple-step-marker">
                {state === 'done' ? '✓' : ''}
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
  const lineCount = code ? code.split('\n').length : 0
  const hasCode = Boolean(code && code.trim().length > 50)

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
            {hasCode ? (
              <CodeStream code={code} isStreaming={isStreaming} />
            ) : (
              <AppleGeneratingOverlay
                statusMessage={statusMessage}
                lineCount={0}
              />
            )}
          </>
        )}

        {/* PREVIEW TAB */}
        {activeTab === 'preview' && (
          <div className="preview-wrapper">
            {hasCode ? (
              <iframe
                id="preview-iframe"
                className="preview-iframe"
                title="Page preview"
                srcDoc={injectBaseTarget(code)}
                sandbox="allow-scripts"
              />
            ) : (
              <AppleGeneratingOverlay
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
