import { EmbedBuilder, type APIEmbed } from 'discord.js';
import { formatDuration } from './time.js';
import { type ResolvedTrack, type ResolvedPlaylist } from '../music/types.js';
import { type QueuedTrack } from '../music/queue.js';
import { type NowPlayingInfo } from '../music/player.js';

// ─── Unified Color Palette ────────────────────────────────────────────────────
export const COLOURS = {
  primary: 0x5865f2, // Blurple — Now playing, playing track
  success: 0x57f287, // Green — Track added, successful operations
  warning: 0xfee75c, // Yellow — Queue limits, warnings
  error: 0xed4245, // Red — Errors, failures
  neutral: 0x2b2d31, // Dark — Queue list, metadata
} as const;

// ─── Basic Feedback Embeds ───────────────────────────────────────────────────

export function errorEmbed(message: string): APIEmbed {
  return new EmbedBuilder().setColor(COLOURS.error).setDescription(message).toJSON();
}

export function successEmbed(message: string): APIEmbed {
  return new EmbedBuilder().setColor(COLOURS.success).setDescription(message).toJSON();
}

export function infoEmbed(message: string): APIEmbed {
  return new EmbedBuilder().setColor(COLOURS.primary).setDescription(message).toJSON();
}

export function warningEmbed(message: string): APIEmbed {
  return new EmbedBuilder().setColor(COLOURS.warning).setDescription(message).toJSON();
}

// ─── Music Track & Playlist Embeds ────────────────────────────────────────────

/**
 * Embed displayed when a single track is added to the queue.
 */
export function trackAddedEmbed(track: ResolvedTrack, positionInQueue: number): APIEmbed {
  const embed = new EmbedBuilder()
    .setColor(COLOURS.success)
    .setTitle('Added to Queue')
    .setDescription(`[${track.title}](${track.uri})`)
    .addFields(
      { name: 'Author', value: track.author, inline: true },
      {
        name: 'Duration',
        value: track.isStream ? 'Live Stream' : formatDuration(track.duration),
        inline: true,
      },
      {
        name: 'Position in Queue',
        value: positionInQueue === 0 ? 'Up next' : `#${positionInQueue}`,
        inline: true,
      },
    );

  if (track.artworkUrl) {
    embed.setThumbnail(track.artworkUrl);
  }

  return embed.toJSON();
}

/**
 * Embed displayed when a playlist is added to the queue.
 */
export function playlistAddedEmbed(
  playlist: ResolvedPlaylist,
  addedCount: number,
  capped: boolean,
): APIEmbed {
  const embed = new EmbedBuilder()
    .setColor(COLOURS.success)
    .setTitle('Playlist Added to Queue')
    .setDescription(
      playlist.uri ? `[${playlist.name}](${playlist.uri})` : playlist.name,
    )
    .addFields(
      { name: 'Tracks Added', value: String(addedCount), inline: true },
      { name: 'Total Duration', value: formatDuration(playlist.totalDuration), inline: true },
    );

  if (capped) {
    embed.setFooter({
      text: 'Track count was capped by playlist or queue limit rules.',
    });
  }

  return embed.toJSON();
}

/**
 * Builds a visual ASCII progress bar for currently playing track.
 */
export function buildProgressBar(currentMs: number, totalMs: number, barSize = 15): string {
  if (totalMs <= 0) return '● LIVE';

  const progress = Math.max(0, Math.min(currentMs / totalMs, 1));
  const filledCount = Math.round(progress * barSize);
  const emptyCount = barSize - filledCount;

  const bar = '━'.repeat(filledCount) + '🔘' + '─'.repeat(Math.max(0, emptyCount - 1));
  return `${bar} \`[${formatDuration(currentMs)} / ${formatDuration(totalMs)}]\``;
}

/**
 * Now Playing embed layout.
 */
export function nowPlayingEmbed(info: NowPlayingInfo): APIEmbed {
  const progressBar = buildProgressBar(info.position, info.duration);

  const embed = new EmbedBuilder()
    .setColor(COLOURS.primary)
    .setTitle('Now Playing')
    .setDescription(`[${info.track.title}](${info.track.uri})\nBy ${info.track.author}\n\n${progressBar}`)
    .addFields(
      { name: 'Requested By', value: `<@${info.requesterId}>`, inline: true },
      { name: 'Volume', value: `${info.volume}%`, inline: true },
      {
        name: 'Loop Mode',
        value: info.loopMode === 'off' ? 'Off' : info.loopMode === 'track' ? 'Track' : 'Queue',
        inline: true,
      },
    );

  if (info.track.artworkUrl) {
    embed.setThumbnail(info.track.artworkUrl);
  }

  return embed.toJSON();
}

/**
 * Paginated queue embed layout.
 */
export function queueEmbed(
  current: QueuedTrack | null,
  waitingTracks: readonly QueuedTrack[],
  page: number,
  totalPages: number,
  totalDurationMs: number,
): APIEmbed {
  const embed = new EmbedBuilder()
    .setColor(COLOURS.neutral)
    .setTitle('Music Queue');

  if (current) {
    embed.addFields({
      name: 'Now Playing',
      value: `[${current.track.title}](${current.track.uri}) | \`${formatDuration(current.track.duration)}\` (Requested by <@${current.requesterId}>)`,
    });
  }

  if (waitingTracks.length === 0) {
    embed.setDescription(current ? 'No additional tracks in queue.' : 'Queue is completely empty.');
  } else {
    const lines = waitingTracks.map((item, index) => {
      const globalIndex = (page - 1) * 10 + index + 1;
      return `\`${globalIndex}.\` [${item.track.title}](${item.track.uri}) | \`${formatDuration(item.track.duration)}\` (<@${item.requesterId}>)`;
    });

    embed.setDescription(`**Upcoming Tracks:**\n${lines.join('\n')}`);
  }

  embed.setFooter({
    text: `Page ${page} of ${Math.max(1, totalPages)} | ${waitingTracks.length} tracks waiting | Total duration: ${formatDuration(totalDurationMs)}`,
  });

  return embed.toJSON();
}
