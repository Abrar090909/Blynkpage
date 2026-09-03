/**
 * ChatPanel — Conversation history + precision refinement composer.
 * Redesigned with sleek SVG icons (zero cheap emojis), integrated in-card
 * send button, auto-expanding composer, and Apple/Linear-grade glassmorphism.
 */
import { useState, useRef, useEffect } from 'react'
import VersionHistoryDropdown from './VersionHistoryDropdown'
import './ChatPanel.css'

// Precision Micro SVG Icons
const Icons = {
  Zap: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Flame: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z" />
    </svg>
  ),
  Scissors: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  ),
  Smartphone: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  Sparkles: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
  ShieldCheck: ({ size = 13 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  ArrowUp: ({ size = 15 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  ),
  User: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Bot: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8.01" y2="16" />
      <line x1="16" y1="16" x2="16.01" y2="16" />
    </svg>
  ),
  X: ({ size = 11 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
}

const QUICK_ACTIONS = [
  { id: 'punchier', icon: Icons.Zap, label: 'Punchier', value: 'Make the headline and opening hook much more punchy and direct — stronger verb, more urgency.' },
  { id: 'urgency', icon: Icons.Flame, label: 'Add urgency', value: 'Add urgency signals throughout: limited time drop offer, scarcity language, and countdown badges.' },
  { id: 'shorten', icon: Icons.Scissors, label: 'Shorten CTA', value: 'Shorten and simplify the main call-to-action button text to 4 words or fewer with high contrast.' },
  { id: 'mobile', icon: Icons.Smartphone, label: 'Mobile fit', value: 'Optimize the layout for mobile: increase readability, ensure sticky buy bar is thumb-reachable.' },
  { id: 'angle', icon: Icons.Sparkles, label: 'New angle', value: 'Generate a completely different creative angle for the same product — fresh hook, different vibe.' },
  { id: 'proof', icon: Icons.ShieldCheck, label: 'More proof', value: 'Add authentic social proof: buyer drip reviews, verified badges, and craftsmanship details.' },
]

export default function ChatPanel({
  messages,
  isStreaming,
  onSendRefinement,
  projectStatus,
  projectId,
  onVersionRestored,
}) {
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [activeQuickAction, setActiveQuickAction] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  const handleSend = async (e, overrideText) => {
    e?.preventDefault()
    const trimmed = (overrideText || input).trim()
    if (!trimmed || isStreaming || isSending) return

    setIsSending(true)
    if (!overrideText) setInput('')
    setActiveQuickAction(null)
    try {
      await onSendRefinement(trimmed)
    } finally {
      setIsSending(false)
    }
  }

  const handleQuickAction = (action) => {
    if (isStreaming || isSending) return
    setActiveQuickAction(action)
    setInput(action.value)
    inputRef.current?.focus()
  }

  const canSend = input.trim().length > 0 && !isStreaming && !isSending
  const isGenerating = isStreaming || projectStatus === 'generating'

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-icon-box">
            <Icons.Sparkles size={14} />
          </span>
          <div>
            <span className="chat-header-title">Design Assistant</span>
            <span className="chat-header-status-dot" title="Ready to refine" />
          </div>
        </div>
        <div className="chat-header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {projectId && (
            <VersionHistoryDropdown
              projectId={projectId}
              isStreaming={isStreaming}
              onVersionRestored={onVersionRestored}
            />
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="chat-messages">
        {(messages || []).map((msg) => {
          const isUser = msg.role === 'user'
          return (
            <div
              key={msg.id}
              className={`chat-message chat-message--${msg.role}`}
            >
              <div className="chat-message-header">
                <span className="chat-message-avatar">
                  {isUser ? <Icons.User size={11} /> : <Icons.Bot size={11} />}
                </span>
                <span className="chat-message-role-label">
                  {isUser ? 'You' : 'AI Architect'}
                </span>
              </div>
              <div className="chat-message-content">{msg.content}</div>
            </div>
          )
        })}

        {/* Thinking/generating state */}
        {isGenerating && (
          <div className="chat-message chat-message--assistant">
            <div className="chat-message-header">
              <span className="chat-message-avatar">
                <Icons.Bot size={11} />
              </span>
              <span className="chat-message-role-label">AI Architect</span>
            </div>
            <div className="chat-generating-state">
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
              <span className="chat-generating-label">
                {projectStatus === 'enhancing' ? 'Reading ad angle & aesthetics…' : 'Coding custom page…'}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick-action chips with SVG icons (no cheap emojis) */}
      {!isGenerating && (
        <div className="chat-quick-actions-bar" aria-label="Quick refinement actions">
          {QUICK_ACTIONS.map((action) => {
            const IconComponent = action.icon
            const isActive = activeQuickAction?.id === action.id
            return (
              <button
                key={action.id}
                type="button"
                className={`chat-quick-chip ${isActive ? 'chat-quick-chip--active' : ''}`}
                onClick={() => handleQuickAction(action)}
                disabled={isGenerating || isSending}
                title={action.value}
              >
                <IconComponent size={12} />
                <span>{action.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Modern Integrated Message Box */}
      <div className="chat-composer-section">
        {activeQuickAction && (
          <div className="chat-active-chip-pill">
            <span className="chat-active-dot" />
            <span className="chat-active-text">
              Selected: <strong>{activeQuickAction.label}</strong>
            </span>
            <button
              type="button"
              className="chat-active-clear"
              onClick={() => { setActiveQuickAction(null); setInput('') }}
              aria-label="Clear active action"
            >
              <Icons.X size={10} />
            </button>
          </div>
        )}

        {/* Integrated Composer Box (Send button sits directly inside the container) */}
        <form className="chat-composer-card" onSubmit={handleSend}>
          <textarea
            ref={inputRef}
            className="chat-composer-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI to refine copy, colors, layout, add stickers…"
            rows={2}
            disabled={isGenerating || isSending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />

          <div className="chat-composer-footer">
            <span className="chat-composer-shortcut">
              <kbd>↵</kbd> send · <kbd>⇧↵</kbd> new line
            </span>

            <button
              type="submit"
              id="chat-send-btn"
              className={`chat-send-btn-direct ${canSend ? 'chat-send-btn-direct--active' : ''}`}
              disabled={!canSend}
              title={canSend ? 'Send refinement (Enter)' : 'Type a message to refine'}
              aria-label="Send refinement message"
            >
              {isSending ? (
                <span className="apple-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              ) : (
                <Icons.ArrowUp size={15} />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


