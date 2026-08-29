/**
 * Dashboard — Two-pane layout on desktop + full mobile responsiveness.
 * On mobile devices, seamlessly toggles between Workspace (Preview/Code) and AI Chat.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSSE } from '../hooks/useSSE'
import { API_BASE } from '../config'
import ChatPanel from './ChatPanel'
import WorkspacePanel from './WorkspacePanel'
import './Dashboard.css'

export default function Dashboard() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [loadError, setLoadError] = useState('')
  const { code, isStreaming, isDone, error: sseError, statusMessage, startStream } = useSSE()
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem('pl_workspace_tab') || 'preview'
  )
  const [mobilePane, setMobilePane] = useState('workspace') // 'workspace' | 'chat'

  // Fetch project data
  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/`)
      if (!res.ok) throw new Error(`Failed to load project (${res.status})`)
      const data = await res.json()
      setProject(data)
      return data
    } catch (e) {
      setLoadError(e.message)
    }
  }, [projectId])

  useEffect(() => {
    loadProject().then(p => {
      if (p && (p.status === 'generating' || p.status === 'enhancing')) {
        setActiveTab('code')
        startStream(projectId)
      }
    })
  }, [projectId]) // eslint-disable-line

  // After stream ends, reload project to get updated status + chat history
  useEffect(() => {
    if (isDone) {
      loadProject()
      setActiveTab('preview')
      localStorage.setItem('pl_workspace_tab', 'preview')
    }
  }, [isDone]) // eslint-disable-line

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    localStorage.setItem('pl_workspace_tab', tab)
  }

  const handleRefinement = async (message) => {
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error('Failed to send refinement')
      
      // Auto-switch to workspace on mobile so user sees the live changes
      setMobilePane('workspace')
      setActiveTab('preview')
      localStorage.setItem('pl_workspace_tab', 'preview')
      startStream(projectId)
    } catch (e) {
      console.error(e)
    }
  }

  const handlePublish = async () => {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/publish/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (data.published_url) {
      await loadProject()
    }
    return data
  }

  if (loadError) {
    return (
      <div className="dashboard-error">
        <p>{loadError}</p>
        <Link to="/" className="btn-monolith-primary">← Back to home</Link>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Loading project…</p>
      </div>
    )
  }

  // The code to display: live stream if streaming, otherwise saved output
  const displayCode = (isStreaming || code) ? code : (project.current_html || '')

  return (
    <div className="dashboard-root">
      {/* Top bar */}
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <Link to="/" className="dashboard-logo">
            <span className="logo-mark">BP</span>
            <span className="logo-title">Blynkpage</span>
          </Link>
          <div className="dashboard-breadcrumb">
            <span className="breadcrumb-prompt" title={project.original_prompt}>
              {project.original_prompt}
            </span>
          </div>
        </div>

        {/* Mobile View Toggle Switcher (< 768px) */}
        <div className="dashboard-mobile-nav">
          <button
            type="button"
            className={`mobile-nav-btn ${mobilePane === 'workspace' ? 'mobile-nav-btn--active' : ''}`}
            onClick={() => setMobilePane('workspace')}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`mobile-nav-btn ${mobilePane === 'chat' ? 'mobile-nav-btn--active' : ''}`}
            onClick={() => setMobilePane('chat')}
          >
            AI Chat
            {project.messages?.length > 0 && (
              <span className="mobile-chat-count">{project.messages.length}</span>
            )}
          </button>
        </div>

        <div className="dashboard-header-right">
          <span className={`status-badge status-badge--${project.status}`}>
            {isStreaming ? 'Generating…' : project.status}
          </span>
        </div>
      </header>

      {/* Two-pane layout on desktop, responsive tab-pane on mobile */}
      <div className="dashboard-body">
        {/* Left — Chat Panel */}
        <aside className={`dashboard-chat-pane ${mobilePane === 'chat' ? 'dashboard-pane--mobile-active' : ''}`}>
          <ChatPanel
            messages={project.messages}
            isStreaming={isStreaming}
            onSendRefinement={handleRefinement}
            projectStatus={project.status}
          />
        </aside>

        {/* Right — Workspace Panel (Code / Preview / Devices) */}
        <main className={`dashboard-workspace-pane ${mobilePane === 'workspace' ? 'dashboard-pane--mobile-active' : ''}`}>
          <WorkspacePanel
            code={displayCode}
            isStreaming={isStreaming}
            isDone={isDone}
            sseError={sseError}
            statusMessage={statusMessage}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            project={project}
            onPublish={handlePublish}
            onProjectUpdate={loadProject}
          />
        </main>
      </div>
    </div>
  )
}
