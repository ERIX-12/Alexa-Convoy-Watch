/**
 * ReadCache with Single-Flight Request Coalescing
 * Prevents thundering herds / cache stampedes.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class ReadCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private inFlight: Map<string, Promise<T>> = new Map();

  /**
   * Retrieves from cache if valid, otherwise executes computeFn using single-flight coalescing.
   * Default TTL is 5000ms (5 seconds).
   */
  async getOrCompute(
    key: string,
    computeFn: () => Promise<T>,
    ttlMs: number = 5000
  ): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    // Check if there is already an in-flight computation for this key
    const existingPromise = this.inFlight.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    // Launch single flight computation
    const computePromise = (async () => {
      try {
        const result = await computeFn();
        this.cache.set(key, {
          value: result,
          expiresAt: Date.now() + ttlMs,
        });
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, computePromise);
    return computePromise;
  }

  set(key: string, value: T, ttlMs: number = 5000): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(key: string): T | null {
    const now = Date.now();
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > now) {
      return entry.value;
    }
    return null;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }
}
