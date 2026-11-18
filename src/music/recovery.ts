import { LoadType } from 'shoukaku';
import { type GuildPlayer } from './player.js';
import { type QueuedTrack } from './queue.js';
import { classifyError } from './classifier.js';
import { circuitBreaker } from './circuitBreaker.js';
import { nodeHealthTracker } from '../lavalink/nodeHealthTracker.js';
import { lavalinkService } from '../lavalink/service.js';
import { cleanVideoTitle, resolveInput } from './resolver.js';
import { normalizeTrack, type ResolvedTrack } from './types.js';
import { childLogger } from '../core/logger.js';
import { infoEmbed, warningEmbed } from '../utils/embed.js';
import { type TextBasedChannel } from 'discord.js';

const log = childLogger('music/recovery');

interface TrackRetryState {
  sameSourceRetries: number;
  alternateSourceRetries: number;
  migratedToResidential: boolean;
}

// In-memory sliding map of retry counts per guild & track identifier
const retryTracker = new Map<string, TrackRetryState>();

function getRetryKey(guildId: string, identifier: string): string {
  return `${guildId}:${identifier}`;
}

/**
 * Robust failure recovery handler for trackException and trackStuck events.
 *
 * Requirements enforced:
 * 1. Error classification & health signals (bot detection, 429, SABR, region block).
 * 2. Node health tracking: repeated bot checks flag node as "degraded for YouTube".
 * 3. Circuit breaker: consecutive source failures trip breaker and promote SoundCloud.
 * 4. Hetzner-to-Residential failover: if failure occurred on Hetzner, retries on residential node.
 * 5. Multi-source fallback: searches title and artist on next available fallback source.
 * 6. Hard retry caps (max 1 same-source, max 1 alternate-source): queue ALWAYS advances.
 *
 * @returns true if playback was restarted with a retry/mirror track; false if skipped to next queue item.
 */
