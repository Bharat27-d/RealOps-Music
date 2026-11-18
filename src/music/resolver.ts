import { LoadType, type LavalinkResponse } from 'shoukaku';
import { env } from '../config/env.js';
import { childLogger } from '../core/logger.js';
import { lavalinkService } from '../lavalink/index.js';
import { type NodePreference } from '../lavalink/types.js';
import { isPossibleUrl, validateAndNormalizeUrl, type UrlSourceType } from './url.js';
import { circuitBreaker } from './circuitBreaker.js';
import {
  type ResolveResult,
  type ResolveOptions,
  normalizeTrack,
} from './types.js';

const log = childLogger('music/resolver');

// ─── Search prefix fallback order for plain-text queries ──────────────────────
const SEARCH_FALLBACK_ORDER: Array<{ prefix: string; preference: NodePreference; name: string }> = [
  { prefix: 'ytmsearch:', preference: 'youtube', name: 'YouTube Music' },
  { prefix: 'ytsearch:', preference: 'youtube', name: 'YouTube' },
  { prefix: 'scsearch:', preference: 'default', name: 'SoundCloud' },
];

/**
 * Extracts a YouTube video ID from various YouTube URL formats.
 */
export function extractYouTubeVideoId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return v;
      const shorts = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shorts && shorts[1]) return shorts[1];
    }
  } catch {
    // Malformed URL string
  }
  return null;
}

/**
 * Extracts a YouTube playlist ID from a URL.
 */
export function extractYouTubePlaylistId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('list');
    }
  } catch {
    // Malformed URL string
  }
  return null;
}

/**
 * Strips common boilerplate video suffixes (e.g. "(Official Video)") to improve search match accuracy.
 */
export function cleanVideoTitle(rawTitle: string): string {
  // Take part before first pipe if pipes are used for credits/movie names
  const baseTitle = rawTitle.includes('|') ? rawTitle.split('|')[0]!.trim() : rawTitle;

  return baseTitle
    .replace(/\[[^\]]*\]/gi, '')
    .replace(/\([^)]*(?:official|lyrics?|audio|video|hd|4k|mv|visualizer|remix|edit)[^)]*\)/gi, '')
    .replace(/\(from\s+[^)]*\)/gi, '')
    // Strip common standalone suffix keywords that break SoundCloud searches
    .replace(/\b(?:lyrical?|official|audio only|full\s*song|full\s*video|title\s*track|hd|4k)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Fetches public video metadata (title, author) via YouTube's official oEmbed endpoint.
 * This public endpoint requires zero credentials, never blocks cloud IPs, and is free of bot challenges.
 */
export async function fetchYouTubeMetadataViaOEmbed(
  url: string,
): Promise<{ title: string; author: string } | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(3000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RealOpsMusic/1.0',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    if (data.title) {
      return {
        title: data.title,
        author: data.author_name || '',
      };
    }
  } catch (err) {
    log.debug({ url, err }, 'Failed to fetch YouTube oEmbed metadata');
  }
  return null;
}

/**
 * Resolves user input into a normalized playback result.
 * Supports YouTube, YouTube Music, Spotify, SoundCloud, Apple Music, direct audio URLs,
 * and multi-source plain-text searches with automatic fallback.
 *
 * @param query The input string from a slash command (URL or search text)
 * @param options Configuration options (guildId, userId, maxPlaylistTracks)
 */
