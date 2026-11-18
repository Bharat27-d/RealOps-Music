// ─── Tracking parameters to strip across all URLs ─────────────────────────────
const COMMON_TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'ref',
  'source',
]);

const YOUTUBE_TRACKING_PARAMS = new Set([
  'si',
  'feature',
  'pp',
  'src',
  'ab_channel',
  'attr_tag',
  'kw',
  'feed',
]);

const SOUNDCLOUD_TRACKING_PARAMS = new Set(['si', 'utm_source', 'utm_medium', 'ref']);

const AUDIO_EXTENSIONS_REGEX = /\.(mp3|ogg|flac|wav|aac|m4a|opus)(\?.*)?$/i;

// ─── Supported Domain Classifications ─────────────────────────────────────────

export type UrlSourceType =
  | 'youtube'
  | 'spotify'
  | 'soundcloud'
  | 'applemusic'
  | 'direct_audio';

export interface ValidatedUrl {
  canonicalUrl: string;
  sourceType: UrlSourceType;
  isPlaylist: boolean;
}

export interface UrlValidationResult {
  isUrl: boolean;
  isValid: boolean;
  validated?: ValidatedUrl | undefined;
  errorMessage?: string | undefined;
}

/**
 * Checks whether an input string is intended to be a URL (vs a search query).
 */
export function isPossibleUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }
  // Check common domain prefixes entered without http://
  if (
    /^(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com|open\.spotify\.com|spotify\.link|soundcloud\.com|music\.apple\.com)\//i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Validates, normalizes, and strips tracking parameters from a URL.
 * Enforces strict allowlist of supported audio sources.
 */
export function validateAndNormalizeUrl(input: string): UrlValidationResult {
  const trimmed = input.trim();

  let parsed: URL;
  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
    const urlString = hasScheme ? trimmed : `https://${trimmed}`;
    parsed = new URL(urlString);
  } catch {
    return {
      isUrl: false,
      isValid: false,
    };
  }

  // Must have a valid HTTP/HTTPS protocol
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      isUrl: true,
      isValid: false,
      errorMessage: 'Invalid protocol. Only HTTP and HTTPS URLs are supported.',
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

  // ── 1. YouTube & YouTube Music ──────────────────────────────────────────────
  if (
    hostname === 'youtube.com' ||
    hostname === 'm.youtube.com' ||
    hostname === 'music.youtube.com' ||
    hostname === 'youtu.be'
  ) {
    return handleYouTubeUrl(parsed, hostname);
  }

  // ── 2. Spotify ──────────────────────────────────────────────────────────────
  if (
    hostname === 'open.spotify.com' ||
    hostname === 'spotify.link' ||
    hostname === 'spotify.app.link'
  ) {
    return handleSpotifyUrl(parsed, hostname);
  }

  // ── 3. SoundCloud ───────────────────────────────────────────────────────────
  if (
    hostname === 'soundcloud.com' ||
    hostname === 'm.soundcloud.com' ||
    hostname === 'on.soundcloud.com'
  ) {
    return handleSoundCloudUrl(parsed);
  }

  // ── 4. Apple Music ──────────────────────────────────────────────────────────
  if (hostname === 'music.apple.com') {
    return handleAppleMusicUrl(parsed);
  }

  // ── 5. Direct Audio URLs ────────────────────────────────────────────────────
  if (AUDIO_EXTENSIONS_REGEX.test(parsed.pathname)) {
    // Strip common tracking parameters from direct audio URLs
    stripParams(parsed.searchParams, COMMON_TRACKING_PARAMS);
    return {
      isUrl: true,
      isValid: true,
      validated: {
        canonicalUrl: parsed.toString(),
        sourceType: 'direct_audio',
        isPlaylist: false,
      },
    };
  }

  // ── Rejected URL (Not on allowlist) ─────────────────────────────────────────
  return {
    isUrl: true,
    isValid: false,
    errorMessage:
      'Unsupported URL. Supported sources: YouTube, YouTube Music, Spotify, SoundCloud, Apple Music, or direct audio links (.mp3, .flac, etc.).',
  };
}

