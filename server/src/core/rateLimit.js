/**
 * Fixed-window rate limiter with weights, bounded memory and per-key isolation.
 * Used per client IP (and a stricter bucket for expensive endpoints).
 */
export function createRateLimiter({ max = 60, windowMs = 60_000, now = Date.now, maxKeys = null } = {}) {
  const buckets = new Map();
  const keyCap = maxKeys ?? Math.max(100, max * 20);

  function purgeExpired(current) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
  }

  function enforceCap() {
    if (buckets.size <= keyCap) return;
    purgeExpired(now());
    // still too big → drop the oldest entries (Map preserves insertion order)
    while (buckets.size > keyCap) {
      const oldest = buckets.keys().next().value;
      buckets.delete(oldest);
    }
  }

  function check(key, weight = 1) {
    const id = String(key ?? 'anonymous');
    const current = now();
    const amount = Math.max(1, Number(weight) || 1);

    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.delete(id);
      buckets.set(id, bucket);
    }

    if (bucket.count + amount > max) {
      const retryAfterMs = Math.max(0, bucket.resetAt - current);
      enforceCap();
      return {
        allowed: false,
        remaining: Math.max(0, max - bucket.count),
        limit: max,
        resetAt: bucket.resetAt,
        retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    bucket.count += amount;
    enforceCap();
    return {
      allowed: true,
      remaining: Math.max(0, max - bucket.count),
      limit: max,
      resetAt: bucket.resetAt,
      retryAfter: 0,
    };
  }

  function reset(key) {
    if (key === undefined) buckets.clear();
    else buckets.delete(String(key));
  }

  return { check, reset, size: () => buckets.size, max, windowMs };
}
