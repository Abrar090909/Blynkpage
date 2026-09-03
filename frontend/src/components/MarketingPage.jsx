import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../config'
import { useAuth } from '../context/AuthContext'
import DarkVeil from './DarkVeil'
import FuturisticBLogo from './FuturisticBLogo'
import AuthModal from './AuthModal'
import './MarketingPage.css'

const EXAMPLE_PROMPTS = [
  'Meta Ad Angle: Why 90% of collagen powders fail to absorb in your body, and how our liposomal formula fixes it ($48/mo subscription).',
  'TikTok Video Hook: The 450 GSM organic streetwear hoodie that never shrinks in the wash. Limited Drop 004, $120 flat rate.',
  'Meta Ad Hook: Stop afternoon brain fog. The nitrogen-brewed cold brew beans that deliver 6-hour clean caffeine without acid crash ($24/bag).',
  'Google Ad Angle: Emergency 24-hr commercial roof leak repair in Austin, TX with $0 insurance claims diagnostic.',
  'TikTok Creative: The 0.3mm RFID-blocking titanium wallet that replaced 500,000 bulky leather wallets. $65 with lifetime warranty.',
]

// Real SVG Icons (Zero Emojis)
const Icons = {
  Play: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  Refresh: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  ),
  Search: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Bell: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  Grid: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  Trending: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  ShoppingBag: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
  MessageSquare: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  Settings: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Logo: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

