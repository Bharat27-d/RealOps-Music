import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Constants, type Shoukaku, type Node } from 'shoukaku';
import { LavalinkService } from './service.js';
import { type LavalinkNodeConfig } from '../config/env.js';

describe('LavalinkService', () => {
  let service: LavalinkService;

  const mockConfigs: LavalinkNodeConfig[] = [
    {
      name: 'primary',
      host: '127.0.0.1',
      port: 2333,
      password: 'youshallnotpass',
      secure: false,
      role: 'primary',
    },
    {
      name: 'residential',
      host: '100.64.0.2',
      port: 2333,
      password: 'youshallnotpass',
      secure: false,
      role: 'residential',
    },
  ];

  beforeEach(() => {
    service = new LavalinkService({ preferResidentialForYouTube: true });
  });

  it('throws an error if getNode() is called before init()', () => {
    expect(() => service.getNode()).toThrowError(/not initialized/i);
  });

  it('returns isHealthy() = false when not initialized', () => {
    expect(service.isHealthy()).toBe(false);
  });

  it('returns uninitialized stats when not initialized', () => {
    const stats = service.stats();
    expect(stats.healthy).toBe(false);
    expect(stats.totalNodes).toBe(0);
    expect(stats.connectedNodes).toBe(0);
  });

  it('correctly reports stats and node health when initialized with mock Shoukaku', () => {
    // Manually inject initialized state for unit testing service methods
    const mockPrimaryNode: Node = {
      name: 'primary',
      state: Constants.State.CONNECTED,
      sessionId: 'sess-primary',
      penalties: 10,
      stats: {
        players: 2,
        playingPlayers: 1,
        uptime: 120000,
        memory: { used: 100, free: 200, allocated: 300, reservable: 400 },
        cpu: { cores: 4, systemLoad: 0.1, lavalinkLoad: 0.05 },
      },
    } as unknown as Node;

    const mockResidentialNode: Node = {
      name: 'residential',
      state: Constants.State.CONNECTED,
      sessionId: 'sess-residential',
      penalties: 20,
      stats: {
        players: 1,
        playingPlayers: 1,
        uptime: 60000,
        memory: { used: 50, free: 150, allocated: 200, reservable: 300 },
        cpu: { cores: 2, systemLoad: 0.2, lavalinkLoad: 0.1 },
      },
    } as unknown as Node;

    const mockShoukaku: Shoukaku = {
      nodes: new Map([
        ['primary', mockPrimaryNode],
        ['residential', mockResidentialNode],
      ]),
      players: new Map([
        ['guild-1', {}],
        ['guild-2', {}],
      ]),
      on: vi.fn(),
    } as unknown as Shoukaku;

    // Use TypeScript private field bypass for unit test verification
    const serviceInternal = service as unknown as {
      shoukaku: Shoukaku;
      nodeMeta: Map<string, { role: string }>;
    };
    serviceInternal.shoukaku = mockShoukaku;
    serviceInternal.nodeMeta = new Map([
      ['primary', { role: 'primary' }],
      ['residential', { role: 'residential' }],
    ]);

    expect(service.isHealthy()).toBe(true);
    expect(service.isHealthy('primary')).toBe(true);
    expect(service.isHealthy('residential')).toBe(true);
    expect(service.isHealthy('non-existent')).toBe(false);

    // Test YouTube preference selects residential
    const ytNode = service.getNode('youtube');
    expect(ytNode.name).toBe('residential');

    // Test default preference selects lowest penalty (primary has 10 vs 20)
    const defaultNode = service.getNode('default');
    expect(defaultNode.name).toBe('primary');

    // Test stats output
    const stats = service.stats();
    expect(stats.healthy).toBe(true);
    expect(stats.totalNodes).toBe(2);
    expect(stats.connectedNodes).toBe(2);
    expect(stats.totalPlayers).toBe(2);
    expect(stats.nodes).toHaveLength(2);
  });
});

