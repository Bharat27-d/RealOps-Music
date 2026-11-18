import { childLogger } from '../core/logger.js';

const log = childLogger('lavalink/healthTracker');

interface NodeYouTubeHealth {
  failures: number;
  lastFailureTime: number;
  isDegraded: boolean;
  degradedAt: number;
}

/**
 * Tracks node-level degradation signals specifically for YouTube.
 * If a node repeatedly triggers bot-checks (403, "confirm not a bot") or rate limits (429),
 * it is flagged as "degraded for YouTube" so that other healthy nodes (such as residential)
 * are prioritized over it.
 */
export class NodeHealthTracker {
  private readonly nodes = new Map<string, NodeYouTubeHealth>();
  public readonly failureThreshold: number;
  public readonly windowMs: number;
  public readonly recoveryMs: number;

  constructor(options: { failureThreshold?: number; windowMs?: number; recoveryMs?: number } = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.windowMs = options.windowMs ?? 120_000; // 2 minutes window
    this.recoveryMs = options.recoveryMs ?? 300_000; // 5 minutes recovery cooldown
  }

  private getNode(name: string): NodeYouTubeHealth {
    let state = this.nodes.get(name);
    if (!state) {
      state = {
        failures: 0,
        lastFailureTime: 0,
        isDegraded: false,
        degradedAt: 0,
      };
      this.nodes.set(name, state);
    }
    return state;
  }

  /**
   * Reports a bot-check or 429 failure on this node.
   */
  public recordYouTubeFailure(nodeName: string): void {
    const s = this.getNode(nodeName);
    const now = Date.now();

    if (now - s.lastFailureTime > this.windowMs && !s.isDegraded) {
      s.failures = 0;
    }

    s.failures++;
    s.lastFailureTime = now;

    if (!s.isDegraded && s.failures >= this.failureThreshold) {
      s.isDegraded = true;
      s.degradedAt = now;
      log.warn(
        {
          node: nodeName,
          consecutiveFailures: s.failures,
          recoveryMinutes: Math.round(this.recoveryMs / 60000),
        },
        'Lavalink node marked DEGRADED FOR YOUTUBE (bot-check / rate-limit threshold reached)',
      );
    }
  }

  /**
   * Reports a successful YouTube load on this node.
   */
  public recordYouTubeSuccess(nodeName: string): void {
    const s = this.getNode(nodeName);
    if (s.isDegraded) {
      log.info({ node: nodeName }, 'Lavalink node recovered from YouTube degraded status');
    }
    s.failures = 0;
    s.isDegraded = false;
    s.degradedAt = 0;
  }

  /**
   * Checks whether the node is currently flagged as degraded for YouTube.
   */
  public isDegradedForYouTube(nodeName: string): boolean {
    const s = this.getNode(nodeName);
    if (s.isDegraded) {
      const now = Date.now();
      if (now - s.degradedAt >= this.recoveryMs) {
        s.isDegraded = false;
        s.failures = 0;
        log.info({ node: nodeName }, 'Node YouTube degraded cooldown expired — returning to normal pool');
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Telemetry stats for /status command.
   */
  public getAllNodeStatus(): Record<string, { isDegradedForYouTube: boolean; failures: number }> {
    const result: Record<string, { isDegradedForYouTube: boolean; failures: number }> = {};
    for (const [name] of this.nodes.entries()) {
      result[name] = {
        isDegradedForYouTube: this.isDegradedForYouTube(name),
        failures: this.getNode(name).failures,
      };
    }
    return result;
  }
}

export const nodeHealthTracker = new NodeHealthTracker();

