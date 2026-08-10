/**
 * lib/rateLimit.ts — In-memory sliding-window rate limiter for auth routes.
 *
 * No rate-limiting library exists in the repo, and this app's scale (~10
 * reports/month, single-instance deployment) doesn't justify adding one.
 *
 * Known limitation, stated explicitly: this does not survive a process
 * restart and does not work across multiple instances. If the app is ever
 * deployed with more than one replica, this needs to move to a shared store
 * (Redis/Upstash, or a DB-backed counter table).
 *
 * On Vercel (see .kiro/specs/vercel-supabase-deployment/), this limitation is
 * not hypothetical: serverless is inherently multi-instance, so this limiter
 * is effectively inert there — auth brute-force protection on login/signup/
 * password-reset is not enforced across invocations. Accepted as a known v1
 * risk for that deployment rather than fixed, given the app's scale above;
 * revisit if abuse becomes a real problem.
 */

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()

// Periodically drop stale buckets so this doesn't grow unbounded on a
// long-running process.
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > WINDOW_MS) buckets.delete(key)
  }
}, WINDOW_MS).unref?.()

/**
 * Returns `true` if the caller is within the allowed rate, incrementing its
 * counter. Returns `false` if the caller has exceeded `MAX_ATTEMPTS` within
 * the current window.
 */
export function checkRateLimit(key: string, maxAttempts = MAX_ATTEMPTS, windowMs = WINDOW_MS): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    return true
  }

  if (bucket.count >= maxAttempts) return false

  bucket.count += 1
  return true
}

/** Best-effort client identifier for rate-limit keying (IP, falling back to a constant). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}
