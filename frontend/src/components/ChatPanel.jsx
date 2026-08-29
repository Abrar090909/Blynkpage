/**
 * ChatPanel — left pane showing conversation history and refinement input.
 */
import { useState, useRef, useEffect } from 'react'
import './ChatPanel.css'

export default function ChatPanel({ messages, isStreaming, onSendRefinement, projectStatus }) {
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  const handleSend = async (e) => {
    e?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isStreaming || isSending) return

    setIsSending(true)
    setInput('')
    try {
      await onSendRefinement(trimmed)
    } finally {
      setIsSending(false)
    }
  }

  const canSend = input.trim().length > 0 && !isStreaming && !isSending
  const isGenerating = isStreaming || projectStatus === 'generating'

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <span className="chat-header-title">Conversation</span>
        <span className="chat-message-count">{messages?.length ?? 0} messages</span>
      </div>

      {/* Message list */}
      <div className="chat-messages">
        {(messages || []).map((msg) => (
          <div
            key={msg.id}
            className={`chat-message chat-message--${msg.role}`}
          >
            <div className="chat-message-role">
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>
            <div className="chat-message-content">{msg.content}</div>
          </div>
        ))}

        {/* Typing indicator while streaming */}
        {isGenerating && (
          <div className="chat-message chat-message--assistant">
            <div className="chat-message-role">AI</div>
            <div className="typing-indicator">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Refinement input */}
      <div className="chat-input-area">
        <div className="chat-hint">
          {isGenerating
            ? 'Generating — you can refine after it finishes'
            : 'Describe what to change, e.g. "make the headline punchier"'}
        </div>
        <form className="chat-form" onSubmit={handleSend}>
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Refine your page…"
            rows={2}
            disabled={isGenerating || isSending}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            type="submit"
            id="chat-send-btn"
            className="btn btn-primary btn-sm chat-send-btn"
            disabled={!canSend}
          >
            {isSending ? '…' : 'Send'}
          </button>
        </form>
        <p className="chat-input-hint">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