export async function handleTrackFailure(
  player: GuildPlayer,
  queuedTrack: QueuedTrack,
  failure: { type: 'exception' | 'stuck'; message: string; exception?: unknown },
): Promise<boolean> {
  const guildId = player.guildId;
  const track = queuedTrack.track;
  const retryKey = getRetryKey(guildId, track.identifier);

  let retryState = retryTracker.get(retryKey);
  if (!retryState) {
    retryState = {
      sameSourceRetries: 0,
      alternateSourceRetries: 0,
      migratedToResidential: false,
    };
    retryTracker.set(retryKey, retryState);
  }

  // 1. Classify the error
  const classified = classifyError(failure.message);

  log.warn(
    {
      guildId,
      trackTitle: track.title,
      source: track.sourceName,
      category: classified.category,
      error: failure.message,
      retries: retryState,
    },
    'Handling track playback failure',
  );

  // 2. Update Circuit Breaker & Node Health Signals
  circuitBreaker.recordFailure(track.sourceName);

  // Use Shoukaku internal node property on the player
  const currentNodeName = (player as unknown as { player: { node: { name: string } } }).player?.node?.name;
  if (currentNodeName && classified.isNodeDegrading) {
    nodeHealthTracker.recordYouTubeFailure(currentNodeName);
  }

  // ── Step A: Hetzner to Residential Failover ──────────────────────────────────
  // If failed on primary Hetzner node and residential node is healthy and not degraded:
  if (!retryState.migratedToResidential && classified.isRetryableOnAlternateNode) {
    try {
      const residentialNode = lavalinkService.getNode('residential');
      if (residentialNode && residentialNode.name !== currentNodeName) {
        retryState.migratedToResidential = true;
        log.info(
          { guildId, fromNode: currentNodeName, toNode: residentialNode.name, track: track.title },
          'Failing load on primary node — migrating player to residential node and retrying',
        );

        notifyPlayerChannel(
          player,
          'Connection interrupted on primary node. Retrying playback through residential node...',
        );

        // Move player to residential node
        const moved = await (player as unknown as { player: { move(name: string): Promise<boolean> } }).player.move(residentialNode.name);
        if (moved) {
          // Restart track on the new node
          await (player as unknown as { player: { playTrack(opt: unknown): Promise<void> } }).player.playTrack({
            track: { encoded: track.encoded },
          });
          return true;
        }
      }
    } catch {
      // Residential node was not available; continue to next fallback steps
    }
  }

  // ── Step B: Retry Once on Same Source ───────────────────────────────────────
  // Do NOT retry on the same source if the failure is bot_detection:
  // if YouTube blocked this IP/client, an immediate identical retry will always fail.
  if (
    retryState.sameSourceRetries < 1 &&
    classified.isRetryableOnAlternateNode &&
    classified.category !== 'bot_detection'
  ) {
    retryState.sameSourceRetries++;
    log.info(
      { guildId, track: track.title, retryCount: retryState.sameSourceRetries },
      'Retrying track once on same source...',
    );

    try {
      await player.player.playTrack({
        track: { encoded: track.encoded },
      });
      return true;
    } catch (retryErr) {
      log.warn({ guildId, err: retryErr }, 'Same-source retry failed');
    }
  }

  // ── Step C: Multi-Source Fallback (Mirror Resolution) ───────────────────────
  if (retryState.alternateSourceRetries < 1 && classified.isRetryableOnAlternateSource) {
    retryState.alternateSourceRetries++;
    const cleanTitle = cleanVideoTitle(track.title);
    const isChannelAuthor = /(?:music|official|records|series|channel|vevo|entertainment|label|t-series|tips|sony|zee)/i.test(track.author);
    const fallbackQuery = isChannelAuthor || !track.author ? cleanTitle : `${cleanTitle} ${track.author}`.trim();

    log.info(
      { guildId, query: fallbackQuery, originalSource: track.sourceName },
      'Searching alternate source for mirror track...',
    );

    notifyPlayerChannel(
      player,
      `Track unavailable on ${track.sourceName}. Searching for an alternate audio source...`,
    );

    try {
      let mirrorTrack: ResolvedTrack | null = null;
      const isYouTubeSource =
        track.sourceName === 'youtube' ||
        track.sourceName.toLowerCase().includes('youtube');

      // When YouTube fails, query SoundCloud directly to guarantee an actual alternative source is used
      if (isYouTubeSource) {
        try {
          const node = lavalinkService.getNode('default');
          const scRes = await node.rest.resolve(`scsearch:${fallbackQuery}`);
          if (
            scRes &&
            scRes.loadType === LoadType.SEARCH &&
            Array.isArray(scRes.data) &&
            scRes.data.length > 0
          ) {
            mirrorTrack = normalizeTrack(scRes.data[0]!);
          }
        } catch (scErr) {
          log.debug({ guildId, fallbackQuery, scErr }, 'Direct SoundCloud search failed');
        }

        // Try cleanTitle alone on SoundCloud if query with author returned nothing
        if (!mirrorTrack && fallbackQuery !== cleanTitle) {
          try {
            const node = lavalinkService.getNode('default');
            const scRes2 = await node.rest.resolve(`scsearch:${cleanTitle}`);
            if (
              scRes2 &&
              scRes2.loadType === LoadType.SEARCH &&
              Array.isArray(scRes2.data) &&
              scRes2.data.length > 0
            ) {
              mirrorTrack = normalizeTrack(scRes2.data[0]!);
            }
          } catch {
            // non-fatal
          }
        }
      }

      // If not from SoundCloud or SoundCloud search was empty, try resolveInput excluding YouTube
      if (!mirrorTrack) {
        const mirrorResult = await resolveInput(cleanTitle, { guildId });
        if (mirrorResult.type === 'search' && mirrorResult.tracks.length > 0) {
          const alt = mirrorResult.tracks.find(
            (t) => !t.sourceName.toLowerCase().includes('youtube'),
          );

          // For YouTube-origin failures, NEVER accept another YouTube result.
          // If no non-YouTube mirror exists, we skip so queue can progress cleanly.
          if (isYouTubeSource) {
            mirrorTrack = alt ?? null;
          } else {
            mirrorTrack = alt ?? mirrorResult.tracks[0]!;
          }
        }
      }

      if (mirrorTrack) {
        log.info(
          {
            guildId,
            originalTrack: track.title,
            mirrorTrack: mirrorTrack.title,
            newSource: mirrorTrack.sourceName,
          },
          'Found alternate mirror track — playing replacement',
        );

        // Update player's active track in queue
        player.queue.current = {
          track: mirrorTrack,
          requesterId: queuedTrack.requesterId,
          requestedAt: queuedTrack.requestedAt,
        };

        await player.player.playTrack({
          track: { encoded: mirrorTrack.encoded },
        });

        notifyPlayerChannel(
          player,
          `Playing alternate source: **${mirrorTrack.title}** by ${mirrorTrack.author} (${mirrorTrack.sourceName}).`,
        );

        return true;
      }

      if (isYouTubeSource) {
        log.warn(
          { guildId, query: fallbackQuery },
          'No non-YouTube mirror found for YouTube playback failure; skipping track',
        );
      }
    } catch (mirrorErr) {
      log.warn({ guildId, err: mirrorErr }, 'Alternate mirror search failed');
    }
  }

  // ── Step D: Retries Exhausted — Advance Queue ────────────────────────────────
  retryTracker.delete(retryKey);

  log.warn(
    { guildId, trackTitle: track.title, author: track.author },
    'All retry and fallback mechanisms exhausted — skipping track to advance queue',
  );

  notifyPlayerChannel(
    player,
    `Skipped **${track.title}**: ${classified.userMessage}`,
  );

  // Return false: GuildPlayer will advance to the next track. The queue NEVER hangs.
  return false;
}

function notifyPlayerChannel(player: GuildPlayer, message: string): void {
  try {
    const channel = player.client.channels.cache.get(player.textChannelId) as TextBasedChannel | undefined;
    if (channel && 'send' in channel) {
      void channel.send({ embeds: [warningEmbed(message)] }).catch(() => undefined);
    }
  } catch {
    // Non-fatal
  }
}

