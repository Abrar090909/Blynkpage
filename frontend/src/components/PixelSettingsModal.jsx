/**
 * PixelSettingsModal — Configure Meta Pixel ID and CAPI access token.
 *
 * This modal replaces the "Connect to Meta SOON" button in the ActionBar.
 * Once saved, the Pixel ID is auto-injected into every published page,
 * and server-side CAPI events are forwarded for iOS-resistant tracking.
 */
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import './PixelSettingsModal.css'

export default function PixelSettingsModal({ onClose }) {
  const { authFetch } = useAuth()
  const [pixelId, setPixelId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [maskedToken, setMaskedToken] = useState('')
  const [hasPixel, setHasPixel] = useState(false)
  const [hasCapi, setHasCapi] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchPixelConfig()
  }, [])

  async function fetchPixelConfig() {
    try {
      const res = await authFetch(`${API_BASE}/api/account/pixel/`)
      if (res.ok) {
        const data = await res.json()
        setPixelId(data.meta_pixel_id || '')
        setMaskedToken(data.meta_access_token_masked || '')
        setHasPixel(data.has_pixel)
        setHasCapi(data.has_capi_token)
      }
    } catch (e) {
      setError('Failed to load pixel config.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    // Validate pixel ID
    if (pixelId && !/^\d{10,20}$/.test(pixelId)) {
      setError('Pixel ID must be a 10–20 digit number from Meta Events Manager.')
      return
    }

    setIsSaving(true)
    try {
      const body = { meta_pixel_id: pixelId }
      if (accessToken) body.meta_access_token = accessToken

      const res = await authFetch(`${API_BASE}/api/account/pixel/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save pixel config.')
      }

      const data = await res.json()
      setHasPixel(data.has_pixel)
      setHasCapi(data.has_capi_token)
      setAccessToken('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e) {
      setError(e.message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="pixel-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pixel-modal" role="dialog" aria-modal="true" aria-label="Meta Pixel Settings">

        <div className="pixel-modal-header">
          <div className="pixel-modal-title">
            <span className="pixel-meta-icon">f</span>
            <div>
              <h2>Meta Pixel & CAPI</h2>
              <p>Auto-inject tracking into every page you publish</p>
            </div>
          </div>
          <button className="pixel-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isLoading ? (
          <div className="pixel-modal-loading">
            <span className="apple-spinner" />
            Loading your configuration…
          </div>
        ) : (
          <div className="pixel-modal-body">

            {/* Status row */}
            <div className="pixel-status-row">
              <div className={`pixel-status-chip ${hasPixel ? 'pixel-status-chip--active' : 'pixel-status-chip--inactive'}`}>
                <span className="pixel-status-dot" />
                {hasPixel ? 'Pixel Active' : 'No Pixel Configured'}
              </div>
              <div className={`pixel-status-chip ${hasCapi ? 'pixel-status-chip--active' : 'pixel-status-chip--inactive'}`}>
                <span className="pixel-status-dot" />
                {hasCapi ? 'CAPI Active' : 'CAPI Not Configured'}
              </div>
            </div>

            <form onSubmit={handleSave} className="pixel-form">

              {/* Pixel ID */}
              <div className="pixel-form-group">
                <label htmlFor="pixel-id-input" className="pixel-label">
                  Meta Pixel ID
                  <span className="pixel-label-hint">From Meta Events Manager → Data Sources</span>
                </label>
                <input
                  id="pixel-id-input"
                  type="text"
                  className="pixel-input"
                  value={pixelId}
                  onChange={e => setPixelId(e.target.value.replace(/\D/g, '').slice(0, 20))}
                  placeholder="1234567890123456"
                  maxLength={20}
                  inputMode="numeric"
                />
              </div>

              {/* Access Token */}
              <div className="pixel-form-group">
                <label htmlFor="pixel-token-input" className="pixel-label">
                  System User Access Token
                  <span className="pixel-label-hint">For server-side CAPI — survives iOS blockers</span>
                </label>
                <input
                  id="pixel-token-input"
                  type="password"
                  className="pixel-input"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder={maskedToken ? `Current: ${maskedToken}` : 'Paste your access token…'}
                />
                <span className="pixel-input-help">
                  Optional but recommended. Without CAPI, ~40% of Meta ad conversions go unmeasured on iOS.
                </span>
              </div>

              {error && <div className="pixel-error" role="alert">{error}</div>}
              {success && (
                <div className="pixel-success" role="status">
                  ✓ Pixel configuration saved. Will be injected into your next published page.
                </div>
              )}

              <button
                type="submit"
                id="pixel-save-btn"
                className="btn btn-primary pixel-save-btn"
                disabled={isSaving}
              >
                {isSaving ? (
                  <><span className="apple-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</>
                ) : 'Save Pixel Config'}
              </button>
            </form>

            {/* Pre-publish checklist */}
            <div className="pixel-checklist">
              <p className="pixel-checklist-title">Test before you spend</p>
              <ul className="pixel-checklist-items">
                <li className={`pixel-check-item ${hasPixel ? 'pixel-check-item--done' : ''}`}>
                  {hasPixel ? '✓' : '○'} Pixel ID configured
                </li>
                <li className={`pixel-check-item ${hasCapi ? 'pixel-check-item--done' : ''}`}>
                  {hasCapi ? '✓' : '○'} CAPI access token set (iOS-proof tracking)
                </li>
                <li className="pixel-check-item pixel-check-item--info">
                  ○ Publish a page to activate injection
                </li>
                <li className="pixel-check-item pixel-check-item--info">
                  ○ Verify in Meta Events Manager → Test Events
                </li>
              </ul>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
