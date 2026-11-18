import { Constants, type Node } from 'shoukaku';
import { type NodeMetadata, type NodePreference, type NodeConnectionState } from './types.js';
import { nodeHealthTracker } from './nodeHealthTracker.js';

/**
 * Checks whether a Shoukaku Node is currently healthy and capable of accepting operations.
 * A node is healthy when its WebSocket state is CONNECTED and it has an assigned sessionId.
 */
export function isNodeHealthy(node: Node): boolean {
  return node.state === Constants.State.CONNECTED && node.sessionId !== null;
}

/**
 * Maps Shoukaku's numeric state enum to human-readable string.
 */
export function getNodeStateString(state: number): NodeConnectionState {
  switch (state) {
    case Constants.State.CONNECTING:
      return 'CONNECTING';
    case Constants.State.CONNECTED:
      return 'CONNECTED';
    case Constants.State.DISCONNECTING:
      return 'DISCONNECTING';
    case Constants.State.DISCONNECTED:
      return 'DISCONNECTED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Calculates or retrieves the load penalty for a Lavalink node.
 * Shoukaku computes penalties based on CPU load, frame deficit, and player counts.
 * Lower penalty = less loaded node.
 */
export function getNodePenalties(node: Node): number {
  if (!isNodeHealthy(node)) {
    return Infinity;
  }
  return node.penalties;
}

/**
 * Selects the optimal healthy Lavalink node based on load and source preference.
 *
 * Requirements enforced:
 * 1. Least-loaded healthy node selection.
 * 2. For YouTube-sourced loads, prefers a healthy "residential" node over a "primary" node
 *    when both exist.
 * 3. Deprioritizes nodes flagged as "degraded for YouTube" due to bot checks or 429s.
 * 4. Graceful fallback to primary or any healthy node if residential is down.
 * 5. Configurable preference toggle (preferResidentialForYouTube).
 *
 * @param nodes Map of available nodes from Shoukaku
 * @param nodeMeta Map of node metadata containing role configuration
 * @param preference Node preference ('default' | 'youtube' | 'primary' | 'residential')
 * @param preferResidentialForYouTube Whether to prefer residential node for YouTube (default: true)
 */
export function selectIdealNode(
  nodes: Map<string, Node>,
  nodeMeta: Map<string, NodeMetadata>,
  preference: NodePreference = 'default',
  preferResidentialForYouTube = true,
): Node | undefined {
  const healthyNodes = [...nodes.values()].filter(isNodeHealthy);

  if (healthyNodes.length === 0) {
    return undefined;
  }

  // Helper to pick the least-loaded node from a candidate list
  const pickLeastLoaded = (candidates: Node[]): Node | undefined => {
    if (candidates.length === 0) return undefined;
    return candidates.reduce((prev, curr) =>
      getNodePenalties(curr) < getNodePenalties(prev) ? curr : prev,
    );
  };

  // ── YouTube Preference ──────────────────────────────────────────────────────
  if (preference === 'youtube' && preferResidentialForYouTube) {
    const residentialNodes = healthyNodes.filter(
      (n) => nodeMeta.get(n.name)?.role === 'residential',
    );

    // Prefer non-degraded residential nodes first
    const cleanResidential = residentialNodes.filter(
      (n) => !nodeHealthTracker.isDegradedForYouTube(n.name),
    );
    if (cleanResidential.length > 0) {
      return pickLeastLoaded(cleanResidential);
    }
    if (residentialNodes.length > 0) {
      return pickLeastLoaded(residentialNodes);
    }

    // Fallback: Primary nodes (prefer non-degraded first)
    const primaryNodes = healthyNodes.filter(
      (n) => nodeMeta.get(n.name)?.role === 'primary',
    );
    const cleanPrimary = primaryNodes.filter(
      (n) => !nodeHealthTracker.isDegradedForYouTube(n.name),
    );
    if (cleanPrimary.length > 0) {
      return pickLeastLoaded(cleanPrimary);
    }
    if (primaryNodes.length > 0) {
      return pickLeastLoaded(primaryNodes);
    }

    return pickLeastLoaded(healthyNodes);
  }

  // ── Explicit Residential Preference ─────────────────────────────────────────
  if (preference === 'residential') {
    const residentialNodes = healthyNodes.filter(
      (n) => nodeMeta.get(n.name)?.role === 'residential',
    );
    if (residentialNodes.length > 0) {
      return pickLeastLoaded(residentialNodes);
    }
    return pickLeastLoaded(healthyNodes);
  }

  // ── Explicit Primary Preference ─────────────────────────────────────────────
  if (preference === 'primary') {
    const primaryNodes = healthyNodes.filter(
      (n) => nodeMeta.get(n.name)?.role === 'primary',
    );
    if (primaryNodes.length > 0) {
      return pickLeastLoaded(primaryNodes);
    }
    return pickLeastLoaded(healthyNodes);
  }

  // ── Default Preference: Pure Least-Loaded ───────────────────────────────────
  return pickLeastLoaded(healthyNodes);
}
