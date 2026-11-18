import { describe, it, expect } from 'vitest';
import { Constants, type Node } from 'shoukaku';
import { isNodeHealthy, selectIdealNode, getNodePenalties, getNodeStateString } from './selector.js';
import { type NodeMetadata } from './types.js';

// Helper to create mock Shoukaku Node
function createMockNode(params: {
  name: string;
  state: number;
  sessionId: string | null;
  penalties: number;
}): Node {
  return {
    name: params.name,
    state: params.state,
    sessionId: params.sessionId,
    penalties: params.penalties,
  } as unknown as Node;
}

describe('Lavalink Selector & Health Evaluation', () => {
  describe('isNodeHealthy', () => {
    it('returns true when node is CONNECTED and has a valid sessionId', () => {
      const node = createMockNode({
        name: 'primary',
        state: Constants.State.CONNECTED,
        sessionId: 'session-xyz-123',
        penalties: 10,
      });
      expect(isNodeHealthy(node)).toBe(true);
    });

    it('returns false when node is CONNECTED but sessionId is null', () => {
      const node = createMockNode({
        name: 'primary',
        state: Constants.State.CONNECTED,
        sessionId: null,
        penalties: 10,
      });
      expect(isNodeHealthy(node)).toBe(false);
    });

    it('returns false when node is in CONNECTING state', () => {
      const node = createMockNode({
        name: 'primary',
        state: Constants.State.CONNECTING,
        sessionId: 'session-xyz',
        penalties: 10,
      });
      expect(isNodeHealthy(node)).toBe(false);
    });

    it('returns false when node is in DISCONNECTED state', () => {
      const node = createMockNode({
        name: 'primary',
        state: Constants.State.DISCONNECTED,
        sessionId: 'session-xyz',
        penalties: 10,
      });
      expect(isNodeHealthy(node)).toBe(false);
    });
  });

  describe('getNodeStateString', () => {
    it('correctly maps enum values to human-readable strings', () => {
      expect(getNodeStateString(Constants.State.CONNECTING)).toBe('CONNECTING');
      expect(getNodeStateString(Constants.State.CONNECTED)).toBe('CONNECTED');
      expect(getNodeStateString(Constants.State.DISCONNECTING)).toBe('DISCONNECTING');
      expect(getNodeStateString(Constants.State.DISCONNECTED)).toBe('DISCONNECTED');
      expect(getNodeStateString(999)).toBe('UNKNOWN');
    });
  });

  describe('getNodePenalties', () => {
    it('returns penalties value for healthy node', () => {
      const node = createMockNode({
        name: 'primary',
        state: Constants.State.CONNECTED,
        sessionId: 'session-1',
        penalties: 42,
      });
      expect(getNodePenalties(node)).toBe(42);
    });

    it('returns Infinity for unhealthy node', () => {
      const node = createMockNode({
        name: 'primary',
        state: Constants.State.DISCONNECTED,
        sessionId: 'session-1',
        penalties: 42,
      });
      expect(getNodePenalties(node)).toBe(Infinity);
    });
  });

  describe('selectIdealNode', () => {
    const metaPrimary: NodeMetadata = {
      name: 'primary-node',
      host: '127.0.0.1',
      port: 2333,
      role: 'primary',
      secure: false,
    };

    const metaResidential: NodeMetadata = {
      name: 'residential-node',
      host: '100.64.0.2',
      port: 2333,
      role: 'residential',
      secure: false,
    };

    const nodeMeta = new Map<string, NodeMetadata>([
      ['primary-node', metaPrimary],
      ['residential-node', metaResidential],
    ]);

    it('returns undefined if node list is empty', () => {
      const nodes = new Map<string, Node>();
      const result = selectIdealNode(nodes, nodeMeta, 'default');
      expect(result).toBeUndefined();
    });

    it('returns undefined if all nodes are unhealthy', () => {
      const nodes = new Map<string, Node>([
        [
          'primary-node',
          createMockNode({
            name: 'primary-node',
            state: Constants.State.DISCONNECTED,
            sessionId: null,
            penalties: 0,
          }),
        ],
        [
          'residential-node',
          createMockNode({
            name: 'residential-node',
            state: Constants.State.CONNECTING,
            sessionId: null,
            penalties: 0,
          }),
        ],
      ]);

      const result = selectIdealNode(nodes, nodeMeta, 'default');
      expect(result).toBeUndefined();
    });

    it('selects the least-loaded node when preference is "default"', () => {
      const primary = createMockNode({
        name: 'primary-node',
        state: Constants.State.CONNECTED,
        sessionId: 's1',
        penalties: 50,
      });
      const residential = createMockNode({
        name: 'residential-node',
        state: Constants.State.CONNECTED,
        sessionId: 's2',
        penalties: 20, // lower penalty = less loaded
      });

      const nodes = new Map<string, Node>([
        ['primary-node', primary],
        ['residential-node', residential],
      ]);

      const result = selectIdealNode(nodes, nodeMeta, 'default');
      expect(result?.name).toBe('residential-node');
    });

    it('prefers a healthy residential node for YouTube-sourced loads even if primary has lower penalty', () => {
      const primary = createMockNode({
        name: 'primary-node',
        state: Constants.State.CONNECTED,
        sessionId: 's1',
        penalties: 5, // primary has fewer players/lower penalty
      });
      const residential = createMockNode({
        name: 'residential-node',
        state: Constants.State.CONNECTED,
        sessionId: 's2',
        penalties: 40, // residential has slightly more players
      });

      const nodes = new Map<string, Node>([
        ['primary-node', primary],
        ['residential-node', residential],
      ]);

      const result = selectIdealNode(nodes, nodeMeta, 'youtube', true);
      // Hard requirement: YouTube loads MUST prefer residential node to bypass datacenter IP bans
      expect(result?.name).toBe('residential-node');
    });

    it('falls back to healthy primary node for YouTube if residential node is down', () => {
      const primary = createMockNode({
        name: 'primary-node',
        state: Constants.State.CONNECTED,
        sessionId: 's1',
        penalties: 10,
      });
      const residential = createMockNode({
        name: 'residential-node',
        state: Constants.State.DISCONNECTED,
        sessionId: null,
        penalties: 0,
      });

      const nodes = new Map<string, Node>([
        ['primary-node', primary],
        ['residential-node', residential],
      ]);

      const result = selectIdealNode(nodes, nodeMeta, 'youtube', true);
      expect(result?.name).toBe('primary-node');
    });

    it('respects preferResidentialForYouTube=false toggle and picks purely least-loaded node', () => {
      const primary = createMockNode({
        name: 'primary-node',
        state: Constants.State.CONNECTED,
        sessionId: 's1',
        penalties: 5, // lower penalty
      });
      const residential = createMockNode({
        name: 'residential-node',
        state: Constants.State.CONNECTED,
        sessionId: 's2',
        penalties: 30,
      });

      const nodes = new Map<string, Node>([
        ['primary-node', primary],
        ['residential-node', residential],
      ]);

      const result = selectIdealNode(nodes, nodeMeta, 'youtube', false);
      expect(result?.name).toBe('primary-node');
    });

    it('selects least-loaded residential node when multiple residential nodes are available', () => {
      const metaRes2: NodeMetadata = {
        name: 'residential-node-2',
        host: '100.64.0.3',
        port: 2333,
        role: 'residential',
        secure: false,
      };
      const extendedMeta = new Map<string, NodeMetadata>([
        ...nodeMeta,
        ['residential-node-2', metaRes2],
      ]);

      const primary = createMockNode({
        name: 'primary-node',
        state: Constants.State.CONNECTED,
        sessionId: 's1',
        penalties: 5,
      });
      const res1 = createMockNode({
        name: 'residential-node',
        state: Constants.State.CONNECTED,
        sessionId: 's2',
        penalties: 60,
      });
      const res2 = createMockNode({
        name: 'residential-node-2',
        state: Constants.State.CONNECTED,
        sessionId: 's3',
        penalties: 15, // least loaded residential
      });

      const nodes = new Map<string, Node>([
        ['primary-node', primary],
        ['residential-node', res1],
        ['residential-node-2', res2],
      ]);

      const result = selectIdealNode(nodes, extendedMeta, 'youtube', true);
      expect(result?.name).toBe('residential-node-2');
    });
  });
});

