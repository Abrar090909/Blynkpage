/**
 * Blynkpages Keep-Alive Worker
 *
 * Pings the Render backend /health/ endpoint every 5 minutes via a Cloudflare
 * cron trigger. This prevents the Render free-tier instance from sleeping,
 * eliminating the 50+ second cold-start delay users experience after inactivity.
 *
 * Cloudflare Workers free tier: 100,000 requests/day, cron triggers included.
 * At one ping every 5 minutes: 288 pings/day — well within free limits.
 *
 * Deploy:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy   (from this directory)
 *
 * The BACKEND_URL secret is set via:
 *   wrangler secret put BACKEND_URL
 *   > https://blynkpage-backend.onrender.com
 */

export default {
  /**
   * scheduled — runs on the cron trigger defined in wrangler.toml.
   * Fires every 5 minutes: "* /5 * * * *"
   */
  async scheduled(event, env, ctx) {
    const backendUrl = env.BACKEND_URL || 'https://blynkpage-backend.onrender.com'
    const pingUrl = `${backendUrl}/health/`

    const start = Date.now()
    try {
      const response = await fetch(pingUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Blynkpages-KeepAlive/1.0',
          'Accept': 'application/json',
        },
        // cf-specific: bypass cache so we always hit the origin
        cf: { cacheEverything: false },
      })

      const elapsed = Date.now() - start
      if (response.ok) {
        console.log(`[keep-alive] ✓ ${pingUrl} — ${response.status} in ${elapsed}ms`)
      } else {
        console.warn(`[keep-alive] ✗ ${pingUrl} — unexpected status ${response.status} in ${elapsed}ms`)
      }
    } catch (err) {
      const elapsed = Date.now() - start
      // This can happen if Render is mid-deploy or hard down. Log and move on.
      console.error(`[keep-alive] ✗ ${pingUrl} — fetch error after ${elapsed}ms: ${err.message}`)
    }
  },

  /**
   * fetch — handles direct HTTP requests to the Worker URL.
   * Useful for manually triggering a ping or checking Worker status.
   */
  async fetch(request, env, ctx) {
    const backendUrl = env.BACKEND_URL || 'https://blynkpage-backend.onrender.com'
    const pingUrl = `${backendUrl}/health/`

    if (new URL(request.url).pathname === '/ping') {
      const start = Date.now()
      try {
        const response = await fetch(pingUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'Blynkpages-KeepAlive/1.0' },
          cf: { cacheEverything: false },
        })
        const elapsed = Date.now() - start
        const body = await response.text().catch(() => '')
        return new Response(
          JSON.stringify({
            status: response.ok ? 'ok' : 'degraded',
            backend_status: response.status,
            elapsed_ms: elapsed,
            backend_url: pingUrl,
            response: body.slice(0, 200),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      } catch (err) {
        return new Response(
          JSON.stringify({ status: 'error', message: err.message, backend_url: pingUrl }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({
        worker: 'Blynkpages Keep-Alive',
        cron: 'Every 5 minutes',
        backend: backendUrl,
        endpoints: { manual_ping: '/ping' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  },
}
