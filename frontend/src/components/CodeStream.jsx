/**
 * CodeStream — live-scrolling monospace display of the streaming HTML.
 * Uses a simple pre block with auto-scroll; no external syntax library
 * needed at this stage (syntax highlighting is a v2 polish item).
 */
import { useEffect, useRef } from 'react'
import './CodeStream.css'

export default function CodeStream({ code, isStreaming }) {
  const preRef = useRef(null)
  const isAtBottomRef = useRef(true)

  // Track whether the user has manually scrolled up
  const handleScroll = () => {
    const el = preRef.current
    if (!el) return
    const threshold = 40
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }

  // Auto-scroll when new tokens arrive — only if user hasn't scrolled up
  useEffect(() => {
    if (isAtBottomRef.current && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [code])

  if (!code && !isStreaming) {
    return (
      <div className="code-stream-empty">
        <div className="code-stream-empty-inner">
          <div className="code-stream-placeholder-bars">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="placeholder-bar"
                style={{ width: `${30 + Math.random() * 60}%`, animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </div>
          <p>Your page code will stream here…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="code-stream-wrapper">
      <div className="code-stream-toolbar">
        <span className="code-stream-label">HTML</span>
        {isStreaming && (
          <span className="code-stream-status">
            <span className="tab-streaming-dot" style={{ display: 'inline-block' }} />
            Streaming…
          </span>
        )}
        {!isStreaming && code && (
          <span className="code-stream-line-count">
            {code.split('\n').length} lines
          </span>
        )}
      </div>
      <pre
        ref={preRef}
        className="code-stream-pre"
        onScroll={handleScroll}
        aria-label="Generated HTML code"
      >
        <code>{code}</code>
        {isStreaming && <span className="streaming-cursor" aria-hidden="true" />}
      </pre>
    </div>
  )
}
