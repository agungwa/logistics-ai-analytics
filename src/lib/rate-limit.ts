/**
 * Minimal in-memory rate limiting for the AI endpoint (demo-scale, single
 * instance — a multi-instance deployment would move this to Redis; that is
 * deliberately out of scope here).
 *
 * - Semaphore: caps concurrent AI turns per server instance, so a burst of
 *   clicks cannot open parallel provider calls beyond the provider's comfort.
 * - FixedWindowRateLimiter: caps requests per client IP per minute, protecting
 *   the demo API key on a public URL.
 */

export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(public readonly limit: number) {}

  get available(): number {
    return this.limit - this.active;
  }

  async acquire(timeoutMs: number): Promise<boolean> {
    if (this.active < this.limit) {
      this.active++;
      return true;
    }
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(wake);
        if (idx >= 0) this.waiters.splice(idx, 1);
        resolve(false);
      }, timeoutMs);
      const wake = () => {
        clearTimeout(timer);
        this.active++;
        resolve(true);
      };
      this.waiters.push(wake);
    });
  }

  release(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }
}

export class FixedWindowRateLimiter {
  private windows = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    public readonly limit: number,
    public readonly windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Returns remaining quota in the current window, or 0 when exhausted. */
  take(key: string): number {
    const t = this.now();
    const win = this.windows.get(key);
    if (!win || win.expiresAt <= t) {
      this.windows.set(key, { count: 1, expiresAt: t + this.windowMs });
      // opportunistic cleanup
      if (this.windows.size > 1000) {
        for (const k of Array.from(this.windows.keys())) {
          const w = this.windows.get(k);
          if (w && w.expiresAt <= t) this.windows.delete(k);
        }
      }
      return this.limit - 1;
    }
    if (win.count >= this.limit) return 0;
    win.count++;
    return this.limit - win.count;
  }
}
