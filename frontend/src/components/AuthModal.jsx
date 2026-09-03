import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import FuturisticBLogo from './FuturisticBLogo'
import './AuthModal.css'

export default function AuthModal({ isOpen, onClose, defaultTab = 'signin', onSuccess, title, subtitle, onForgotPassword }) {
  const [tab, setTab] = useState(defaultTab) // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const { login, register } = useAuth()

  useEffect(() => {
    setTab(defaultTab)
    setError('')
  }, [defaultTab, isOpen])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (tab === 'signup') {
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.')
        }
        await register(email, password, name)
      } else {
        await login(email, password)
      }

      setIsLoading(false)
      onClose()
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.')
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-glow" />

        <button
          type="button"
          className="auth-modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="auth-modal-header">
          <div className="auth-modal-logo">
            <FuturisticBLogo size={22} />
            <span className="auth-modal-logo-text">Blynkpage</span>
          </div>
          <h2 className="auth-modal-title">
            {title || (tab === 'signup' ? 'Create your account' : 'Welcome back')}
          </h2>
          <p className="auth-modal-subtitle">
            {subtitle || (tab === 'signup'
              ? 'Join thousands of founders launching high-converting pages.'
              : 'Sign in to access your projects and live generations.')}
          </p>
        </div>

        <div className="auth-modal-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'signin' ? 'auth-tab-btn--active' : ''}`}
            onClick={() => {
              setTab('signin')
              setError('')
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'signup' ? 'auth-tab-btn--active' : ''}`}
            onClick={() => {
              setTab('signup')
              setError('')
            }}
          >
            Create Account
          </button>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        <form className="auth-modal-form" onSubmit={handleSubmit}>
          {tab === 'signup' && (
            <div className="auth-field-group">
              <label className="auth-label" htmlFor="auth-name">Your Name</label>
              <input
                id="auth-name"
                className="auth-input"
                type="text"
                placeholder="Alex Founder"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-field-group">
            <label className="auth-label" htmlFor="auth-email">Work Email</label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              placeholder="founder@startup.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="auth-field-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="auth-label" htmlFor="auth-password">Password</label>
              {tab === 'signin' && onForgotPassword && (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: '11px', cursor: 'pointer', padding: 0 }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              placeholder={tab === 'signup' ? 'Min. 8 characters' : 'Enter your password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="auth-spinner" />
                <span>{tab === 'signup' ? 'Creating account…' : 'Signing in…'}</span>
              </>
            ) : (
              <span>{tab === 'signup' ? 'Create Account' : 'Sign In'}</span>
            )}
          </button>
        </form>

        <div className="auth-modal-footer">
          {tab === 'signup' ? (
            <span>
              Already have an account?
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => {
                  setTab('signin')
                  setError('')
                }}
              >
                Sign In
              </button>
            </span>
          ) : (
            <span>
              Don't have an account yet?
              <button
                type="button"
                className="auth-switch-link"
                onClick={() => {
                  setTab('signup')
                  setError('')
                }}
              >
                Create one
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
