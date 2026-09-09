/**
 * Application Configuration
 * Allows configuring the backend API URL for production deployment on Vercel.
 * When VITE_API_URL is unset, requests use relative paths (e.g. /api/...)
 * which are handled by the local Vite proxy or Vercel rewrites.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/**
 * Resolves full API endpoint URL
 */
export function getApiEndpoint(path = '') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}
