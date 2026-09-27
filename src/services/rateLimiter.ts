/**
 * In-memory token bucket rate limiter for API endpoints and socket actions.
 * Protects server-side resources from request flood or spam without external dependencies.
 */

interface RateBucket {
  tokens: number;
  lastRefill: number;
}

export class SimpleRateLimiter {
  private buckets: Map<string, RateBucket> = new Map();
  private maxTokens: number;
  private refillRatePerMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * @param limit Maximum number of actions allowed in the time window
   * @param windowMs Time window in milliseconds
   */
  constructor(limit: number, windowMs: number) {
    this.maxTokens = limit;
    this.refillRatePerMs = limit / windowMs;

    // Periodic cleanup of stale rate-limit buckets every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets.entries()) {
        const timePassed = now - bucket.lastRefill;
        if (timePassed > windowMs * 2) {
          this.buckets.delete(key);
        }
      }
    }, 300000);
    this.cleanupInterval.unref();
  }

  public check(key: string, cost = 1): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      const timePassed = now - bucket.lastRefill;
      const refilled = timePassed * this.refillRatePerMs;
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refilled);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      const resetMs = Math.ceil((this.maxTokens - bucket.tokens) / this.refillRatePerMs);
      return { allowed: true, remaining: Math.floor(bucket.tokens), resetMs };
    }

    const resetMs = Math.ceil((cost - bucket.tokens) / this.refillRatePerMs);
    return { allowed: false, remaining: 0, resetMs };
  }

  public reset(key?: string) {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }

  public close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.buckets.clear();
  }
}
