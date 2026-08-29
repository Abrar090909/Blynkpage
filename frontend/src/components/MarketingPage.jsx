import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './MarketingPage.css'

const EXAMPLE_PROMPTS = [
  'A subscription box for cold-brew coffee beans, ships every 2 weeks, $24/mo, for busy professionals.',
  'Freelance logo design service, 48-hour turnaround, flat rate $299, targeting early-stage startups.',
  'Online yoga studio for new moms — live classes + on-demand, $39/mo, childcare-friendly scheduling.',
  'B2B SaaS tool for HR teams to automate employee onboarding, starting at $149/seat/mo.',
]

export default function MarketingPage() {
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const navigate = useNavigate()
  const textareaRef = useRef(null)

  const cyclePlaceholder = () => {
    setPlaceholderIndex(i => (i + 1) % EXAMPLE_PROMPTS.length)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = prompt.trim()
    if (!trimmed) {
      textareaRef.current?.focus()
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const res = await fetch('/api/projects/', {
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
    <div className="marketing-root">
      {/* Launching Loading Modal */}
      {isLoading && (
        <div className="launch-overlay" role="dialog" aria-modal="true" aria-label="Building your page">
          <div className="launch-modal">
            <div className="apple-spinner-wrapper">
              <div className="apple-spinner-ring" />
            </div>
            <div className="launch-content">
              <h3>Initializing PromptLaunch AI</h3>
              <p className="launch-sub">Analyzing brief & architecting high-converting layout…</p>
              <div className="apple-progress-track" style={{ width: '100%', marginTop: '12px' }}>
                <div className="apple-progress-indicator" />
              </div>
              <div className="launch-tips">
                <span>Real-time token streaming starts in seconds</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ambient background orbs */}
      <div className="marketing-bg" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="grid-lines" />
      </div>

      {/* Nav */}
      <nav className="marketing-nav">
        <a href="/" className="marketing-logo">
          <span className="logo-mark">PL</span>
          <span className="logo-text">PromptLaunch</span>
        </a>
        <div className="nav-links">
          <a href="#how-it-works" className="nav-link">How it works</a>
          <a href="#why" className="nav-link">Why it converts</a>
        </div>
      </nav>

      {/* Hero */}
      <main className="marketing-hero">
        <div className="hero-eyebrow">
          <span className="eyebrow-dot" />
          No templates. No drag-and-drop. One prompt.
        </div>

        <h1 className="hero-headline">
          Your product, described.<br />
          <span className="text-gradient">A landing page that sells,</span><br />
          built in under a minute.
        </h1>

        <p className="hero-subheadline">
          Type what you're selling. Watch a conversion-optimised landing page stream 
          into existence, token by token — then push it straight to a Meta ad campaign 
          in one click.
        </p>

        {/* Prompt form */}
        <form className="prompt-form" onSubmit={handleSubmit} id="prompt-form">
          <div className={`prompt-box ${isLoading ? 'prompt-box--loading' : ''}`}>
            <textarea
              ref={textareaRef}
              id="main-prompt"
              className="prompt-textarea"
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
            <div className="prompt-footer">
              <button
                type="button"
                className="example-btn"
                onClick={cyclePlaceholder}
                disabled={isLoading}
              >
                Try an example ↻
              </button>
              <button
                type="submit"
                id="generate-btn"
                className={`btn btn-primary btn-lg generate-btn ${isLoading ? 'generate-btn--loading' : ''}`}
                disabled={isLoading || !prompt.trim()}
              >
                {isLoading ? (
                  <>
                    <span className="btn-spinner" />
                    Building your page…
                  </>
                ) : (
                  <>
                    Generate my page
                    <span className="btn-arrow">→</span>
                  </>
                )}
              </button>
            </div>
          </div>
          {error && <p className="prompt-error" role="alert">{error}</p>}
          <p className="prompt-hint">⌘ + Enter to generate · No account required</p>
        </form>
      </main>

      {/* Social proof strip */}
      <section className="proof-strip" aria-label="How it works">
        <div className="proof-items">
          <div className="proof-item">
            <span className="proof-number">01</span>
            <div className="proof-content">
              <strong>Describe your product</strong>
              <span>One sentence. That's the entire input.</span>
            </div>
          </div>
          <div className="proof-divider" aria-hidden="true">→</div>
          <div className="proof-item">
            <span className="proof-number">02</span>
            <div className="proof-content">
              <strong>Watch it build, live</strong>
              <span>HTML streams token-by-token. No spinner.</span>
            </div>
          </div>
          <div className="proof-divider" aria-hidden="true">→</div>
          <div className="proof-item">
            <span className="proof-number">03</span>
            <div className="proof-content">
              <strong>Publish &amp; run ads</strong>
              <span>One click to live URL. One click to Meta.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why section */}
      <section className="why-section" id="why">
        <div className="why-inner">
          <div className="why-text">
            <h2>Built to convert cold traffic.<br />Not to look like a template.</h2>
            <p>
              Every AI landing page generator produces the same output: purple gradients, 
              glassmorphism cards, emoji icons, and copy that says "Revolutionize your workflow." 
              None of it converts.
            </p>
            <p>
              PromptLaunch uses a direct-response copywriting framework baked into the AI prompt itself — 
              the same structure used in high-converting Meta ad landing pages. Hook, proof, offer, 
              objection, social signal, urgency, CTA. In that order, every time.
            </p>
          </div>
          <div className="why-visual">
            <div className="comparison-card bad-card">
              <div className="card-label card-label--bad">Generic AI output</div>
              <div className="mock-line mock-line--wide mock-line--gradient" />
              <div className="mock-line mock-line--medium" />
              <div className="mock-badges">
                <span className="mock-badge">🚀</span>
                <span className="mock-badge">💡</span>
                <span className="mock-badge">📈</span>
              </div>
              <div className="mock-line mock-line--full" />
              <div className="mock-line mock-line--full" />
              <div className="mock-btn mock-btn--generic">Get Started</div>
            </div>
            <div className="comparison-card good-card">
              <div className="card-label card-label--good">PromptLaunch output</div>
              <div className="mock-headline">Ship coffee to your door<br />before you need it.</div>
              <div className="mock-proof">2,847 subscribers · Ships Thursday</div>
              <div className="mock-line mock-line--full" />
              <div className="mock-line mock-line--medium" />
              <div className="mock-btn mock-btn--good">Start my first box — $24/mo</div>
            </div>
          </div>
        </div>
      </section>

      <footer className="marketing-footer">
        <span>© 2026 PromptLaunch</span>
        <span className="footer-separator">·</span>
        <span>Built for results, not for demos.</span>
      </footer>
    </div>
  )
}
