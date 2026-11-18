import { type GuildPlayer } from './player.js';
import { type QueuedTrack } from './queue.js';
import { classifyError } from './classifier.js';
import { circuitBreaker } from './circuitBreaker.js';
import { nodeHealthTracker } from '../lavalink/nodeHealthTracker.js';
import { lavalinkService } from '../lavalink/service.js';
import { resolveInput } from './resolver.js';
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
  if (retryState.sameSourceRetries < 1 && classified.isRetryableOnAlternateNode) {
    retryState.sameSourceRetries++;
    log.info(
      { guildId, track: track.title, retryCount: retryState.sameSourceRetries },
      'Retrying track once on same source...',
    );

    try {
      await (player as unknown as { player: { playTrack(opt: unknown): Promise<void> } }).player.playTrack({
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
    const fallbackQuery = `${track.title} ${track.author}`.trim();

    log.info(
      { guildId, query: fallbackQuery, originalSource: track.sourceName },
      'Searching alternate source for mirror track...',
    );

    notifyPlayerChannel(
      player,
      `Track unavailable on ${track.sourceName}. Searching for an alternate audio source...`,
    );

    try {
      // Resolve query using circuit-breaker-aware search (SoundCloud prioritized if YouTube breaker open)
      const mirrorResult = await resolveInput(fallbackQuery, { guildId });

      if (mirrorResult.type === 'search' && mirrorResult.tracks.length > 0) {
        const mirrorTrack = mirrorResult.tracks[0]!;
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

        await (player as unknown as { player: { playTrack(opt: unknown): Promise<void> } }).player.playTrack({
          track: { encoded: mirrorTrack.encoded },
        });

        notifyPlayerChannel(
          player,
          `Playing alternate source: **${mirrorTrack.title}** by ${mirrorTrack.author} (${mirrorTrack.sourceName}).`,
        );

        return true;
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
    const client = (player as unknown as { client: { channels: { cache: Map<string, unknown> } } }).client;
    const channel = client.channels.cache.get(player.textChannelId) as TextBasedChannel | undefined;
    if (channel && 'send' in channel) {
      void channel.send({ embeds: [warningEmbed(message)] }).catch(() => undefined);
    }
  } catch {
    // Non-fatal
  }
}

