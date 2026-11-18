import { LoadType, type LavalinkResponse } from 'shoukaku';
import { env } from '../config/env.js';
import { childLogger } from '../core/logger.js';
import { lavalinkService } from '../lavalink/index.js';
import { type NodePreference } from '../lavalink/types.js';
import { isPossibleUrl, validateAndNormalizeUrl } from './url.js';
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

    return resolveUrl(canonicalUrl, preference, maxPlaylistTracks, guildId);
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
      return {
        type: 'empty',
        message: 'No playable audio found at this link. It may be deleted or private.',
      };
    }

    case LoadType.ERROR: {
      const exc = response.data;
      log.error({ guildId, url, exception: exc }, 'Lavalink returned load error for URL');
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

  return 'Failed to load this track or playlist from the source.';
}

