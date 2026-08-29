/**
 * ActionBar — row of action buttons above the workspace.
 * Publish, Download, Share, Connect to Meta (disabled in Phase 1).
 */
import { useState } from 'react'
import './ActionBar.css'

export default function ActionBar({ project, code, isStreaming, onPublish, onProjectUpdate }) {
  const [isPublishing, setIsPublishing] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handlePublish = async () => {
    if (!code || isStreaming || isPublishing) return
    setIsPublishing(true)
    try {
      const data = await onPublish()
      if (data.published_url) {
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

  return (
    <div className="action-bar">
      <button
        id="action-publish"
        className={`btn btn-sm action-btn ${isPublished ? 'btn-secondary' : 'btn-primary'}`}
        onClick={handlePublish}
        disabled={!hasCode || isStreaming || isPublishing}
        title={isPublished ? 'Re-publish with latest version' : 'Publish to a live URL'}
      >
        {isPublishing ? (
          <>
            <span className="btn-spinner" style={{ borderTopColor: 'inherit' }} />
            Publishing…
          </>
        ) : isPublished ? (
          '↑ Re-publish'
        ) : (
          '↑ Publish'
        )}
      </button>

      <button
        id="action-download"
        className="btn btn-ghost btn-sm action-btn"
        onClick={handleDownload}
        disabled={!hasCode || isStreaming}
        title="Download HTML file"
      >
        ↓ Download
      </button>

      <button
        id="action-share"
        className="btn btn-ghost btn-sm action-btn"
        onClick={handleCopyLink}
        disabled={!isPublished}
        title={isPublished ? 'Copy shareable link' : 'Publish first to share'}
      >
        ⎘ Share link
      </button>

      {/* Meta Ads — disabled in Phase 1 */}
      <div className="action-btn-wrapper" title="Meta Ads integration — coming soon">
        <button
          id="action-meta"
          className="btn btn-ghost btn-sm action-btn action-btn--coming-soon"
          disabled
        >
          <span className="meta-icon">f</span>
          Connect to Meta
          <span className="coming-soon-badge">Soon</span>
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className={`toast ${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
    </div>
  )
}
