type Bucket = { tokens: number; updatedAt: number; lastUsedAt: number };

export type WeightedRateLimiterOptions = {
  capacity: number;
  refillPerSecond: number;
  idleTtlMs: number;
  maxEntries: number;
  now?: () => number;
};

export class WeightedRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly options: WeightedRateLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  consume(key: string, cost: number): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = this.now();
    this.prune(now);
    const existing = this.buckets.get(key);
    const elapsedSeconds = existing ? Math.max(0, now - existing.updatedAt) / 1_000 : 0;
    const tokens = existing
      ? Math.min(
          this.options.capacity,
          existing.tokens + elapsedSeconds * this.options.refillPerSecond
        )
      : this.options.capacity;
    const bucket = { tokens, updatedAt: now, lastUsedAt: now };
    this.buckets.set(key, bucket);
    if (cost <= tokens) {
      bucket.tokens -= cost;
      return { allowed: true };
    }
    return {
      allowed: false,
      retryAfterMs: Math.max(
        100,
        Math.ceil(((cost - tokens) / this.options.refillPerSecond) * 1_000)
      ),
    };
  }

  refund(key: string, cost: number): void {
    const bucket = this.buckets.get(key);
    if (!bucket) return;
    bucket.tokens = Math.min(this.options.capacity, bucket.tokens + cost);
    bucket.lastUsedAt = this.now();
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastUsedAt > this.options.idleTtlMs) this.buckets.delete(key);
    }
    while (this.buckets.size >= this.options.maxEntries) {
      const oldestKey = this.buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.buckets.delete(oldestKey);
    }
  }
}
