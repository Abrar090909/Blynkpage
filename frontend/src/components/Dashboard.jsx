/**
 * Dashboard — two-pane layout: Chat (left) + Workspace (right).
 * Loads project on mount, auto-starts SSE stream for new projects.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useSSE } from '../hooks/useSSE'
import ChatPanel from './ChatPanel'
import WorkspacePanel from './WorkspacePanel'
import './Dashboard.css'

export default function Dashboard() {
  const { projectId } = useParams()
  const [project, setProject] = useState(null)
  const [loadError, setLoadError] = useState('')
  const { code, isStreaming, isDone, error: sseError, statusMessage, startStream } = useSSE()
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem('pl_workspace_tab') || 'code'
  )

  // Fetch project data
  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/`)
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
        // Switch to code tab to watch generation in real-time
        setActiveTab('code')
        startStream(projectId)
      }
    })
  }, [projectId]) // eslint-disable-line

  // After stream ends, reload project to get updated status + chat history
  useEffect(() => {
    if (isDone) {
      loadProject()
      // Auto-switch to preview when generation completes
      setActiveTab('preview')
      localStorage.setItem('pl_workspace_tab', 'preview')
    }
  }, [isDone]) // eslint-disable-line

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    localStorage.setItem('pl_workspace_tab', tab)
  }

  const handleRefinement = async (message) => {
    // POST refinement, then start a fresh stream
    try {
      const res = await fetch(`/api/projects/${projectId}/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error('Failed to send refinement')
      setActiveTab('code')
      localStorage.setItem('pl_workspace_tab', 'code')
      startStream(projectId)
    } catch (e) {
      console.error(e)
    }
  }

  const handlePublish = async () => {
    const res = await fetch(`/api/projects/${projectId}/publish/`, {
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
        <Link to="/" className="btn btn-ghost btn-sm">← Back to home</Link>
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
        <Link to="/" className="dashboard-logo">
          <span className="logo-mark">PL</span>
        </Link>
        <div className="dashboard-breadcrumb">
          <span className="breadcrumb-prompt" title={project.original_prompt}>
            {project.original_prompt.length > 60
              ? project.original_prompt.slice(0, 60) + '…'
              : project.original_prompt}
          </span>
          <span className={`status-badge status-badge--${project.status}`}>
            {isStreaming ? 'Generating…' : project.status}
          </span>
        </div>
      </header>

      {/* Two-pane layout */}
      <div className="dashboard-body">
        {/* Left — Chat */}
        <aside className="dashboard-chat-pane">
          <ChatPanel
            messages={project.messages}
            isStreaming={isStreaming}
            onSendRefinement={handleRefinement}
            projectStatus={project.status}
          />
        </aside>

        {/* Right — Workspace */}
        <main className="dashboard-workspace-pane">
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