export default function MarketingPage() {
  const { user, isAuthenticated, logout, authFetch } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState('signin')
  const [pendingPrompt, setPendingPrompt] = useState('')
  const [latestProjectId, setLatestProjectId] = useState(
    () => localStorage.getItem('pl_last_project_id') || null
  )

  const navigate = useNavigate()
  const textareaRef = useRef(null)

  useEffect(() => {
    if (isAuthenticated) {
      authFetch(`${API_BASE}/api/projects/`)
        .then(res => res.ok ? res.json() : [])
        .then(projects => {
          if (Array.isArray(projects) && projects.length > 0) {
            setLatestProjectId(projects[0].id)
            localStorage.setItem('pl_last_project_id', projects[0].id)
          }
        })
        .catch(() => {})
    }
  }, [isAuthenticated, authFetch])

  const cyclePlaceholder = () => {
    setPlaceholderIndex(i => (i + 1) % EXAMPLE_PROMPTS.length)
  }

  const handleUseExample = () => {
    setPrompt(EXAMPLE_PROMPTS[placeholderIndex])
    textareaRef.current?.focus()
  }

  const executeProjectCreation = async (textToSubmit) => {
    setIsLoading(true)
    setError('')

    try {
      const res = await authFetch(`${API_BASE}/api/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textToSubmit }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server error ${res.status}`)
      }

      const project = await res.json()
      navigate(`/dashboard/${project.id}`)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed) {
      textareaRef.current?.focus()
      return
    }

    // Zero-friction conversion: if not authenticated, pop auth modal and continue seamlessly
    if (!isAuthenticated) {
      setPendingPrompt(trimmed)
      setAuthTab('signup')
      setIsAuthOpen(true)
      return
    }

    await executeProjectCreation(trimmed)
  }

  return (
    <div className="monolith-root">
      {/* Background: Clean Monochrome DarkVeil, Zero Orange Slops */}
      <div className="monolith-bg" aria-hidden="true">
        <DarkVeil
          hueShift={0}
          noiseIntensity={0.015}
          scanlineIntensity={0.02}
          speed={0.25}
          warpAmount={0.15}
          resolutionScale={1}
        />
        <div className="monolith-vignette" />
      </div>

      {/* Top Navigation Bar */}
      <header className="monolith-nav-wrapper">
        <nav className="monolith-nav">
          <a href="/" className="monolith-logo">
            <FuturisticBLogo size={24} />
            <span className="monolith-logo-text">Blynkpage</span>
          </a>

          <div className="monolith-menu">
            <a href="#features" className="monolith-menu-link">Features</a>
            <a href="#how-it-works" className="monolith-menu-link">How it works</a>
            <a href="#preview" className="monolith-menu-link">Showcase</a>
            <a href="#pricing" className="monolith-menu-link">Pricing</a>
          </div>

          <div className="monolith-nav-actions">
            {isAuthenticated ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-monolith-primary btn-monolith-nav"
                  onClick={() => {
                    if (latestProjectId) {
                      navigate(`/dashboard/${latestProjectId}`)
                    } else {
                      textareaRef.current?.focus()
                    }
                  }}
                  title="Directly enter your workspace"
                >
                  <span>{latestProjectId ? 'Go to Workspace →' : 'New Project +'}</span>
                </button>
                <div className="monolith-user-pill">
                  <div className="monolith-user-avatar">
                    {(user?.first_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <span>{user?.first_name || user?.email?.split('@')[0]}</span>
                  <button
                    type="button"
                    className="monolith-btn-signout"
                    onClick={logout}
                    title="Sign out of your account"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-monolith-signin"
                  onClick={() => {
                    setAuthTab('signin')
                    setIsAuthOpen(true)
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="btn-monolith-primary btn-monolith-nav"
                  onClick={() => {
                    setAuthTab('signup')
                    setIsAuthOpen(true)
                  }}
                >
                  Get started
                </button>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="monolith-hero">
        {/* Announcement Capsule */}
        <div className="monolith-badge">
          <span className="badge-text">ROAS Optimizer</span>
          <span className="badge-sep">/</span>
          <span className="badge-sub">1:1 Meta & TikTok Ad Congruence</span>
          <span className="badge-arrow"><Icons.ArrowRight /></span>
        </div>

        {/* Headline: STRICTLY 2 LINES ONLY */}
        <h1 className="monolith-headline">
          Turn Meta & TikTok Ads<br />
          Into 1:1 High-ROAS Pages
        </h1>

        {/* Short, simple, easy to understand subtitle */}
        <p className="monolith-subheadline">
          Stop burning ad spend sending paid clicks to generic homepages. Paste your
          creative hook — get a congruent presell landing page that doubles your ROAS in 30 seconds.
        </p>

        {/* Quick CTA Actions: Clean solid white & dark borders, NO orange */}
        <div className="monolith-hero-actions">
          {isAuthenticated && latestProjectId ? (
            <>
              <button
                type="button"
                className="btn-monolith-primary"
                onClick={() => navigate(`/dashboard/${latestProjectId}`)}
              >
                <span>Resume Workspace</span>
                <Icons.ArrowRight />
              </button>
              <button
                type="button"
                className="btn-monolith-ghost"
                onClick={() => textareaRef.current?.focus()}
              >
                <span>+ Build New Page</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-monolith-ghost"
                onClick={handleUseExample}
              >
                <Icons.Play />
                <span>Try an ad hook</span>
              </button>

              <button
                type="button"
                className="btn-monolith-primary"
                onClick={() => textareaRef.current?.focus()}
              >
                <span>Generate presell page</span>
                <Icons.ArrowRight />
              </button>
            </>
          )}
        </div>

        {/* Interactive Prompt Box Card */}
        <form className="monolith-prompt-card" onSubmit={handleSubmit} id="prompt-form">
          <div className="prompt-header-bar">
            <span className="prompt-tag">Ad Hook / Creative Angle</span>
            <button
              type="button"
              className="prompt-cycle-btn"
              onClick={cyclePlaceholder}
              disabled={isLoading}
            >
              <Icons.Refresh />
              <span>Shuffle ad angle</span>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            id="main-prompt"
            className="monolith-prompt-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={EXAMPLE_PROMPTS[placeholderIndex]}
            rows={3}
            disabled={isLoading}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e)
              }
            }}
          />

          <div className="prompt-footer-bar">
            <span className="prompt-shortcut-hint">Press ⌘ + Enter to build</span>
            <button
              type="submit"
              id="generate-btn"
              className={`btn-monolith-primary btn-generate ${isLoading ? 'btn--loading' : ''}`}
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? (
                <>
                  <span className="monolith-spinner" />
                  Building page…
                </>
              ) : (
                <>
                  <span>Generate my page</span>
                  <Icons.ArrowRight />
                </>
              )}
            </button>
          </div>

          {error && <p className="prompt-error-message" role="alert">{error}</p>}
        </form>

        {/* Social Proof / Trusted By (Zero Emojis, Clean Tech Logos) */}
        <div className="monolith-trust-section">
          <p className="trust-heading">Trusted by 2,000+ founders and marketers</p>
          <div className="trust-logos">
            <div className="trust-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              <span>FeatherDev</span>
            </div>
            <div className="trust-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>Boltshift</span>
            </div>
            <div className="trust-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
              <span>GlobalBank</span>
            </div>
            <div className="trust-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              <span>Lightbox</span>
            </div>
            <div className="trust-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
              <span>Spherule</span>
            </div>
          </div>
        </div>

        {/* Dashboard Mockup Showcase (Zero Emojis, Real Icons, Monochromatic) */}
        <div className="monolith-showcase-container" id="preview">
          <div className="monolith-showcase-card">
            {/* Mockup Sidebar */}
            <div className="mockup-sidebar">
              <div className="mockup-logo">
                <FuturisticBLogo size={20} />
                <span className="mockup-logo-title">Blynkpage</span>
              </div>
              <div className="mockup-nav-group">
                <div className="mockup-nav-item active">
                  <Icons.Grid />
                  <span>Dashboard</span>
                </div>
                <div className="mockup-nav-item">
                  <Icons.Trending />
                  <span>Conversion Report</span>
                </div>
                <div className="mockup-nav-item">
                  <Icons.ShoppingBag />
                  <span>Products</span>
                </div>
                <div className="mockup-nav-item">
                  <Icons.MessageSquare />
                  <span>Chat Assistant</span>
                </div>
                <div className="mockup-nav-item">
                  <Icons.Settings />
                  <span>Settings</span>
                </div>
              </div>
            </div>

            {/* Mockup Main View */}
            <div className="mockup-main">
              <div className="mockup-topbar">
                <div className="mockup-search">
                  <Icons.Search />
                  <span>Search projects…</span>
                </div>
                <div className="mockup-profile">
                  <span className="mockup-bell"><Icons.Bell /></span>
                  <span className="mockup-avatar">JD</span>
                </div>
              </div>

              <div className="mockup-widgets">
                <div className="mockup-widget">
                  <div className="widget-label">Top Performance</div>
                  <div className="widget-metric">8.4%</div>
                  <div className="widget-sub">Average Conversion Rate</div>
                  <div className="widget-bars">
                    <div className="bar b1" />
                    <div className="bar b2" />
                    <div className="bar b3" />
                    <div className="bar b4" />
                    <div className="bar b5" />
                  </div>
                </div>

                <div className="mockup-widget">
                  <div className="widget-label">Live Visitor Insights</div>
                  <div className="widget-metric">14,280</div>
                  <div className="widget-sub">+24% from direct traffic</div>
                  <div className="widget-wave">
                    <svg viewBox="0 0 100 25" className="wave-svg">
                      <path d="M0,15 Q25,2 50,15 T100,8" fill="none" stroke="#ffffff" strokeWidth="1.8" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Code + Live Preview Split in Mockup */}
              <div className="mockup-preview-window">
                <div className="mockup-window-header">
                  <div className="window-dots">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                  <span className="window-title">streetwear-drop-01.html · Live Preview</span>
                  <span className="window-badge">Live</span>
                </div>
                <div className="mockup-window-body">
                  <div className="mock-site-hero">
                    <span className="mock-site-tag">LIMITED EDITION 004</span>
                    <h4>Heavyweight Loopback French Terry Hoodie</h4>
                    <p>450 GSM Portuguese combed cotton. Cut, sewn, and numbered by hand.</p>
                    <div className="mock-site-cta">Shop Collection — $120</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 3-Step Simple Feature Cards */}
      <section className="monolith-features" id="features">
        <div className="features-container">
          <div className="section-tag">How it works</div>
          <h2 className="section-title">Three steps to 1:1 ad congruence.</h2>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-num">01</div>
              <h3 className="feature-heading">Paste Ad Hook</h3>
              <p className="feature-text">
                Input your winning Meta or TikTok ad angle, video hook, or creative script.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-num">02</div>
              <h3 className="feature-heading">1:1 Message Scent</h3>
              <p className="feature-text">
                AI matches the ad promise above the fold, adds 'Us vs Them' comparison tables, and crushes buyer objections.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-num">03</div>
              <h3 className="feature-heading">Dynamic UTM Scale</h3>
              <p className="feature-text">
                Scale 20+ ad creative variants against 1 page using built-in dynamic URL parameters and mobile sticky buy bars.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="monolith-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-logo-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FuturisticBLogo size={20} />
              <span className="footer-logo">Blynkpage</span>
            </div>
            <p>AI landing pages built for real conversions.</p>
          </div>
          <div className="footer-links">
            <a href="#features">Features</a>
            <a href="#preview">Showcase</a>
            <a href="#pricing">Pricing</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Blynkpage. All rights reserved.</p>
        </div>
      </footer>

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        defaultTab={authTab}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => {
          if (pendingPrompt) {
            const nextPrompt = pendingPrompt
            setPendingPrompt('')
            executeProjectCreation(nextPrompt)
          }
        }}
      />
    </div>
  )
}
