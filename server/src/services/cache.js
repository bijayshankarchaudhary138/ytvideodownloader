/**
 * Tiny TTL + LRU cache used for expensive yt-dlp metadata probes.
 */
export function createCache({ ttlMs = 15 * 60_000, max = 200 } = {}) {
  const map = new Map();
  let hits = 0;
  let misses = 0;

  const now = () => Date.now();

  function get(key) {
    const entry = map.get(key);
    if (!entry) {
      misses++;
      return null;
    }
    if (entry.expiresAt <= now()) {
      map.delete(key);
      misses++;
      return null;
    }
    // refresh LRU position
    map.delete(key);
    map.set(key, entry);
    hits++;
    return entry.value;
  }

  function set(key, value, { ttl = ttlMs } = {}) {
    if (map.size >= max) {
      const oldest = map.keys().next().value;
      map.delete(oldest);
    }
    map.set(key, { value, expiresAt: now() + ttl });
    return value;
  }

  /** get-or-create with in-flight de-duplication (stampede protection). */
  async function wrap(key, factory, opts) {
    const cached = get(key);
    if (cached !== null && cached !== undefined) return { value: cached, cached: true };
    const pendingKey = `pending:${key}`;
    const inFlight = map.get(pendingKey);
    if (inFlight) return { value: await inFlight.value, cached: false };
    const promise = (async () => factory())();
    map.set(pendingKey, { value: promise, expiresAt: now() + 120_000 });
    try {
      const value = await promise;
      set(key, value, opts);
      return { value, cached: false };
    } finally {
      map.delete(pendingKey);
    }
  }

  function del(key) { map.delete(key); }
  function clear() { map.clear(); }
  const stats = () => ({ size: map.size, hits, misses, max, ttlMs });

  return { get, set, wrap, del, clear, stats };
}
