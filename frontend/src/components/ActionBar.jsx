/**
 * ActionBar — row of action buttons above the workspace.
 * Publish (with compliance flag check), Download, Share, Configure Pixel.
 */
import { useState } from 'react'
import PixelSettingsModal from './PixelSettingsModal'
import OrdersDrawer from './OrdersDrawer'
import CustomDomainModal from './CustomDomainModal'
import './ActionBar.css'

// Precision Action Bar SVG Icons
const Icons = {
  UploadCloud: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      <polyline points="16 16 12 12 8 16" />
    </svg>
  ),
  RefreshCw: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  AlertTriangle: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Download: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Share2: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  MetaLogo: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02Z" />
    </svg>
  ),
  ShoppingBag: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  Globe: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
}

export default function ActionBar({ project, code, isStreaming, onPublish, onProjectUpdate }) {
  const [isPublishing, setIsPublishing] = useState(false)
  const [toast, setToast] = useState(null)
  const [showPixelModal, setShowPixelModal] = useState(false)
  const [showOrdersDrawer, setShowOrdersDrawer] = useState(false)
  const [showDomainModal, setShowDomainModal] = useState(false)
  const [complianceFlags, setComplianceFlags] = useState([])
  const [showComplianceModal, setShowComplianceModal] = useState(false)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const handlePublish = async () => {
    if (!code || isStreaming || isPublishing) return

    // Check compliance flags before publishing
    const flags = project?.compliance_flags || []
    if (flags.length > 0) {
      setComplianceFlags(flags)
      setShowComplianceModal(true)
      return
    }

    await doPublish()
  }

  const doPublish = async () => {
    setIsPublishing(true)
    setShowComplianceModal(false)
    try {
      const data = await onPublish()
      if (data.published_url) {
        // Check if compliance flags came back from the publish response
        if (data.compliance_flags?.length > 0) {
          setComplianceFlags(data.compliance_flags)
        }
        await onProjectUpdate()
        showToast(`Published → ${data.published_url}`)
      } else {
        showToast('Publish failed', 'error')
      }
    } catch {
      showToast('Publish failed', 'error')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDownload = () => {
    if (!code) return
    const blob = new Blob([code], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'landing-page.html'
    a.click()
    URL.revokeObjectURL(url)
    showToast('Downloaded landing-page.html')
  }

  const handleCopyLink = () => {
    if (!project?.published_url) {
      showToast('Publish first to get a shareable link', 'error')
      return
    }
    const url = `${window.location.origin}${project.published_url}`
    navigator.clipboard.writeText(url).then(() => {
      showToast('Link copied to clipboard!')
    })
  }

  const isPublished = !!project?.published_url
  const hasCode = !!code
  const hasFlags = (project?.compliance_flags || []).length > 0

  return (
    <>
      <div className="action-bar">
        <button
          id="action-publish"
          className={`btn btn-sm action-btn ${isPublished ? 'btn-secondary' : 'btn-primary'} ${hasFlags ? 'action-btn--warn' : ''}`}
          onClick={handlePublish}
          disabled={!hasCode || isStreaming || isPublishing}
          title={hasFlags ? 'Review AI-generated claims before publishing' : (isPublished ? 'Re-publish with latest version' : 'Publish to a live URL')}
        >
          {isPublishing ? (
            <>
              <span className="apple-spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }} />
              Publishing…
            </>
          ) : hasFlags ? (
            <>
              <Icons.AlertTriangle size={13} />
              Review & Publish
            </>
          ) : isPublished ? (
            <>
              <Icons.RefreshCw size={12} />
              Re-publish
            </>
          ) : (
            <>
              <Icons.UploadCloud size={13} />
              Publish
            </>
          )}
        </button>

        <button
          id="action-download"
          className="btn btn-ghost btn-sm action-btn"
          onClick={handleDownload}
          disabled={!hasCode || isStreaming}
          title="Download HTML file"
        >
          <Icons.Download size={13} />
          <span className="action-btn-label">Download</span>
        </button>

        <button
          id="action-share"
          className="btn btn-ghost btn-sm action-btn"
          onClick={handleCopyLink}
          disabled={!isPublished}
          title={isPublished ? 'Copy shareable link' : 'Publish first to share'}
        >
          <Icons.Share2 size={13} />
          <span className="action-btn-label">Share</span>
        </button>

        {/* Orders */}
        <button
          id="action-orders"
          className="btn btn-ghost btn-sm action-btn"
          onClick={() => setShowOrdersDrawer(true)}
          title="View captured orders & leads"
        >
          <Icons.ShoppingBag size={13} />
          <span className="action-btn-label">Orders</span>
        </button>

        {/* Custom Domain */}
        <button
          id="action-custom-domain"
          className="btn btn-ghost btn-sm action-btn"
          onClick={() => setShowDomainModal(true)}
          title="Connect branded custom domain"
        >
          <Icons.Globe size={13} />
          <span className="action-btn-label">Domain</span>
        </button>

        {/* Meta Pixel */}
        <button
          id="action-meta-pixel"
          className={`btn btn-ghost btn-sm action-btn action-btn--meta ${project?.pixel_active ? 'action-btn--pixel-on' : ''}`}
          onClick={() => setShowPixelModal(true)}
          title="Configure Meta Pixel & CAPI for conversion tracking"
        >
          <Icons.MetaLogo size={12} />
          <span className="action-btn-label">{project?.pixel_active ? 'Pixel Active' : 'Pixel'}</span>
        </button>

        {/* Toast notification */}
        {toast && (
          <div className={`toast ${toast.type}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        )}
      </div>

      {/* Meta Pixel Settings Modal */}
      {showPixelModal && (
        <PixelSettingsModal onClose={() => setShowPixelModal(false)} />
      )}

      {/* Orders & Leads Drawer */}
      {showOrdersDrawer && (
        <OrdersDrawer
          projectId={project?.id}
          project={project}
          onClose={() => setShowOrdersDrawer(false)}
          onProjectUpdated={(upd) => onProjectUpdate && onProjectUpdate(upd)}
        />
      )}

      {/* Custom Domain Modal */}
      {showDomainModal && (
        <CustomDomainModal
          projectId={project?.id}
          onClose={() => setShowDomainModal(false)}
        />
      )}

      {/* Compliance Review Modal */}
      {showComplianceModal && (
        <div className="compliance-overlay">
          <div className="compliance-modal" role="dialog" aria-modal="true">
            <div className="compliance-header">
              <span className="compliance-icon" style={{ color: '#fbbf24' }}>
                <Icons.AlertTriangle size={24} />
              </span>
              <div>
                <h3>Review Before Publishing</h3>
                <p>The AI generated claims that may need your attention before going live in a paid ad.</p>
              </div>
            </div>
            <ul className="compliance-list">
              {complianceFlags.map((flag, i) => (
                <li key={i} className="compliance-item">
                  <strong>{flag.type}</strong>
                  <span>{flag.description}</span>
                  {flag.matched_text && (
                    <code className="compliance-match">"{flag.matched_text}"</code>
                  )}
                </li>
              ))}
            </ul>
            <p className="compliance-footer">
              You can fix these in the chat, or acknowledge and publish anyway. Meta/FTC liability is yours as the advertiser.
            </p>
            <div className="compliance-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowComplianceModal(false)}
              >
                Fix in chat first
              </button>
              <button
                id="compliance-publish-anyway"
                className="btn btn-primary btn-sm"
                onClick={doPublish}
                disabled={isPublishing}
              >
                {isPublishing ? 'Publishing…' : 'Acknowledge & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

