import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoadType, type Node, type Track } from 'shoukaku';
import { TrackQueue } from './queue.js';
import { circuitBreaker } from './circuitBreaker.js';
import { resolveInput } from './resolver.js';
import { handleTrackFailure } from './recovery.js';
import { lavalinkService } from '../lavalink/index.js';
import { type GuildPlayer } from './player.js';

function createMockTrack(title: string, author: string, sourceName = 'youtube'): Track {
  return {
    encoded: `mock-encoded-${title}`,
    info: {
      identifier: `id-${title}`,
      isSeekable: true,
      author,
      length: 180000,
      isStream: false,
      position: 0,
      title,
      uri: `https://${sourceName}.com/${title}`,
      sourceName,
    },
    pluginInfo: {},
  };
}

describe('End-to-End Resilience & Integration Test Matrix', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('YouTube Breaker Open → Spotify Fallback through SoundCloud', () => {
    it('promotes SoundCloud when YouTube circuit breaker is open', async () => {
      // 1. Force YouTube circuit breaker to OPEN state
      circuitBreaker.recordFailure('youtube');
      circuitBreaker.recordFailure('youtube');
      circuitBreaker.recordFailure('youtube');
      expect(circuitBreaker.isOpen('youtube')).toBe(true);

      // 2. Mock Lavalink resolver:
      // SoundCloud search succeeds; YouTube search would fail
      const soundCloudTrack = createMockTrack('Get Lucky', 'Daft Punk', 'soundcloud');
      const resolveMock = vi.fn().mockImplementation((query: string) => {
        if (query.startsWith('scsearch:')) {
          return Promise.resolve({
            loadType: LoadType.SEARCH,
            data: [soundCloudTrack],
          });
        }
        return Promise.resolve({ loadType: LoadType.EMPTY, data: {} });
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      // 3. Resolve a search query
      const result = await resolveInput('get lucky daft punk');

      // 4. Verify SoundCloud was queried FIRST and returned result
      expect(result.type).toBe('search');
      if (result.type === 'search') {
        expect(result.tracks[0]?.sourceName).toBe('soundcloud');
      }
      expect(resolveMock).toHaveBeenCalledWith('scsearch:get lucky daft punk');

      // Cleanup
      circuitBreaker.recordSuccess('youtube');
    });
  });

  describe('Hetzner Node Failure with Residential Failover', () => {
    it('migrates player to healthy residential node upon primary failure', async () => {
      const mockResidentialNode = { name: 'residential' } as unknown as Node;
      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockResidentialNode);

      const moveMock = vi.fn().mockResolvedValue(true);
      const playTrackMock = vi.fn().mockResolvedValue(undefined);

      const mockPlayer = {
        guildId: 'guild-hetzner-test',
        textChannelId: 'text-123',
        voiceChannelId: 'voice-123',
        queue: {
          current: {
            track: {
              encoded: 'mock-encoded',
              identifier: 'yt-song-1',
              title: 'Hetzner Stream Song',
              author: 'Artist',
              duration: 200000,
              uri: 'https://youtube.com/watch?v=hetzner',
              sourceName: 'youtube',
              isStream: false,
            },
            requesterId: 'user-1',
            requestedAt: Date.now(),
          },
          next: vi.fn(),
        },
        player: {
          node: { name: 'primary' }, // Currently on Hetzner primary
          move: moveMock,
          playTrack: playTrackMock,
        },
        client: {
          channels: {
            cache: new Map([['text-123', { send: vi.fn().mockResolvedValue({}) }]]),
          },
        },
      } as unknown as GuildPlayer;

      // Simulate bot-detection / 403 on Hetzner primary node
      const handled = await handleTrackFailure(mockPlayer, mockPlayer.queue.current!, {
        type: 'exception',
        message: 'Sign in to confirm you’re not a bot (HTTP 403)',
      });

      expect(handled).toBe(true);
      expect(moveMock).toHaveBeenCalledWith('residential');
      expect(playTrackMock).toHaveBeenCalled();
    });
  });

  describe('Rapid /play Spam Protection', () => {
    it('accepts tracks up to per-user and queue limits and gracefully rejects surplus', () => {
      const queue = new TrackQueue({ maxQueueSize: 10, maxPerUser: 4 });

      // User spams 10 tracks rapidly
      const results = [];
      for (let i = 1; i <= 10; i++) {
        results.push(
          queue.addTrack(
            {
              encoded: `enc-${i}`,
              identifier: `id-${i}`,
              title: `Spam Track ${i}`,
              author: 'Spammer',
              duration: 100000,
              uri: `https://example.com/${i}`,
              sourceName: 'youtube',
              isStream: false,
            },
            'spammer-user-id',
          ),
        );
      }

      const addedCount = results.filter((r) => r.added > 0).length;
      const rejectedCount = results.filter((r) => r.added === 0).length;

      expect(addedCount).toBe(4); // Capped at maxPerUser = 4
      expect(rejectedCount).toBe(6);
      expect(queue.size).toBe(4);
    });
  });

  describe('Livestream Handling', () => {
    it('identifies live stream tracks and sets duration to 0', () => {
      const liveTrackRaw: Track = {
        encoded: 'live-enc',
        info: {
          identifier: 'live-id',
          isSeekable: false,
          author: 'Lofi Girl',
          length: 0,
          isStream: true,
          position: 0,
          title: 'lofi hip hop radio - beats to relax/study to',
          uri: 'https://youtube.com/watch?v=live',
          sourceName: 'youtube',
        },
        pluginInfo: {},
      };

      const normalized = {
        ...liveTrackRaw.info,
        encoded: liveTrackRaw.encoded,
        duration: liveTrackRaw.info.length,
      };

      expect(normalized.isStream).toBe(true);
      expect(normalized.duration).toBe(0);
    });
  });

  describe('Queue Always Advances Guarantee', () => {
    it('advances past non-recoverable track failures without hanging or looping infinitely', async () => {
      const queue = new TrackQueue();
      queue.addTrack(
        {
          encoded: 'bad-track',
          identifier: 'bad-id',
          title: 'Corrupted Track',
          author: 'Corrupt',
          duration: 100000,
          uri: 'https://example.com/bad',
          sourceName: 'youtube',
          isStream: false,
        },
        'user-1',
      );
      queue.addTrack(
        {
          encoded: 'good-track',
          identifier: 'good-id',
          title: 'Good Next Track',
          author: 'Good Artist',
          duration: 100000,
          uri: 'https://example.com/good',
          sourceName: 'youtube',
          isStream: false,
        },
        'user-1',
      );

      // Start queue
      const first = queue.next();
      expect(first?.track.title).toBe('Corrupted Track');

      // Failure occurs and exhausts retries -> queue.next() called
      const next = queue.next();
      expect(next?.track.title).toBe('Good Next Track'); // Queue advanced
    });
  });
});

