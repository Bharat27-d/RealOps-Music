// ─── Error Classification Types ──────────────────────────────────────────────

export type ErrorCategory =
  | 'bot_detection'
  | 'rate_limited'
  | 'age_restricted'
  | 'region_blocked'
  | 'private_track'
  | 'sabr_unplayable'
  | 'no_results'
  | 'node_down'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  /** Whether this error indicates the Lavalink node itself is degraded for YouTube */
  isNodeDegrading: boolean;
  /** Whether retrying on another node (e.g. residential) might succeed */
  isRetryableOnAlternateNode: boolean;
  /** Whether retrying by searching a different source (e.g. SoundCloud) might succeed */
  isRetryableOnAlternateSource: boolean;
  /** Concise, non-technical explanation for users */
  userMessage: string;
}

/**
 * Classifies audio streaming exceptions into actionable error categories.
 */
export function classifyError(raw: unknown): ClassifiedError {
  const message =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
        ? raw
        : typeof raw === 'object' && raw !== null && 'message' in raw
          ? String((raw as { message: unknown }).message)
          : String(raw);

  const lower = message.toLowerCase();

  // ── 1. YouTube Bot Detection & Proof-of-Origin Challenge ───────────────────
  if (
    lower.includes('sign in to confirm') ||
    lower.includes('confirm you’re not a bot') ||
    lower.includes('confirm you\'re not a bot') ||
    lower.includes('bot detection') ||
    lower.includes('account has been terminated') ||
    lower.includes('action required')
  ) {
    return {
      category: 'bot_detection',
      isNodeDegrading: true,
      isRetryableOnAlternateNode: true,
      isRetryableOnAlternateSource: true,
      userMessage:
        'YouTube requested a bot verification check. Attempting failover to alternate source...',
    };
  }

  // ── 2. Rate Limiting (HTTP 429) ─────────────────────────────────────────────
  if (lower.includes('429') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return {
      category: 'rate_limited',
      isNodeDegrading: true,
      isRetryableOnAlternateNode: true,
      isRetryableOnAlternateSource: true,
      userMessage: 'Streaming service rate limit reached. Retrying via alternative source...',
    };
  }

  // ── 3. Age-Restricted Content ───────────────────────────────────────────────
  if (
    lower.includes('age restricted') ||
    lower.includes('age-restricted') ||
    lower.includes('requires adult authorization')
  ) {
    return {
      category: 'age_restricted',
      isNodeDegrading: false,
      isRetryableOnAlternateNode: false,
      isRetryableOnAlternateSource: true, // Another source (e.g. SoundCloud) might have clean audio
      userMessage:
        'This track is age-restricted on the source. Attempting alternate source lookup...',
    };
  }

  // ── 4. Geographic / Region Blocking ─────────────────────────────────────────
  if (
    lower.includes('not available in your country') ||
    lower.includes('not available in this country') ||
    lower.includes('geo restricted') ||
    lower.includes('geographic restriction')
  ) {
    return {
      category: 'region_blocked',
      isNodeDegrading: false,
      isRetryableOnAlternateNode: true,
      isRetryableOnAlternateSource: true,
      userMessage:
        'This track is geographically restricted in this region. Trying alternate source...',
    };
  }

  // ── 5. Private / Deleted Track ──────────────────────────────────────────────
  if (
    lower.includes('private') ||
    lower.includes('removed') ||
    lower.includes('deleted') ||
    lower.includes('unavailable')
  ) {
    return {
      category: 'private_track',
      isNodeDegrading: false,
      isRetryableOnAlternateNode: false,
      isRetryableOnAlternateSource: true,
      userMessage: 'This track is private or has been removed from the source.',
    };
  }

  // ── 6. SABR / Missing Playable Audio Stream ─────────────────────────────────
  if (
    lower.includes('sabr') ||
    lower.includes('no playable stream') ||
    lower.includes('audio stream not found') ||
    lower.includes('format 18') ||
    lower.includes('cipher')
  ) {
    return {
      category: 'sabr_unplayable',
      isNodeDegrading: false,
      isRetryableOnAlternateNode: true,
      isRetryableOnAlternateSource: true,
      userMessage: 'Could not extract playable audio stream. Switching to fallback source...',
    };
  }

  // ── 7. Node / Network Unreachable ───────────────────────────────────────────
  if (
    lower.includes('connection refused') ||
    lower.includes('econnrefused') ||
    lower.includes('etimedout') ||
    lower.includes('no healthy lavalink nodes')
  ) {
    return {
      category: 'node_down',
      isNodeDegrading: true,
      isRetryableOnAlternateNode: true,
      isRetryableOnAlternateSource: false,
      userMessage: 'Audio connection node was interrupted. Migrating to secondary node...',
    };
  }

  // ── 8. No Results ───────────────────────────────────────────────────────────
  if (lower.includes('no results') || lower.includes('empty result')) {
    return {
      category: 'no_results',
      isNodeDegrading: false,
      isRetryableOnAlternateNode: false,
      isRetryableOnAlternateSource: true,
      userMessage: 'No matching playable audio found.',
    };
  }

  // ── Default / Unknown ───────────────────────────────────────────────────────
  return {
    category: 'unknown',
    isNodeDegrading: false,
    isRetryableOnAlternateNode: true,
    isRetryableOnAlternateSource: true,
    userMessage: 'An audio stream error occurred. Attempting fallback recovery...',
  };
}
