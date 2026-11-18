import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTrackFailure } from './recovery.js';
import { type GuildPlayer } from './player.js';
import { type QueuedTrack } from './queue.js';
import { lavalinkService } from '../lavalink/index.js';
import * as resolverModule from './resolver.js';
import { type Node } from 'shoukaku';

describe('Track Failure Recovery', () => {
  let mockPlayer: GuildPlayer;
  let mockQueuedTrack: QueuedTrack;
  let moveMock: ReturnType<typeof vi.fn>;
  let playTrackMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();

    moveMock = vi.fn().mockResolvedValue(true);
    playTrackMock = vi.fn().mockResolvedValue(undefined);

    mockQueuedTrack = {
      track: {
        encoded: 'mock-encoded',
        identifier: 'track-id-123',
        title: 'Original Song',
        author: 'Original Artist',
        duration: 180000,
        uri: 'https://youtube.com/watch?v=original',
        sourceName: 'youtube',
        isStream: false,
      },
      requesterId: 'user-123',
      requestedAt: Date.now(),
    };

    mockPlayer = {
      guildId: 'guild-123',
      textChannelId: 'channel-123',
      voiceChannelId: 'voice-123',
      queue: {
        current: mockQueuedTrack,
        next: vi.fn(),
      },
      player: {
        node: { name: 'primary' },
        move: moveMock,
        playTrack: playTrackMock,
      },
      client: {
        channels: {
          cache: new Map([
            [
              'channel-123',
              {
                send: vi.fn().mockResolvedValue({}),
              },
            ],
          ]),
        },
      },
    } as unknown as GuildPlayer;
  });

  it('migrates player to residential node on bot-check failure when residential is healthy', async () => {
    const mockResidentialNode = { name: 'residential' } as unknown as Node;
    vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockResidentialNode);

    const handled = await handleTrackFailure(mockPlayer, mockQueuedTrack, {
      type: 'exception',
      message: 'Sign in to confirm you’re not a bot',
    });

    expect(handled).toBe(true);
    expect(moveMock).toHaveBeenCalledWith('residential');
    expect(playTrackMock).toHaveBeenCalled();
  });

  it('searches for alternate mirror track on alternate source when same source fails', async () => {
    // No residential node available
    vi.spyOn(lavalinkService, 'getNode').mockImplementation(() => {
      throw new Error('No residential node');
    });

    // Mock mirror search returning a valid track
    const mirrorTrack = {
      encoded: 'mirror-encoded',
      identifier: 'mirror-id',
      title: 'Original Song',
      author: 'Original Artist',
      duration: 180000,
      uri: 'https://soundcloud.com/artist/original-song',
      sourceName: 'soundcloud',
      isStream: false,
    };

    vi.spyOn(resolverModule, 'resolveInput').mockResolvedValue({
      type: 'search',
      tracks: [mirrorTrack],
    });

    const handled = await handleTrackFailure(mockPlayer, mockQueuedTrack, {
      type: 'exception',
      message: 'This video is private',
    });

    expect(handled).toBe(true);
    expect(mockPlayer.queue.current?.track.sourceName).toBe('soundcloud');
    expect(playTrackMock).toHaveBeenCalledWith({
      track: { encoded: 'mirror-encoded' },
    });
  });

  it('returns false to advance the queue when all fallbacks are exhausted', async () => {
    vi.spyOn(lavalinkService, 'getNode').mockImplementation(() => {
      throw new Error('No node');
    });

    vi.spyOn(resolverModule, 'resolveInput').mockResolvedValue({
      type: 'empty',
      message: 'No results found',
    });

    // Simulate exhausted retries by triggering with non-retryable failure
    const handled = await handleTrackFailure(mockPlayer, mockQueuedTrack, {
      type: 'exception',
      message: 'video has been removed and all retries exhausted',
    });

    expect(handled).toBe(false); // Indicates queue should advance
  });

  it('does not select another YouTube mirror when original YouTube playback is blocked', async () => {
    vi.spyOn(lavalinkService, 'getNode').mockImplementation(() => {
      throw new Error('No node');
    });

    vi.spyOn(resolverModule, 'resolveInput').mockResolvedValue({
      type: 'search',
      tracks: [
        {
          encoded: 'yt-encoded',
          identifier: 'yt-id',
          title: 'Original Song (Mirror)',
          author: 'Original Artist',
          duration: 180000,
          uri: 'https://youtube.com/watch?v=mirror',
          sourceName: 'youtube',
          isStream: false,
        },
      ],
    });

    const handled = await handleTrackFailure(mockPlayer, mockQueuedTrack, {
      type: 'exception',
      message: 'Sign in to confirm you are not a bot',
    });

    expect(handled).toBe(false);
    expect(playTrackMock).not.toHaveBeenCalledWith({
      track: { encoded: 'yt-encoded' },
    });
  });
});

