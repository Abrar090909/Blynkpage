import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE } from '../config'
import './MarketingPage.css'

const EXAMPLE_PROMPTS = [
  'A subscription box for cold-brew coffee beans, ships every 2 weeks, $24/mo, for busy professionals.',
  'Freelance logo design service, 48-hour turnaround, flat rate $299, targeting early-stage startups.',
  'Online yoga studio for new moms — live classes + on-demand, $39/mo, childcare-friendly scheduling.',
  'B2B tool for HR teams to automate employee onboarding, starting at $149/seat/mo.',
  'Heavyweight streetwear hoodie drop, 450 GSM organic cotton, limited to 300 pieces worldwide.',
]

export default function MarketingPage() {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [demoOpen, setDemoOpen] = useState(false)
  const navigate = useNavigate()
  const textareaRef = useRef(null)

  const cyclePlaceholder = () => {
    setPlaceholderIndex(i => (i + 1) % EXAMPLE_PROMPTS.length)
  }

  const handleUseExample = () => {
    setPrompt(EXAMPLE_PROMPTS[placeholderIndex])
    textareaRef.current?.focus()
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed) {
      textareaRef.current?.focus()
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/api/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
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

  return (
    <div className="vetra-root">
      {/* Background Starfield & Glowing Horizon */}
      <div className="vetra-bg" aria-hidden="true">
        <div className="stars-layer" />
        <div className="horizon-glow-back" />
        <div className="horizon-curve" />
      </div>

      {/* Top Navigation Bar */}
      <header className="vetra-nav-wrapper">
        <nav className="vetra-nav">
          <a href="/" className="vetra-logo">
            <span className="vetra-logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6L14 6L12 10L2 10L4 6Z" fill="#ff5e28" />
                <path d="M8 12L18 12L16 16L6 16L8 12Z" fill="#ff7a45" />
                <path d="M12 18L22 18L20 22L10 22L12 18Z" fill="#ffa07a" />
              </svg>
            </span>
            <span className="vetra-logo-text">Blynkpage</span>
          </a>

          <div className="vetra-menu">
            <a href="#features" className="vetra-menu-link">Features</a>
            <a href="#how-it-works" className="vetra-menu-link">How it works</a>
            <a href="#preview" className="vetra-menu-link">Showcase</a>
            <a href="#pricing" className="vetra-menu-link">Pricing</a>
          </div>

          <div className="vetra-nav-actions">
            <button
              type="button"
              className="btn-vetra-primary btn-vetra-nav"
              onClick={() => {
                textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                textareaRef.current?.focus()
              }}
            >
              Get started
            </button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="vetra-hero">
        {/* Announcement Capsule */}
        <div className="vetra-badge-capsule">
          <span className="badge-text">New version is out! Try Gemini 3.5</span>
          <span className="badge-arrow">→</span>
        </div>

        {/* Headline: STRICTLY 2 LINES ONLY */}
        <h1 className="vetra-headline">
          Build High-Converting<br />
          Landing Pages With AI
        </h1>

        {/* Short, simple, easy to understand subtitle */}
        <p className="vetra-subheadline">
          Describe what you sell in one sentence. Get a complete, responsive
          landing page with high-converting copy in seconds.
        </p>

        {/* Quick CTA Actions */}
        <div className="vetra-hero-actions">
          <button
            type="button"
            className="btn-vetra-ghost"
            onClick={handleUseExample}
          >
            <span className="play-icon">▶</span>
            <span>Try an example</span>
          </button>

          <button
            type="button"
            className="btn-vetra-primary"
            onClick={() => textareaRef.current?.focus()}
          >
            Get started for free
          </button>
        </div>

        {/* Interactive Prompt Box Card */}
        <form className="vetra-prompt-card" onSubmit={handleSubmit} id="prompt-form">
          <div className="prompt-header-bar">
            <span className="prompt-tag">AI Prompt</span>
            <button
              type="button"
              className="prompt-cycle-btn"
              onClick={cyclePlaceholder}
              disabled={isLoading}
            >
              Shuffle example ↻
            </button>
          </div>

          <textarea
            ref={textareaRef}
            id="main-prompt"
            className="vetra-prompt-textarea"
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
              className={`btn-vetra-primary btn-generate ${isLoading ? 'btn--loading' : ''}`}
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? (
                <>
                  <span className="vetra-spinner" />
                  Building page…
                </>
              ) : (
                <>
                  Generate my page
                  <span className="btn-arrow-icon">→</span>
                </>
              )}
            </button>
          </div>

          {error && <p className="prompt-error-message" role="alert">{error}</p>}
        </form>

        {/* Social Proof / Trusted By */}
        <div className="vetra-trust-section">
          <p className="trust-heading">Trusted by 2,000+ founders and marketers</p>
          <div className="trust-logos">
            <div className="trust-item">
              <span className="trust-logo-sym">✦</span>
              <span>FeatherDev</span>
            </div>
            <div className="trust-item">
              <span className="trust-logo-sym">⚡</span>
              <span>Boltshift</span>
            </div>
            <div className="trust-item">
              <span className="trust-logo-sym">◈</span>
              <span>GlobalBank</span>
            </div>
            <div className="trust-item">
              <span className="trust-logo-sym">❖</span>
              <span>Lightbox</span>
            </div>
            <div className="trust-item">
              <span className="trust-logo-sym">◉</span>
              <span>Spherule</span>
            </div>
          </div>
        </div>

        {/* Dashboard Mockup Showcase (Vetra Style) */}
        <div className="vetra-showcase-container" id="preview">
          <div className="vetra-showcase-card">
            {/* Mockup Sidebar */}
            <div className="mockup-sidebar">
              <div className="mockup-logo">
                <span className="mockup-logo-mark">V</span>
                <span className="mockup-logo-title">Blynkpage</span>
              </div>
              <div className="mockup-nav-group">
                <div className="mockup-nav-item active">⊞ Dashboard</div>
                <div className="mockup-nav-item">📈 Conversion Report</div>
                <div className="mockup-nav-item">🛍 Products</div>
                <div className="mockup-nav-item">💬 Chat Assistant</div>
                <div className="mockup-nav-item">⚙ Settings</div>
              </div>
            </div>

            {/* Mockup Main View */}
            <div className="mockup-main">
              <div className="mockup-topbar">
                <div className="mockup-search">🔍 Search projects…</div>
                <div className="mockup-profile">
                  <span className="mockup-bell">🔔</span>
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
                  <div className="widget-sub">+24% from direct ads</div>
                  <div className="widget-wave">
                    <svg viewBox="0 0 100 25" className="wave-svg">
                      <path d="M0,15 Q25,0 50,15 T100,10" fill="none" stroke="#ff5e28" strokeWidth="2.5" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Code + Live Preview Split in Mockup */}
              <div className="mockup-preview-window">
                <div className="mockup-window-header">
                  <div className="window-dots">
                    <span className="dot d-red" />
                    <span className="dot d-yellow" />
                    <span className="dot d-green" />
                  </div>
                  <span className="window-title">streetwear-drop-01.html · Live Preview</span>
                  <span className="window-badge">99.8% Score</span>
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
      <section className="vetra-features" id="features">
        <div className="features-container">
          <div className="section-tag">How it works</div>
          <h2 className="section-title">Three steps to launch.</h2>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-num">01</div>
              <h3 className="feature-heading">Describe</h3>
              <p className="feature-text">
                Type what you're selling in plain English. No complicated templates.
              </p>
            </div>

            <div className="feature-card feature-card--highlight">
              <div className="feature-num">02</div>
              <h3 className="feature-heading">Generate</h3>
              <p className="feature-text">
                AI writes sharp headlines, adds product photography, and writes clean code.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-num">03</div>
              <h3 className="feature-heading">Launch</h3>
              <p className="feature-text">
                Preview your page live, refine details via chat, and publish with one click.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="vetra-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="footer-logo">Blynkpage</span>
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
    </div>
  )
}
