import { childLogger } from '../core/logger.js';

const log = childLogger('music/circuitBreaker');

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold?: number; // Consecutive failures before opening (default: 3)
  windowMs?: number; // Window for failures (default: 60,000ms = 1 min)
  cooldownMs?: number; // Cooldown before moving to HALF_OPEN (default: 120,000ms = 2 min)
}

interface SourceState {
  failures: number;
  lastFailureTime: number;
  state: CircuitState;
  openedAt: number;
}

/**
 * Per-source circuit breaker.
 * Detects sustained upstream failures on a source (e.g. YouTube bans or outages),
 * opens the breaker to bypass the failing source, and promotes alternative sources
 * (e.g. SoundCloud) to the front of the fallback order.
 */
export class CircuitBreakerManager {
  private readonly sources = new Map<string, SourceState>();
  public readonly failureThreshold: number;
  public readonly windowMs: number;
  public readonly cooldownMs: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 2;
    this.windowMs = config.windowMs ?? 60_000;
    this.cooldownMs = config.cooldownMs ?? 120_000;
  }

  private getSource(source: string): SourceState {
    const key = source.toLowerCase();
    let state = this.sources.get(key);
    if (!state) {
      state = {
        failures: 0,
        lastFailureTime: 0,
        state: 'CLOSED',
        openedAt: 0,
      };
      this.sources.set(key, state);
    }
    return state;
  }

  /**
   * Reports a successful operation on a source.
   * Resets failures and closes the circuit if in HALF_OPEN.
   */
  public recordSuccess(source: string): void {
    const s = this.getSource(source);
    if (s.state !== 'CLOSED') {
      log.info({ source, previousState: s.state }, 'Circuit breaker closed — source recovered');
    }
    s.failures = 0;
    s.state = 'CLOSED';
    s.openedAt = 0;
  }

  /**
   * Reports a failure on a source.
   * Increments failures within the sliding window. If threshold is met, opens circuit.
   */
  public recordFailure(source: string): void {
    const s = this.getSource(source);
    const now = Date.now();

    // Reset failure counter if outside the sliding window
    if (now - s.lastFailureTime > this.windowMs && s.state === 'CLOSED') {
      s.failures = 0;
    }

    s.failures++;
    s.lastFailureTime = now;

    if (s.state === 'CLOSED' && s.failures >= this.failureThreshold) {
      s.state = 'OPEN';
      s.openedAt = now;
      log.warn(
        {
          source,
          consecutiveFailures: s.failures,
          cooldownSeconds: Math.round(this.cooldownMs / 1000),
        },
        'Circuit breaker opened — source temporarily deprioritized',
      );
    } else if (s.state === 'HALF_OPEN') {
      // Re-trip immediately if failure happens during recovery trial
      s.state = 'OPEN';
      s.openedAt = now;
      log.warn({ source }, 'Circuit breaker re-opened during half-open trial');
    }
  }

  /**
   * Evaluates the current state of a source, transitioning from OPEN to HALF_OPEN
   * after the cooldown expires.
   */
  public getState(source: string): CircuitState {
    const s = this.getSource(source);
    if (s.state === 'OPEN') {
      const now = Date.now();
      if (now - s.openedAt >= this.cooldownMs) {
        s.state = 'HALF_OPEN';
        log.info(
          { source },
          'Circuit breaker transitioned to HALF_OPEN — testing source recovery',
        );
      }
    }
    return s.state;
  }

  /**
   * Checks whether the circuit is currently open (bypassing the source).
   */
  public isOpen(source: string): boolean {
    return this.getState(source) === 'OPEN';
  }

  /**
   * Returns search provider order taking circuit breaker states into account.
   * When YouTube's breaker is OPEN, SoundCloud is moved to the FRONT of the fallback order.
   */
  public getOrderedSearchProviders(): Array<{
    prefix: string;
    preference: 'youtube' | 'default';
    name: string;
  }> {
    const youtubeOpen = this.isOpen('youtube');

    if (youtubeOpen) {
      log.debug('YouTube circuit breaker is OPEN — promoting SoundCloud to front of search order');
      return [
        { prefix: 'scsearch:', preference: 'default', name: 'SoundCloud' },
        { prefix: 'ytmsearch:', preference: 'youtube', name: 'YouTube Music' },
        { prefix: 'ytsearch:', preference: 'youtube', name: 'YouTube' },
      ];
    }

    return [
      { prefix: 'ytmsearch:', preference: 'youtube', name: 'YouTube Music' },
      { prefix: 'ytsearch:', preference: 'youtube', name: 'YouTube' },
      { prefix: 'scsearch:', preference: 'default', name: 'SoundCloud' },
    ];
  }

  /**
   * Returns status telemetry for all monitored sources (for /status command).
   */
  public getAllStates(): Record<string, { state: CircuitState; failures: number; cooldownRemainingMs: number }> {
    const result: Record<string, { state: CircuitState; failures: number; cooldownRemainingMs: number }> = {};
    const now = Date.now();

    for (const [name, state] of this.sources.entries()) {
      const current = this.getState(name);
      const remaining = current === 'OPEN' ? Math.max(0, this.cooldownMs - (now - state.openedAt)) : 0;
      result[name] = {
        state: current,
        failures: state.failures,
        cooldownRemainingMs: remaining,
      };
    }

    return result;
  }
}

export const circuitBreaker = new CircuitBreakerManager();