// ─── Helpers per Source ───────────────────────────────────────────────────────

function handleYouTubeUrl(url: URL, hostname: string): UrlValidationResult {
  // Strip tracking parameters
  stripParams(url.searchParams, COMMON_TRACKING_PARAMS);
  stripParams(url.searchParams, YOUTUBE_TRACKING_PARAMS);

  // Shorts: /shorts/{id} -> /watch?v={id}
  const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch && shortsMatch[1]) {
    const videoId = shortsMatch[1];
    return {
      isUrl: true,
      isValid: true,
      validated: {
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        sourceType: 'youtube',
        isPlaylist: false,
      },
    };
  }

  // youtu.be/{id}
  if (hostname === 'youtu.be') {
    const videoId = url.pathname.replace(/^\//, '');
    if (!videoId) {
      return {
        isUrl: true,
        isValid: false,
        errorMessage: 'Invalid YouTube short link: missing video ID.',
      };
    }
    const searchPart = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
    return {
      isUrl: true,
      isValid: true,
      validated: {
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}${searchPart ? `&${url.searchParams.toString()}` : ''}`,
        sourceType: 'youtube',
        isPlaylist: url.searchParams.has('list'),
      },
    };
  }

  // Check if it's a playlist
  const isPlaylist =
    url.pathname.startsWith('/playlist') ||
    (url.searchParams.has('list') && !url.searchParams.has('v'));

  return {
    isUrl: true,
    isValid: true,
    validated: {
      canonicalUrl: url.toString(),
      sourceType: 'youtube',
      isPlaylist,
    },
  };
}

function handleSpotifyUrl(url: URL, hostname: string): UrlValidationResult {
  // For short links (spotify.link / spotify.app.link), pass cleanly
  if (hostname === 'spotify.link' || hostname === 'spotify.app.link') {
    return {
      isUrl: true,
      isValid: true,
      validated: {
        canonicalUrl: url.toString(),
        sourceType: 'spotify',
        isPlaylist: false,
      },
    };
  }

  // Normalize locale prefixes in pathname: e.g. /intl-fr/track/... or /intl-pt-br/album/...
  let cleanPath = url.pathname.replace(/^\/intl-[a-z]{2}(?:-[a-z]{2})?\//i, '/');

  // Ensure leading slash
  if (!cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }

  const isPlaylist = cleanPath.startsWith('/playlist/') || cleanPath.startsWith('/album/');

  // Spotify canonical URLs do not require query parameters (strip all tracking/context)
  const canonicalUrl = `https://open.spotify.com${cleanPath}`;

  return {
    isUrl: true,
    isValid: true,
    validated: {
      canonicalUrl,
      sourceType: 'spotify',
      isPlaylist,
    },
  };
}

function handleSoundCloudUrl(url: URL): UrlValidationResult {
  stripParams(url.searchParams, COMMON_TRACKING_PARAMS);
  stripParams(url.searchParams, SOUNDCLOUD_TRACKING_PARAMS);

  const isPlaylist = url.pathname.includes('/sets/');

  return {
    isUrl: true,
    isValid: true,
    validated: {
      canonicalUrl: url.toString(),
      sourceType: 'soundcloud',
      isPlaylist,
    },
  };
}

function handleAppleMusicUrl(url: URL): UrlValidationResult {
  stripParams(url.searchParams, COMMON_TRACKING_PARAMS);
  url.searchParams.delete('l');
  url.searchParams.delete('uo');
  url.searchParams.delete('app');

  const isPlaylist = url.pathname.includes('/playlist/') || url.pathname.includes('/album/');

  return {
    isUrl: true,
    isValid: true,
    validated: {
      canonicalUrl: url.toString(),
      sourceType: 'applemusic',
      isPlaylist,
    },
  };
}

function stripParams(params: URLSearchParams, keysToStrip: Set<string>): void {
  for (const key of [...params.keys()]) {
    if (keysToStrip.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      params.delete(key);
    }
  }
}
