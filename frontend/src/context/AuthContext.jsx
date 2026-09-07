/**
 * AuthContext — Dual-layer JWT Security & Resilient Cross-Origin Auth.
 *
 * Security & Cross-Domain Architecture:
 *   - Access Token: Stored in memory + localStorage fallback for cross-domain SPA (Vercel -> Render).
 *   - Refresh Token: Set as httpOnly cookie by backend AND stored in localStorage as cross-origin fallback.
 *     Modern browsers (Chrome, Safari ITP) block 3rd-party cross-site cookies by default.
 *     Supporting both guarantees seamless auth whether cookies are allowed or blocked.
 *   - TokenRef: Kept synchronously in sync so authFetch never suffers from stale React closures.
 *   - Token Refresh: Calls POST /api/auth/refresh/ sending both credentials (cookie) and JSON body (refresh token).
 *   - Cold-Start Resilient: fetchWithRetry handles Render free-tier spin-up delays gracefully.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE } from '../config'

const AuthContext = createContext(null)

const getStoredToken = () => {
  try {
    return localStorage.getItem('blynk_access_token') || localStorage.getItem('access_token') || null
  } catch {
    return null
  }
}

const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('blynk_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const getStoredRefreshToken = () => {
  try {
    return localStorage.getItem('blynk_refresh_token') || null
  } catch {
    return null
  }
}

/**
 * fetchWithRetry — handles Render free-tier cold starts.
 */
async function fetchWithRetry(url, options = {}, maxAttempts = 3, delayMs = 5000) {
  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 75000)
      try {
        const res = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeoutId)
        return res
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken)
  const [user, setUser] = useState(getStoredUser)
  const [isLoading, setIsLoading] = useState(!getStoredToken())
  const tokenRef = useRef(getStoredToken())
  const refreshPromiseRef = useRef(null)

  // Sync token state into ref
  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const persistAuth = (accessToken, refreshToken, userData) => {
    try {
      if (accessToken) {
        localStorage.setItem('blynk_access_token', accessToken)
        localStorage.setItem('access_token', accessToken)
      }
      if (refreshToken) {
        localStorage.setItem('blynk_refresh_token', refreshToken)
      }
      if (userData) {
        localStorage.setItem('blynk_user', JSON.stringify(userData))
      }
    } catch {}

    if (accessToken) {
      tokenRef.current = accessToken
      setToken(accessToken)
    }
    if (userData) {
      setUser(userData)
    }
  }

  const clearAuth = () => {
    try {
      localStorage.removeItem('blynk_access_token')
      localStorage.removeItem('access_token')
      localStorage.removeItem('blynk_refresh_token')
      localStorage.removeItem('blynk_user')
    } catch {}
    tokenRef.current = null
    setToken(null)
    setUser(null)
  }

  // Attempt to refresh access token using both cookie and stored refresh token
  const refreshAccessToken = useCallback(async () => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current

    refreshPromiseRef.current = (async () => {
      try {
        const storedRefresh = getStoredRefreshToken()
        const res = await fetch(`${API_BASE}/api/auth/refresh/`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storedRefresh ? { refresh: storedRefresh } : {}),
        })
        if (!res.ok) {
          clearAuth()
          return null
        }
        const data = await res.json()
        if (data.access) {
          persistAuth(data.access, data.refresh, null)
          return data.access
        }
        clearAuth()
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
    const currentToken = tokenRef.current || token || getStoredToken()
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

  // On mount: restore or verify user session
  const loadUser = useCallback(async () => {
    try {
      const activeToken = tokenRef.current || getStoredToken()
      if (activeToken) {
        const res = await fetch(`${API_BASE}/api/auth/me/`, {
          headers: { Authorization: `Bearer ${activeToken}` },
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          persistAuth(activeToken, null, data)
          setIsLoading(false)
          return
        }
      }

      // If token expired or invalid, try refresh
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
        persistAuth(newToken, null, data)
      } else {
        clearAuth()
      }
    } catch {
      // Network error — keep existing stored state
    } finally {
      setIsLoading(false)
    }
  }, [refreshAccessToken])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  // Logout: clears httpOnly cookie server-side + wipes local storage & in-memory token
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout/`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {}
    clearAuth()
  }, [])

  // Login: returns access + refresh tokens, persists them
  const login = async (email, password) => {
    let res
    try {
      res = await fetchWithRetry(`${API_BASE}/api/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
    } catch {
      throw new Error('Server is starting up — please try again in a moment.')
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

    const access = data.tokens?.access
    const refresh = data.tokens?.refresh
    if (!access) throw new Error('Invalid authentication response from server.')

    persistAuth(access, refresh, data.user)
    return data.user
  }

  // Register: same pattern as login
  const register = async (email, password, name = '') => {
    let res
    try {
      res = await fetchWithRetry(`${API_BASE}/api/auth/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name }),
      })
    } catch {
      throw new Error('Server is starting up — please try again in a moment.')
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

    const access = data.tokens?.access
    const refresh = data.tokens?.refresh
    if (!access) throw new Error('Invalid registration response from server.')

    persistAuth(access, refresh, data.user)
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
