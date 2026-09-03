/**
 * AuthContext — JWT security hardened.
 *
 * Security model:
 *   - Access token: stored in React state (memory) ONLY. Never written to localStorage,
 *     sessionStorage, or any JS-accessible storage. This means AI-generated pages
 *     in the preview iframe (even if malicious) cannot steal the token.
 *   - Refresh token: stored exclusively in an httpOnly, Secure, SameSite=Strict cookie
 *     set by the backend. JavaScript never sees it. The cookie is scoped to /api/auth/
 *     so it is only sent to auth endpoints.
 *   - Token refresh: calls POST /api/auth/refresh/ with no body — the browser
 *     automatically sends the httpOnly cookie; the backend returns a new access token.
 *   - Logout: calls POST /api/auth/logout/ which clears the cookie server-side.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE } from '../config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Access token in memory ONLY — no localStorage
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const refreshPromiseRef = useRef(null) // Deduplicate concurrent refresh calls

  // Attempt to refresh access token using the httpOnly cookie
  const refreshAccessToken = useCallback(async () => {
    // Deduplicate: if a refresh is already in-flight, return the same promise
    if (refreshPromiseRef.current) return refreshPromiseRef.current

    refreshPromiseRef.current = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
          method: 'POST',
          credentials: 'include', // Send the httpOnly cookie
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) {
          setToken(null)
          setUser(null)
          return null
        }
        const data = await res.json()
        if (data.access) {
          setToken(data.access)
          return data.access
        }
        setToken(null)
        setUser(null)
        return null
      } catch {
        return null
      } finally {
        refreshPromiseRef.current = null
      }
    })()

    return refreshPromiseRef.current
  }, [])

  // Authenticated fetch: attaches Bearer header, retries once after 401 with token refresh
  const authFetch = useCallback(async (url, options = {}) => {
    const currentToken = token
    const headers = {
      ...options.headers,
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    }

    let response = await fetch(url, { ...options, headers, credentials: 'include' })

    if (response.status === 401) {
      const newToken = await refreshAccessToken()
      if (newToken) {
        const retryHeaders = { ...options.headers, Authorization: `Bearer ${newToken}` }
        response = await fetch(url, { ...options, headers: retryHeaders, credentials: 'include' })
      }
    }

    return response
  }, [token, refreshAccessToken])

  // On mount: try to silently restore session via refresh cookie
  const loadUser = useCallback(async () => {
    try {
      // First try to get a fresh access token via the httpOnly cookie
      const newToken = await refreshAccessToken()
      if (!newToken) {
        setIsLoading(false)
        return
      }

      const res = await fetch(`${API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${newToken}` },
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
      } else {
        setToken(null)
        setUser(null)
      }
    } catch {
      // Network error — don't log out, let the user retry
    } finally {
      setIsLoading(false)
    }
  }, [refreshAccessToken])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  // Logout: clears httpOnly cookie server-side + wipes in-memory token
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout/`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Best-effort — still clear local state regardless
    }
    setToken(null)
    setUser(null)
  }, [])

  // Login: returns access token in response body, refresh token is set as cookie by backend
  const login = async (email, password) => {
    let res
    try {
      res = await fetch(`${API_BASE}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Receive and store the httpOnly cookie
        body: JSON.stringify({ email, password }),
      })
    } catch {
      throw new Error('Unable to reach server. Please ensure the backend server is running.')
    }

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const errorMsg =
        data.non_field_errors?.[0] ||
        data.detail ||
        data.error ||
        (res.status === 502 || res.status === 504
          ? 'Backend server is offline or unreachable'
          : `Login failed (${res.status})`)
      throw new Error(errorMsg)
    }

    if (!data.tokens?.access) throw new Error('Invalid authentication response from server.')
    setToken(data.tokens.access) // Store in memory only
    setUser(data.user)
    return data.user
  }

  // Register: same pattern as login
  const register = async (email, password, name = '') => {
    let res
    try {
      res = await fetch(`${API_BASE}/api/auth/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Receive the httpOnly refresh cookie
        body: JSON.stringify({ email, password, name }),
      })
    } catch {
      throw new Error('Unable to reach server. Please ensure the backend server is running.')
    }

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const errorMsg =
        data.email?.[0] ||
        data.password?.[0] ||
        data.non_field_errors?.[0] ||
        data.detail ||
        (res.status === 502 || res.status === 504
          ? 'Backend server is offline or unreachable'
          : `Registration failed (${res.status})`)
      throw new Error(errorMsg)
    }

    if (!data.tokens?.access) throw new Error('Invalid registration response from server.')
    setToken(data.tokens.access) // Store in memory only
    setUser(data.user)
    return data.user
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        authFetch,
        loadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

