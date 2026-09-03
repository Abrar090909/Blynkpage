/**
 * Dashboard — Two-pane layout on desktop + full mobile responsiveness.
 * On mobile devices, seamlessly toggles between Workspace (Preview/Code) and AI Chat.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSSE } from '../hooks/useSSE'
import { API_BASE } from '../config'
import ChatPanel from './ChatPanel'
import WorkspacePanel from './WorkspacePanel'
import FuturisticBLogo from './FuturisticBLogo'
import PricingModal from './PricingModal'
import PasswordResetModal from './PasswordResetModal'
import './Dashboard.css'

export default function Dashboard() {
  const { projectId } = useParams()
  const { user, token, authFetch, logout } = useAuth()
  const [project, setProject] = useState(null)
  const [loadError, setLoadError] = useState('')
  const { code, isStreaming, isDone, error: sseError, statusMessage, startStream } = useSSE()
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem('pl_workspace_tab') || 'preview'
  )
  const [mobilePane, setMobilePane] = useState('workspace') // 'workspace' | 'chat'
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [pricingReason, setPricingReason] = useState(null)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetUid, setResetUid] = useState(null)
  const [resetToken, setResetToken] = useState(null)
  const [subInfo, setSubInfo] = useState(null)

  // Fetch project data with strict user authentication
  const loadProject = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/projects/${projectId}/`)
      if (res.status === 401 || res.status === 403) {
        throw new Error('Access denied: You do not have permission to view or edit this project.')
      }
      if (!res.ok) throw new Error(`Failed to load project (${res.status})`)
      const data = await res.json()
      setProject(data)
      return data
    } catch (e) {
      setLoadError(e.message)
    }
  }, [projectId, authFetch])

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/billing/me/`)
      if (res.ok) {
        const data = await res.json()
        setSubInfo(data)
      }
    } catch (e) {
      // Non-critical
    }
  }, [authFetch])

  useEffect(() => {
    fetchSubscription()
    const params = new URLSearchParams(window.location.search)
    const uid = params.get('reset_uid')
    const tok = params.get('reset_token')
    if (uid && tok) {
      setResetUid(uid)
      setResetToken(tok)
      setShowResetModal(true)
    }
  }, [fetchSubscription])

  useEffect(() => {
    if (projectId) {
      localStorage.setItem('pl_last_project_id', projectId)
    }
    loadProject().then(p => {
      if (p && (p.status === 'generating' || p.status === 'enhancing')) {
        setActiveTab('code')
        startStream(projectId, token)
      }
    })
  }, [projectId, token]) // eslint-disable-line

  // After stream ends, reload project to get updated status + chat history
  useEffect(() => {
    if (isDone) {
      loadProject()
      fetchSubscription()
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
      const res = await authFetch(`${API_BASE}/api/projects/${projectId}/chat/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (res.status === 402) {
        setPricingReason('quota_exceeded')
        setShowPricingModal(true)
        return
      }

      if (!res.ok) throw new Error('Failed to send refinement')
      
      // Auto-switch to workspace on mobile so user sees the live changes
      setMobilePane('workspace')
      setActiveTab('preview')
      localStorage.setItem('pl_workspace_tab', 'preview')
      startStream(projectId, token)
    } catch (e) {
      console.error(e)
    }
  }

  const handlePublish = async () => {
    const res = await authFetch(`${API_BASE}/api/projects/${projectId}/publish/`, {
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
            <FuturisticBLogo size={22} />
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
          {/* Subscription & Quota Pill */}
          {subInfo && (
            <button
              type="button"
              className={`plan-header-pill plan-header-pill--${subInfo.plan}`}
              onClick={() => {
                setPricingReason(null)
                setShowPricingModal(true)
              }}
              title="Click to view subscription plan or upgrade"
            >
              <span className="plan-pill-name">
                {subInfo.plan === 'pro' ? 'PRO' : subInfo.plan === 'starter' ? 'STARTER' : 'FREE'}
              </span>
              {subInfo.limit !== null && (
                <span className="plan-pill-usage">{subInfo.used}/{subInfo.limit}</span>
              )}
            </button>
          )}

          <span className={`status-badge status-badge--${project.status}`}>
            {isStreaming ? 'Generating…' : project.status}
          </span>
          {user && (
            <div className="monolith-user-pill" style={{ marginLeft: '8px' }}>
              <div className="monolith-user-avatar">
                {(user?.first_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
              </div>
              <span style={{ fontSize: '12px' }}>{user?.first_name || user?.email?.split('@')[0]}</span>
            </div>
          )}
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
            projectId={project.id}
            onVersionRestored={loadProject}
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

      {/* Pricing / Quota Limit Modal */}
      {showPricingModal && (
        <PricingModal
          reason={pricingReason}
          onClose={() => {
            setShowPricingModal(false)
            setPricingReason(null)
            fetchSubscription()
          }}
        />
      )}

      {/* Password Reset Modal */}
      {showResetModal && (
        <PasswordResetModal
          initialUid={resetUid}
          initialToken={resetToken}
          onClose={() => {
            setShowResetModal(false)
            setResetUid(null)
            setResetToken(null)
          }}
        />
      )}
    </div>
  )
}

