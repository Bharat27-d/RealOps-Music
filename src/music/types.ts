import { type Track } from 'shoukaku';

// ─── Normalized Music Metadata Types ──────────────────────────────────────────

export interface ResolvedTrack {
  /** Base64-encoded track string used by Lavalink for playback */
  encoded: string;
  /** Source-specific identifier (e.g. YouTube video ID) */
  identifier: string;
  /** Track title */
  title: string;
  /** Artist / Creator / Author name */
  author: string;
  /** Duration in milliseconds (0 for live streams) */
  duration: number;
  /** Canonical web URL */
  uri: string;
  /** Thumbnail or album cover art URL if available */
  artworkUrl?: string | undefined;
  /** International Standard Recording Code if resolved */
  isrc?: string | undefined;
  /** Source manager name (e.g. youtube, spotify, soundcloud, http) */
  sourceName: string;
  /** Whether the audio is an indefinite live stream */
  isStream: boolean;
}

export interface ResolvedPlaylist {
  /** Playlist title or name */
  name: string;
  /** Index of selected track in the playlist (-1 if none selected) */
  selectedTrackIndex: number;
  /** Tracks in this playlist, capped to MAX_PLAYLIST_TRACKS */
  tracks: ResolvedTrack[];
  /** Total duration in milliseconds across all tracks */
  totalDuration: number;
  /** Canonical playlist web URL if available */
  uri?: string | undefined;
}

// ─── Normalized Resolver Output Discriminated Union ───────────────────────────

export interface TrackResolveResult {
  type: 'track';
  track: ResolvedTrack;
}

export interface PlaylistResolveResult {
  type: 'playlist';
  playlist: ResolvedPlaylist;
}

export interface SearchResolveResult {
  type: 'search';
  tracks: ResolvedTrack[];
}

export interface EmptyResolveResult {
  type: 'empty';
  message: string;
}

export interface ErrorResolveResult {
  type: 'error';
  message: string;
  error?: Error | undefined;
}

export type ResolveResult =
  | TrackResolveResult
  | PlaylistResolveResult
  | SearchResolveResult
  | EmptyResolveResult
  | ErrorResolveResult;

export interface ResolveOptions {
  /** Maximum number of tracks to load from a single playlist */
  maxPlaylistTracks?: number | undefined;
  /** Optional guild ID for structured logging */
  guildId?: string | undefined;
  /** Optional user ID of the requester */
  userId?: string | undefined;
}

/**
 * Converts a raw Shoukaku / Lavalink Track object to our consistent ResolvedTrack model.
 */
export function normalizeTrack(raw: Track): ResolvedTrack {
  return {
    encoded: raw.encoded,
    identifier: raw.info.identifier,
    title: raw.info.title || 'Unknown Title',
    author: raw.info.author || 'Unknown Artist',
    duration: raw.info.length > 0 ? raw.info.length : 0,
    uri: raw.info.uri || '',
    artworkUrl: raw.info.artworkUrl,
    isrc: raw.info.isrc,
    sourceName: raw.info.sourceName || 'unknown',
    isStream: raw.info.isStream ?? false,
  };
}