export async function resolveInput(
  query: string,
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const trimmed = query.trim();
  const guildId = options.guildId;
  const maxPlaylistTracks = options.maxPlaylistTracks ?? env.MAX_PLAYLIST_TRACKS;

  if (!trimmed) {
    return {
      type: 'empty',
      message: 'Search query or URL cannot be empty.',
    };
  }

  // ── 1. Check if input is a URL ──────────────────────────────────────────────
  if (isPossibleUrl(trimmed)) {
    const urlValidation = validateAndNormalizeUrl(trimmed);

    // If string looks like a URL but is malformed or not on the allowlist
    if (!urlValidation.isValid) {
      log.warn(
        { guildId, query: trimmed, reason: urlValidation.errorMessage },
        'URL rejected by allowlist validation',
      );
      return {
        type: 'error',
        message:
          urlValidation.errorMessage ||
          'Unsupported URL. Supported sources: YouTube, YouTube Music, Spotify, SoundCloud, Apple Music, or direct audio links.',
      };
    }

    const { canonicalUrl, sourceType } = urlValidation.validated!;
    const preference: NodePreference = sourceType === 'youtube' ? 'youtube' : 'default';

    log.debug(
      { guildId, input: trimmed, canonicalUrl, sourceType, preference },
      'Resolving validated URL via Lavalink...',
    );

    return resolveUrl(canonicalUrl, preference, maxPlaylistTracks, guildId, sourceType);
  }

  // ── 2. Plain-Text Search with Fallback Chain ────────────────────────────────
  log.debug(
    { guildId, query: trimmed },
    'Resolving plain-text query through multi-source fallback chain...',
  );

  return resolveSearchWithFallback(trimmed, guildId);
}

// ─── Resolve URL Handler ──────────────────────────────────────────────────────

