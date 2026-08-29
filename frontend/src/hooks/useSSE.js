/**
 * useSSE — Custom React hook for consuming Server-Sent Events from
 * the PromptLaunch generation endpoint.
 *
 * Returns:
 *   code          — accumulated HTML string (grows as tokens arrive)
 *   isStreaming   — true while the SSE connection is open
 *   isDone        — true after [DONE] signal received
 *   error         — error string if connection failed
 *   statusMessage — server-sent status update string (e.g. "[STATUS] ...")
 *   startStream   — call with projectId to begin or restart streaming
 *   stopStream    — manually close the connection
 */
import { useState, useRef, useCallback } from 'react'

export function useSSE() {
  const [code, setCode] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [error, setError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const sourceRef = useRef(null)
  const codeRef = useRef('')

  const stopStream = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
    }
    setIsStreaming(false)
  }, [])

  const startStream = useCallback((projectId) => {
    // Close any existing connection
    stopStream()

    // Reset state for a fresh stream
    codeRef.current = ''
    setCode('')
    setIsDone(false)
    setError(null)
    setStatusMessage('Connecting to Gemini 3.6 Flash pipeline…')
    setIsStreaming(true)

    const url = `/api/projects/${projectId}/stream/`
    const es = new EventSource(url)
    sourceRef.current = es

    es.onmessage = (e) => {
      const raw = e.data

      if (raw === '[DONE]') {
        setIsDone(true)
        setIsStreaming(false)
        setStatusMessage('')
        es.close()
        sourceRef.current = null
        return
      }

      if (raw.startsWith('[ERROR]')) {
        setError(raw.replace('[ERROR] ', ''))
        setIsStreaming(false)
        setStatusMessage('')
        es.close()
        sourceRef.current = null
        return
      }

      if (raw.startsWith('[STATUS]')) {
        setStatusMessage(raw.replace('[STATUS] ', ''))
        return
      }

      // Unescape the newlines encoded on the server side
      const chunk = raw.replace(/\\n/g, '\n')
      codeRef.current = (codeRef.current || '') + chunk
      setCode(codeRef.current)
    }

    es.onerror = () => {
      setIsStreaming(false)
      setStatusMessage('')
      // If code was already received or closing, do not show false error banner
      if (codeRef.current && codeRef.current.length > 50) {
        if (es.readyState !== EventSource.CLOSED) {
          es.close()
        }
        sourceRef.current = null
        return
      }
      if (es.readyState === EventSource.CLOSED) {
        sourceRef.current = null
        return
      }
      setError('Connection interrupted. Please refresh or retry refinement.')
      es.close()
      sourceRef.current = null
    }
  }, [stopStream])

  return { code, isStreaming, isDone, error, statusMessage, startStream, stopStream }
}
