import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoadType, type Node, type Track } from 'shoukaku';
import { resolveInput } from './resolver.js';
import { lavalinkService } from '../lavalink/index.js';

function createMockTrack(title: string, author: string, length = 200000): Track {
  return {
    encoded: `mock-encoded-${title}`,
    info: {
      identifier: `id-${title}`,
      isSeekable: true,
      author,
      length,
      isStream: false,
      position: 0,
      title,
      uri: `https://example.com/track/${title}`,
      artworkUrl: 'https://example.com/artwork.jpg',
      isrc: 'US1234567890',
      sourceName: 'youtube',
    },
    pluginInfo: {},
  };
}

describe('Music Input Resolver', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Input Type & Validation', () => {
    it('returns empty result for blank or whitespace query', async () => {
      const res = await resolveInput('   ');
      expect(res.type).toBe('empty');
      expect(res.message).toMatch(/cannot be empty/i);
    });

    it('rejects disallowed URL domains before communicating with Lavalink', async () => {
      const res = await resolveInput('https://tiktok.com/@creator/video/12345');
      expect(res.type).toBe('error');
      expect(res.message).toMatch(/Unsupported URL/i);
    });
  });

  describe('Track URL Resolution', () => {
    it('resolves a valid YouTube track URL', async () => {
      const mockTrack = createMockTrack('Bohemian Rhapsody', 'Queen');
      const resolveMock = vi.fn().mockResolvedValue({
        loadType: LoadType.TRACK,
        data: mockTrack,
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('https://www.youtube.com/watch?v=fJ9rUzIMcZQ');

      expect(res.type).toBe('track');
      if (res.type === 'track') {
        expect(res.track.title).toBe('Bohemian Rhapsody');
        expect(res.track.author).toBe('Queen');
        expect(res.track.duration).toBe(200000);
        expect(res.track.isrc).toBe('US1234567890');
      }
      expect(resolveMock).toHaveBeenCalledWith('https://www.youtube.com/watch?v=fJ9rUzIMcZQ');
    });

    it('handles empty response from audio server', async () => {
      const resolveMock = vi.fn().mockResolvedValue({
        loadType: LoadType.EMPTY,
        data: {},
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('https://www.youtube.com/watch?v=deleted_id');
      expect(res.type).toBe('empty');
      expect(res.message).toMatch(/No playable audio found/i);
    });
  });

  describe('Playlist URL Resolution & Capping', () => {
    it('resolves a playlist and caps tracks to maxPlaylistTracks', async () => {
      // Create 150 mock tracks
      const tracks = Array.from({ length: 150 }, (_, i) =>
        createMockTrack(`Track ${i + 1}`, 'Artist', 100000),
      );

      const resolveMock = vi.fn().mockResolvedValue({
        loadType: LoadType.PLAYLIST,
        data: {
          info: { name: 'Top 100 Hits', selectedTrack: 0 },
          tracks,
          pluginInfo: {},
        },
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput(
        'https://www.youtube.com/playlist?list=PL123456789',
        { maxPlaylistTracks: 50 },
      );

      expect(res.type).toBe('playlist');
      if (res.type === 'playlist') {
        expect(res.playlist.name).toBe('Top 100 Hits');
        expect(res.playlist.tracks).toHaveLength(50); // Capped to 50
        expect(res.playlist.totalDuration).toBe(50 * 100000);
      }
    });

    it('gracefully handles empty or private playlists', async () => {
      const resolveMock = vi.fn().mockResolvedValue({
        loadType: LoadType.PLAYLIST,
        data: {
          info: { name: 'Private Playlist', selectedTrack: -1 },
          tracks: [],
          pluginInfo: {},
        },
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('https://www.youtube.com/playlist?list=PLprivate');
      expect(res.type).toBe('empty');
      expect(res.message).toMatch(/empty, private, or contains no playable tracks/i);
    });
  });

  describe('Plain-Text Search with Fallback Chain', () => {
    it('returns results from YouTube Music if first provider succeeds', async () => {
      const mockTracks = [createMockTrack('Song 1', 'Artist')];
      const resolveMock = vi.fn().mockImplementation((query: string) => {
        if (query.startsWith('ytmsearch:')) {
          return Promise.resolve({
            loadType: LoadType.SEARCH,
            data: mockTracks,
          });
        }
        return Promise.resolve({ loadType: LoadType.EMPTY, data: {} });
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('get lucky daft punk');
      expect(res.type).toBe('search');
      if (res.type === 'search') {
        expect(res.tracks).toHaveLength(1);
        expect(res.tracks[0]?.title).toBe('Song 1');
      }
      expect(resolveMock).toHaveBeenCalledWith('ytmsearch:get lucky daft punk');
    });

    it('falls back to YouTube search when YouTube Music returns empty', async () => {
      const mockTracks = [createMockTrack('Song from YouTube', 'Artist')];
      const resolveMock = vi.fn().mockImplementation((query: string) => {
        if (query.startsWith('ytmsearch:')) {
          return Promise.resolve({ loadType: LoadType.EMPTY, data: {} });
        }
        if (query.startsWith('ytsearch:')) {
          return Promise.resolve({
            loadType: LoadType.SEARCH,
            data: mockTracks,
          });
        }
        return Promise.resolve({ loadType: LoadType.EMPTY, data: {} });
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('obscure indie track');
      expect(res.type).toBe('search');
      if (res.type === 'search') {
        expect(res.tracks[0]?.title).toBe('Song from YouTube');
      }
      expect(resolveMock).toHaveBeenCalledWith('ytmsearch:obscure indie track');
      expect(resolveMock).toHaveBeenCalledWith('ytsearch:obscure indie track');
    });

    it('falls back to SoundCloud when both YouTube Music and YouTube fail', async () => {
      const mockTracks = [createMockTrack('SoundCloud Remix', 'DJ')];
      const resolveMock = vi.fn().mockImplementation((query: string) => {
        if (query.startsWith('scsearch:')) {
          return Promise.resolve({
            loadType: LoadType.SEARCH,
            data: mockTracks,
          });
        }
        return Promise.resolve({ loadType: LoadType.EMPTY, data: {} });
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('underground remix');
      expect(res.type).toBe('search');
      if (res.type === 'search') {
        expect(res.tracks[0]?.title).toBe('SoundCloud Remix');
      }
      expect(resolveMock).toHaveBeenCalledWith('ytmsearch:underground remix');
      expect(resolveMock).toHaveBeenCalledWith('ytsearch:underground remix');
      expect(resolveMock).toHaveBeenCalledWith('scsearch:underground remix');
    });

    it('returns empty when all three providers fail to find tracks', async () => {
      const resolveMock = vi.fn().mockResolvedValue({
        loadType: LoadType.EMPTY,
        data: {},
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('asdkjfhkjsadhfkjashdfkljhasdf');
      expect(res.type).toBe('empty');
      expect(res.message).toMatch(/No search results found/i);
    });
  });

  describe('Error Classification & Friendly Messages', () => {
    it('maps bot-detection errors to user-friendly message', async () => {
      const resolveMock = vi.fn().mockResolvedValue({
        loadType: LoadType.ERROR,
        data: {
          message: 'Sign in to confirm you are not a bot',
          severity: 'fault',
          cause: 'bot_check',
        },
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('https://www.youtube.com/watch?v=botblock');
      expect(res.type).toBe('error');
      expect(res.message).toMatch(/requires authentication or has flagged this session/i);
    });

    it('maps age-restriction errors to user-friendly message', async () => {
      const resolveMock = vi.fn().mockResolvedValue({
        loadType: LoadType.ERROR,
        data: {
          message: 'Age restricted content cannot be loaded',
          severity: 'common',
          cause: 'age_gate',
        },
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('https://www.youtube.com/watch?v=agerestricted');
      expect(res.type).toBe('error');
      expect(res.message).toMatch(/age-restricted/i);
    });

    it('handles node network failure gracefully', async () => {
      vi.spyOn(lavalinkService, 'getNode').mockImplementation(() => {
        throw new Error('All nodes offline');
      });

      const res = await resolveInput('https://www.youtube.com/watch?v=test');
      expect(res.type).toBe('error');
      expect(res.message).toMatch(/Audio server is currently unavailable/i);
    });
  });

  describe('YouTube Fallback & Resilience', () => {
    it('recovers via YouTube Music when standard YouTube URL returns LoadType.ERROR', async () => {
      const mockTrack = createMockTrack('Tere Bin', 'Rabbi Shergil');
      const resolveMock = vi.fn().mockImplementation((targetUrl: string) => {
        if (targetUrl === 'https://www.youtube.com/watch?v=5VaqiH1QMTw') {
          return Promise.resolve({
            loadType: LoadType.ERROR,
            data: {
              message: 'Client [WEB] failed: This video requires login',
              severity: 'suspicious',
              cause: 'login_required',
            },
          });
        }
        if (targetUrl === 'https://music.youtube.com/watch?v=5VaqiH1QMTw') {
          return Promise.resolve({
            loadType: LoadType.TRACK,
            data: mockTrack,
          });
        }
        return Promise.resolve({ loadType: LoadType.EMPTY, data: {} });
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      const res = await resolveInput('https://www.youtube.com/watch?v=5VaqiH1QMTw');
      expect(res.type).toBe('track');
      if (res.type === 'track') {
        expect(res.track.title).toBe('Tere Bin');
        expect(res.track.author).toBe('Rabbi Shergil');
      }
      expect(resolveMock).toHaveBeenCalledWith('https://www.youtube.com/watch?v=5VaqiH1QMTw');
      expect(resolveMock).toHaveBeenCalledWith('https://music.youtube.com/watch?v=5VaqiH1QMTw');
    });

    it('falls back to oEmbed metadata and search when both direct URL and YouTube Music fail', async () => {
      const mockFoundTrack = createMockTrack('Taare', 'Farak');
      const resolveMock = vi.fn().mockImplementation((targetUrl: string) => {
        if (targetUrl.includes('ytmsearch:')) {
          return Promise.resolve({
            loadType: LoadType.SEARCH,
            data: [mockFoundTrack],
          });
        }
        return Promise.resolve({
          loadType: LoadType.ERROR,
          data: {
            message: 'All clients failed to load the item',
            severity: 'fault',
            cause: 'all_clients_failed',
          },
        });
      });

      const mockNode = {
        rest: { resolve: resolveMock },
      } as unknown as Node;

      vi.spyOn(lavalinkService, 'getNode').mockReturnValue(mockNode);

      // Mock global fetch for oEmbed
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Farak - Taare | Official Music Video |',
          author_name: 'Farak',
        }),
      } as unknown as Response);

      const res = await resolveInput('https://www.youtube.com/watch?v=U0EI7XFkkV4');
      expect(res.type).toBe('track');
      if (res.type === 'track') {
        expect(res.track.title).toBe('Taare');
      }
    });
  });
});