async function resolveUrl(
  url: string,
  preference: NodePreference,
  maxPlaylistTracks: number,
  guildId?: string,
  sourceType?: UrlSourceType,
): Promise<ResolveResult> {
  let response: LavalinkResponse | undefined;

  try {
    const node = lavalinkService.getNode(preference);
    response = await node.rest.resolve(url);
  } catch (err) {
    log.error({ guildId, url, preference, err }, 'Failed to communicate with Lavalink node');
    return {
      type: 'error',
      message: 'Audio server is currently unavailable. Please try again shortly.',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }

  if (!response) {
    return {
      type: 'empty',
      message: 'No response received from audio server.',
    };
  }

  switch (response.loadType) {
    case LoadType.TRACK: {
      const track = normalizeTrack(response.data);
      log.info(
        { guildId, title: track.title, author: track.author, source: track.sourceName },
        'Resolved track URL',
      );
      return {
        type: 'track',
        track,
      };
    }

    case LoadType.PLAYLIST: {
      const rawTracks = response.data.tracks;

      if (!rawTracks || rawTracks.length === 0) {
        log.warn({ guildId, url }, 'Playlist returned zero playable tracks');
        return {
          type: 'empty',
          message: 'This playlist is empty, private, or contains no playable tracks.',
        };
      }

      // Cap playlist tracks to configured limit
      const cappedTracks = rawTracks.slice(0, maxPlaylistTracks).map(normalizeTrack);
      const totalDuration = cappedTracks.reduce((acc, t) => acc + t.duration, 0);

      log.info(
        {
          guildId,
          playlistName: response.data.info.name,
          totalReturned: rawTracks.length,
          cappedTo: cappedTracks.length,
        },
        'Resolved playlist URL',
      );

      return {
        type: 'playlist',
        playlist: {
          name: response.data.info.name || 'Untitled Playlist',
          selectedTrackIndex: response.data.info.selectedTrack ?? -1,
          tracks: cappedTracks,
          totalDuration,
          uri: url,
        },
      };
    }

    case LoadType.SEARCH: {
      // Direct URL resulted in search results
      if (!response.data || response.data.length === 0) {
        return {
          type: 'empty',
          message: 'No tracks found for this link.',
        };
      }

      const tracks = response.data.map(normalizeTrack);
      return {
        type: 'search',
        tracks,
      };
    }

    case LoadType.EMPTY: {
      log.warn({ guildId, url }, 'Lavalink returned empty result for URL');

      // Attempt fallback if it's a YouTube URL that returned empty (e.g. cloud IP blocked)
      if (sourceType === 'youtube') {
        const recovered = await fallbackResolveYouTubeUrl(url, maxPlaylistTracks, guildId);
        if (recovered) {
          return recovered;
        }
      }

      return {
        type: 'empty',
        message: 'No playable audio found at this link. It may be deleted or private.',
      };
    }

    case LoadType.ERROR: {
      const exc = response.data;
      log.error({ guildId, url, exception: exc }, 'Lavalink returned load error for URL');

      // Attempt fallback if YouTube non-music clients failed on datacenter IP
      if (sourceType === 'youtube') {
        const recovered = await fallbackResolveYouTubeUrl(url, maxPlaylistTracks, guildId);
        if (recovered) {
          return recovered;
        }
      }

      return {
        type: 'error',
        message: mapFriendlyErrorMessage(exc.message),
        error: new Error(exc.message),
      };
    }

    default:
      return {
        type: 'empty',
        message: 'Could not resolve audio at this link.',
      };
  }
}

// ─── YouTube Fallback Resolver ────────────────────────────────────────────────

/**
 * Resilient fallback resolver for YouTube URLs when Lavalink's standard NonMusic client
 * encounters datacenter IP blocks or bot-detection restrictions.
 *
 * Sequence:
 * 1. For playlists: tries music.youtube.com/playlist?list=... (uses WEB_REMIX client)
 * 2. For tracks: tries music.youtube.com/watch?v=... (uses WEB_REMIX client)
 * 3. Extracts metadata via official YouTube oEmbed API and falls back to multi-source search.
 */
async function fallbackResolveYouTubeUrl(
  url: string,
  maxPlaylistTracks: number,
  guildId?: string,
): Promise<ResolveResult | null> {
  const videoId = extractYouTubeVideoId(url);
  const playlistId = extractYouTubePlaylistId(url);

  // 1. If it's a playlist, try YouTube Music playlist URL (WEB_REMIX client bypasses NonMusic blocks)
  if (playlistId) {
    const ytmPlaylistUrl = `https://music.youtube.com/playlist?list=${playlistId}`;
    if (url !== ytmPlaylistUrl) {
      try {
        log.info({ guildId, playlistId }, 'Attempting YouTube Music playlist fallback');
        const node = lavalinkService.getNode('youtube');
        const ytmRes = await node.rest.resolve(ytmPlaylistUrl);
        if (ytmRes && ytmRes.loadType === LoadType.PLAYLIST && ytmRes.data.tracks?.length > 0) {
          const rawTracks = ytmRes.data.tracks;
          const cappedTracks = rawTracks.slice(0, maxPlaylistTracks).map(normalizeTrack);
          log.info({ guildId, playlistId, count: cappedTracks.length }, 'Successfully recovered playlist via YouTube Music');
          return {
            type: 'playlist',
            playlist: {
              name: ytmRes.data.info.name || 'YouTube Music Playlist',
              selectedTrackIndex: ytmRes.data.info.selectedTrack ?? -1,
              tracks: cappedTracks,
              totalDuration: cappedTracks.reduce((acc, t) => acc + t.duration, 0),
              uri: ytmPlaylistUrl,
            },
          };
        }
      } catch (err) {
        log.debug({ guildId, playlistId, err }, 'YouTube Music playlist fallback failed');
      }
    }
  }

  // 2. If it's a single track, try YouTube Music direct URL (uses WEB_REMIX client)
  if (videoId) {
    const ytmTrackUrl = `https://music.youtube.com/watch?v=${videoId}`;
    if (url !== ytmTrackUrl) {
      try {
        log.info({ guildId, videoId }, 'Attempting YouTube Music direct track fallback');
        const node = lavalinkService.getNode('youtube');
        const ytmRes = await node.rest.resolve(ytmTrackUrl);
        if (ytmRes) {
          if (ytmRes.loadType === LoadType.TRACK) {
            const track = normalizeTrack(ytmRes.data);
            log.info({ guildId, title: track.title, source: 'ytm' }, 'Resolved track via YouTube Music fallback');
            return { type: 'track', track };
          }
          if (ytmRes.loadType === LoadType.SEARCH && ytmRes.data?.length > 0) {
            const track = normalizeTrack(ytmRes.data[0]!);
            log.info({ guildId, title: track.title, source: 'ytm' }, 'Resolved track via YouTube Music search fallback');
            return { type: 'track', track };
          }
        }
      } catch (err) {
        log.debug({ guildId, videoId, err }, 'YouTube Music direct track fallback failed');
      }
    }

    // 3. Fallback: Extract metadata via open YouTube oEmbed API and resolve via search fallback chain
    try {
      log.info({ guildId, url, videoId }, 'Attempting YouTube oEmbed metadata extraction fallback');
      const meta = await fetchYouTubeMetadataViaOEmbed(url);
      if (meta && meta.title) {
        const cleanTitle = cleanVideoTitle(meta.title);
        const searchQuery = meta.author ? `${cleanTitle} ${meta.author}` : cleanTitle;
        log.info(
          { guildId, url, videoId, oembedTitle: meta.title, searchQuery },
          'Retrieved oEmbed metadata — resolving via search fallback chain',
        );
        const searchResult = await resolveSearchWithFallback(searchQuery, guildId);
        if (searchResult.type === 'search' && searchResult.tracks.length > 0) {
          return {
            type: 'track',
            track: searchResult.tracks[0]!,
          };
        }
        if (searchResult.type === 'track') {
          return searchResult;
        }
      }
    } catch (err) {
      log.warn({ guildId, url, err }, 'YouTube oEmbed metadata fallback failed');
    }
  }

  return null;
}

// ─── Search Fallback Handler ──────────────────────────────────────────────────

async function resolveSearchWithFallback(
  query: string,
  guildId?: string,
): Promise<ResolveResult> {
  const errors: string[] = [];
  const providers = circuitBreaker.getOrderedSearchProviders();

  for (const provider of providers) {
    const fullQuery = `${provider.prefix}${query}`;

    try {
      const node = lavalinkService.getNode(provider.preference);
      const response = await node.rest.resolve(fullQuery);

      if (!response) {
        continue;
      }

      if (response.loadType === LoadType.SEARCH && response.data.length > 0) {
        const tracks = response.data.map(normalizeTrack);
        log.info(
          {
            guildId,
            query,
            provider: provider.name,
            resultCount: tracks.length,
            topResult: tracks[0]?.title,
          },
          'Search resolved successfully',
        );
        return {
          type: 'search',
          tracks,
        };
      }

      if (response.loadType === LoadType.TRACK) {
        const track = normalizeTrack(response.data);
        return {
          type: 'track',
          track,
        };
      }

      if (response.loadType === LoadType.ERROR) {
        log.warn(
          { guildId, query, provider: provider.name, error: response.data.message },
          'Search provider failed, falling back to next provider',
        );
        errors.push(`${provider.name}: ${response.data.message}`);
      }
    } catch (err) {
      log.warn(
        { guildId, query, provider: provider.name, err },
        'Search query threw error on node, trying next fallback',
      );
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log.warn({ guildId, query, errors }, 'All search providers exhausted with zero results');

  return {
    type: 'empty',
    message: `No search results found for "${query}" across YouTube Music, YouTube, and SoundCloud.`,
  };
}

// ─── User-Friendly Error Mapping ──────────────────────────────────────────────

function mapFriendlyErrorMessage(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();

  if (lower.includes('sign in to confirm') || lower.includes('bot')) {
    return 'YouTube requires authentication or has flagged this session. Retrying on alternate sources...';
  }
  if (lower.includes('age restricted') || lower.includes('age-restricted')) {
    return 'This video is age-restricted and cannot be played without verified credentials.';
  }
  if (lower.includes('private')) {
    return 'This track or playlist is private and cannot be accessed.';
  }
  if (lower.includes('not available') || lower.includes('country') || lower.includes('region')) {
    return 'This content is not available in the bot server’s geographic region.';
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return 'Streaming service rate limit reached. Please wait a moment before requesting again.';
  }
  if (lower.includes('requires login') || lower.includes('all clients failed')) {
    return 'This track could not be loaded directly from YouTube. Please try searching by song title.';
  }

  return 'Failed to load this track or playlist from the source.';
}


