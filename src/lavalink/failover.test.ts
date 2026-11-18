import { describe, it, expect, vi } from 'vitest';
import { Constants, type Shoukaku, type Player, type Node, type Connection } from 'shoukaku';
import { migrateDroppedNodePlayers } from './failover.js';
import { type NodeMetadata } from './types.js';

describe('Lavalink Failover & Player Migration', () => {
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

  it('does nothing when no active players are on the dropped node', async () => {
    const droppedNode: Node = {
      name: 'primary-node',
      state: Constants.State.DISCONNECTED,
      sessionId: null,
      penalties: Infinity,
    } as unknown as Node;

    const healthyNode: Node = {
      name: 'residential-node',
      state: Constants.State.CONNECTED,
      sessionId: 'sess-1',
      penalties: 0,
    } as unknown as Node;

    const mockShoukaku: Shoukaku = {
      nodes: new Map([
        ['primary-node', droppedNode],
        ['residential-node', healthyNode],
      ]),
      players: new Map(), // no players
      connections: new Map(),
    } as unknown as Shoukaku;

    const results = await migrateDroppedNodePlayers(mockShoukaku, nodeMeta, 'primary-node');
    expect(results).toHaveLength(0);
  });

  it('migrates affected players to a healthy alternative node and resumes', async () => {
    const droppedNode: Node = {
      name: 'primary-node',
      state: Constants.State.DISCONNECTED,
      sessionId: null,
      penalties: Infinity,
    } as unknown as Node;

    const healthyNode: Node = {
      name: 'residential-node',
      state: Constants.State.CONNECTED,
      sessionId: 'sess-healthy',
      penalties: 10,
    } as unknown as Node;

    const moveMock = vi.fn().mockResolvedValue(true);

    const mockPlayer: Player = {
      guildId: '123456789012345678',
      node: droppedNode,
      position: 45000,
      track: 'mock-base64-track-data',
      move: moveMock,
    } as unknown as Player;

    const mockShoukaku: Shoukaku = {
      nodes: new Map([
        ['primary-node', droppedNode],
        ['residential-node', healthyNode],
      ]),
      players: new Map([['123456789012345678', mockPlayer]]),
      connections: new Map(),
    } as unknown as Shoukaku;

    const results = await migrateDroppedNodePlayers(mockShoukaku, nodeMeta, 'primary-node');

    expect(results).toHaveLength(1);
    expect(results[0]?.guildId).toBe('123456789012345678');
    expect(results[0]?.fromNode).toBe('primary-node');
    expect(results[0]?.toNode).toBe('residential-node');
    expect(results[0]?.position).toBe(45000);
    expect(results[0]?.success).toBe(true);
    expect(moveMock).toHaveBeenCalledWith('residential-node');
  });

  it('falls back to manual reconnect and resume if player.move() rejects', async () => {
    const droppedNode: Node = {
      name: 'primary-node',
      state: Constants.State.DISCONNECTED,
      sessionId: null,
      penalties: Infinity,
    } as unknown as Node;

    const healthyNode: Node = {
      name: 'residential-node',
      state: Constants.State.CONNECTED,
      sessionId: 'sess-healthy',
      penalties: 10,
    } as unknown as Node;

    // Simulate player.move rejecting due to dropped node socket death
    const moveMock = vi.fn().mockRejectedValue(new Error('Old node socket dead'));
    const sendServerUpdateMock = vi.fn().mockResolvedValue(undefined);
    const resumeMock = vi.fn().mockResolvedValue(undefined);

    const mockPlayer: Player = {
      guildId: '123456789012345678',
      node: droppedNode,
      position: 72000,
      track: 'mock-base64-track-data',
      move: moveMock,
      sendServerUpdate: sendServerUpdateMock,
      resume: resumeMock,
    } as unknown as Player;

    const mockConnection = {} as unknown as Connection;

    const mockShoukaku: Shoukaku = {
      nodes: new Map([
        ['primary-node', droppedNode],
        ['residential-node', healthyNode],
      ]),
      players: new Map([['123456789012345678', mockPlayer]]),
      connections: new Map([['123456789012345678', mockConnection]]),
    } as unknown as Shoukaku;

    const results = await migrateDroppedNodePlayers(mockShoukaku, nodeMeta, 'primary-node');

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(true);
    expect(results[0]?.toNode).toBe('residential-node');
    expect(results[0]?.position).toBe(72000);
    expect(sendServerUpdateMock).toHaveBeenCalledWith(mockConnection);
    expect(resumeMock).toHaveBeenCalledWith({ position: 72000 });
  });

  it('fails gracefully when no healthy replacement node is available', async () => {
    const droppedNode: Node = {
      name: 'primary-node',
      state: Constants.State.DISCONNECTED,
      sessionId: null,
      penalties: Infinity,
    } as unknown as Node;

    // Both nodes are down
    const otherDeadNode: Node = {
      name: 'residential-node',
      state: Constants.State.DISCONNECTED,
      sessionId: null,
      penalties: Infinity,
    } as unknown as Node;

    const mockPlayer: Player = {
      guildId: '123456789012345678',
      node: droppedNode,
      position: 30000,
      track: 'mock-base64-track-data',
      move: vi.fn(),
    } as unknown as Player;

    const mockShoukaku: Shoukaku = {
      nodes: new Map([
        ['primary-node', droppedNode],
        ['residential-node', otherDeadNode],
      ]),
      players: new Map([['123456789012345678', mockPlayer]]),
      connections: new Map(),
    } as unknown as Shoukaku;

    const results = await migrateDroppedNodePlayers(mockShoukaku, nodeMeta, 'primary-node');

    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(false);
    expect(results[0]?.error?.message).toMatch(/No alternative healthy Lavalink nodes/i);
  });
});

