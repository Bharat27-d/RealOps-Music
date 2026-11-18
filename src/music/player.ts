import { EventEmitter } from 'node:events';
import { type Client, type VoiceBasedChannel, type VoiceState, type TextBasedChannel } from 'discord.js';
import { type Player, type Shoukaku, type TrackEndEvent } from 'shoukaku';
import { env } from '../config/env.js';
import { childLogger } from '../core/logger.js';
import { infoEmbed } from '../utils/embed.js';
import { TrackQueue, type LoopMode, type QueuedTrack, type QueueAddResult } from './queue.js';
import { type ResolvedTrack, type ResolvedPlaylist } from './types.js';
import { handleTrackFailure } from './recovery.js';

export interface GuildPlayerOptions {
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  shoukaku: Shoukaku;
  shoukakuPlayer: Player;
  client: Client;
  idleTimeoutMinutes?: number | undefined;
}

export interface NowPlayingInfo {
  track: ResolvedTrack;
  requesterId: string;
  position: number;
  duration: number;
  isPaused: boolean;
  loopMode: LoopMode;
  volume: number;
}

/**
 * GuildPlayer manages playback, voice connection lifecycle, queue operations,
 * idle timeout auto-leave, and voice state transitions for a single Discord guild.
 */
export class GuildPlayer extends EventEmitter {
  public readonly guildId: string;
  public textChannelId: string;
  public voiceChannelId: string;
  public readonly queue: TrackQueue;

  private readonly shoukaku: Shoukaku;
  private readonly player: Player;
  private readonly client: Client;
  private readonly log: ReturnType<typeof childLogger>;

  private idleTimer: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs: number;
  private isDestroyed = false;
  private volumeLevel = 100;

  // Track exception & stuck hook (injected by Phase 7 reliability layer)
  public onTrackFailure:
    | ((
        player: GuildPlayer,
        track: QueuedTrack,
        error: { type: 'exception' | 'stuck'; message: string; exception?: unknown },
      ) => Promise<boolean>)
    | null = null;

  constructor(options: GuildPlayerOptions) {
    super();
    this.guildId = options.guildId;
    this.textChannelId = options.textChannelId;
    this.voiceChannelId = options.voiceChannelId;
    this.shoukaku = options.shoukaku;
    this.player = options.shoukakuPlayer;
    this.client = options.client;

    this.idleTimeoutMs = (options.idleTimeoutMinutes ?? env.IDLE_TIMEOUT_MINUTES) * 60 * 1000;
    this.queue = new TrackQueue();
    this.log = childLogger('music/player', { guildId: this.guildId });

    this.attachPlayerListeners();
    this.onTrackFailure = handleTrackFailure;
    this.startIdleTimer('player_created');
  }

  // ─── Playback Controls ──────────────────────────────────────────────────────

  /**
   * Adds a track to the queue and starts playback if currently idle.
   */
  public async play(track: ResolvedTrack, requesterId: string): Promise<QueueAddResult> {
    const result = this.queue.addTrack(track, requesterId);

    if (result.added > 0 && !this.queue.current) {
      await this.processQueue();
    }

    return result;
  }

  /**
   * Adds a playlist to the queue and starts playback if currently idle.
   */
  public async playPlaylist(
    playlist: ResolvedPlaylist,
    requesterId: string,
  ): Promise<QueueAddResult> {
    const result = this.queue.addTracks(playlist.tracks, requesterId);

    if (result.added > 0 && !this.queue.current) {
      await this.processQueue();
    }

    return result;
  }

  /**
   * Processes the next track in the queue.
   */
  public async processQueue(): Promise<void> {
    if (this.isDestroyed) return;

    const nextTrack = this.queue.next();

    if (!nextTrack) {
      this.log.debug('Queue is empty — starting idle timer');
      this.startIdleTimer('queue_exhausted');
      this.emit('queueEnd');
      return;
    }

    this.cancelIdleTimer();

    try {
      this.log.info(
        {
          title: nextTrack.track.title,
          author: nextTrack.track.author,
          source: nextTrack.track.sourceName,
          requesterId: nextTrack.requesterId,
        },
        'Playing track',
      );

      await this.player.playTrack(
        {
          track: {
            encoded: nextTrack.track.encoded,
          },
        },
        false,
      );
    } catch (err) {
      this.log.error(
        { err, track: nextTrack.track.title, uri: nextTrack.track.uri },
        'Failed to start track playback',
      );

      // Attempt failure recovery via hook if attached, otherwise advance queue
      if (this.onTrackFailure) {
        const handled = await this.onTrackFailure(this, nextTrack, {
          type: 'exception',
          message: err instanceof Error ? err.message : String(err),
        });
        if (handled) return;
      }

      await this.processQueue();
    }
  }

  /**
   * Pauses audio playback.
   */
  public async pause(): Promise<void> {
    if (this.player.paused) return;
    await this.player.setPaused(true);
    this.startIdleTimer('player_paused');
    this.emit('pause');
  }

  /**
   * Resumes audio playback.
   */
  public async resume(): Promise<void> {
    if (!this.player.paused) return;
    await this.player.setPaused(false);
    this.cancelIdleTimer();
    this.emit('resume');
  }

  /**
   * Skips the current track.
   */
  public async skip(): Promise<QueuedTrack | null> {
    const skipped = this.queue.current;
    if (!skipped) return null;

    this.log.info({ title: skipped.track.title }, 'Skipping current track');
    await this.player.stopTrack();
    return skipped;
  }

  /**
   * Stops playback, clears the queue, and starts the idle timer.
   */
  public async stop(): Promise<void> {
    this.queue.reset();
    await this.player.stopTrack();
    this.startIdleTimer('player_stopped');
    this.emit('stop');
  }

  /**
   * Seeks to a specific millisecond position in the currently playing track.
   */
  public async seek(positionMs: number): Promise<void> {
    if (!this.queue.current) return;
    const clamped = Math.max(0, Math.min(positionMs, this.queue.current.track.duration));
    await this.player.seekTo(clamped);
    this.emit('seek', clamped);
  }

  /**
   * Sets player volume (0% to 100%).
   */
  public async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(volume, 100));
    this.volumeLevel = clamped;
    // Shoukaku setGlobalVolume accepts 0-1000 or setFilterVolume 0.0-5.0
    await this.player.setGlobalVolume(clamped);
    this.emit('volume', clamped);
  }

  /**
   * Shuffles the waiting queue tracks.
   */
  public shuffle(): void {
    this.queue.shuffle();
    this.emit('shuffle');
  }

  /**
   * Sets loop mode ('off' | 'track' | 'queue').
   */
  public setLoop(mode: LoopMode): void {
    this.queue.setLoopMode(mode);
    this.emit('loop', mode);
  }

  /**
   * Removes a track at 0-based index from the waiting queue.
   */
  public remove(index: number): QueuedTrack | undefined {
    return this.queue.remove(index);
  }

  /**
   * Moves a track from one index to another in the queue.
   */
  public move(fromIndex: number, toIndex: number): boolean {
    return this.queue.move(fromIndex, toIndex);
  }

  /**
   * Clears the waiting queue (leaves current track playing).
   */
  public clear(): number {
    return this.queue.clear();
  }

  /**
   * Retrieves active metadata about currently playing track.
   */
  public nowPlaying(): NowPlayingInfo | null {
    if (!this.queue.current) return null;

    return {
      track: this.queue.current.track,
      requesterId: this.queue.current.requesterId,
      position: this.player.position,
      duration: this.queue.current.track.duration,
      isPaused: this.player.paused,
      loopMode: this.queue.loopMode,
      volume: this.volumeLevel,
    };
  }

  public get isPlaying(): boolean {
    return Boolean(this.queue.current && !this.player.paused);
  }

  public get isPaused(): boolean {
    return this.player.paused;
  }

  // ─── Shoukaku Event Listeners ───────────────────────────────────────────────

  private attachPlayerListeners(): void {
    this.player.on('start', () => {
      this.cancelIdleTimer();
      if (this.queue.current) {
        this.emit('trackStart', this.queue.current);
      }
    });

    this.player.on('end', (data: TrackEndEvent) => {
      this.log.debug({ reason: data.reason }, 'Track ended');

      if (data.reason === 'finished') {
        void this.processQueue();
      } else if (data.reason === 'loadFailed') {
        this.log.warn({ reason: data.reason }, 'Track loadFailed, advancing queue');
        void this.processQueue();
      }
    });

    this.player.on('exception', (data) => {
      this.log.error({ exception: data.exception }, 'Track exception event received');
      if (this.queue.current && this.onTrackFailure) {
        void this.onTrackFailure(this, this.queue.current, {
          type: 'exception',
          message: data.exception.message,
          exception: data.exception,
        }).then((handled) => {
          if (!handled) void this.processQueue();
        });
      } else {
        void this.processQueue();
      }
    });

    this.player.on('stuck', (data) => {
      this.log.warn({ thresholdMs: data.thresholdMs }, 'Track stuck event received');
      if (this.queue.current && this.onTrackFailure) {
        void this.onTrackFailure(this, this.queue.current, {
          type: 'stuck',
          message: `Track stuck for ${data.thresholdMs}ms`,
        }).then((handled) => {
          if (!handled) void this.processQueue();
        });
      } else {
        void this.processQueue();
      }
    });

    this.player.on('closed', (data) => {
      this.log.warn(
        { code: data.code, reason: data.reason, byRemote: data.byRemote },
        'Voice WebSocket connection closed',
      );
    });
  }

  // ─── Voice State Updates & Idle Timer ───────────────────────────────────────

  /**
   * Handles voice state changes in the guild (channel movements, disconnects, empty channels).
   */
  public handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    if (this.isDestroyed) return;

    const botId = this.client.user?.id;

    // 1. Bot member itself changed state
    if (newState.member?.id === botId) {
      // Bot disconnected or kicked from voice channel
      if (!newState.channelId) {
        this.log.info('Bot was disconnected or kicked from voice channel — cleaning up player');
        void this.destroy('bot_disconnected');
        return;
      }

      // Bot moved to another voice channel
      if (newState.channelId !== this.voiceChannelId) {
        this.log.info(
          { from: this.voiceChannelId, to: newState.channelId },
          'Bot moved to a different voice channel',
        );
        this.voiceChannelId = newState.channelId;
      }
    }

    // 2. Member count evaluation in the bot's current voice channel
    this.checkVoiceChannelMembers();
  }

  /**
   * Checks whether the current voice channel has any human members remaining.
   */
  public checkVoiceChannelMembers(): void {
    if (this.isDestroyed) return;

    const channel = this.client.channels.cache.get(this.voiceChannelId) as
      | VoiceBasedChannel
      | undefined;

    if (!channel) {
      // Voice channel was deleted
      this.log.warn({ channelId: this.voiceChannelId }, 'Voice channel was deleted');
      void this.destroy('channel_deleted');
      return;
    }

    const humanMembers = channel.members.filter((m) => !m.user.bot);

    if (humanMembers.size === 0) {
      this.log.info('Voice channel is empty (no non-bot members) — starting idle timer');
      this.startIdleTimer('empty_voice_channel');
    } else {
      // Humans are present; if idle timer was running strictly due to an empty channel, cancel it
      if (this.isPlaying) {
        this.cancelIdleTimer();
      }
    }
  }

  /**
   * Starts the idle auto-leave timer if not already active.
   */
  private startIdleTimer(reason: string): void {
    if (this.idleTimer || this.isDestroyed) return;

    this.log.debug({ reason, timeoutMs: this.idleTimeoutMs }, 'Starting idle timer');

    this.idleTimer = setTimeout(() => {
      this.log.info({ reason }, 'Idle timeout reached — leaving voice channel');
      this.notifyChannel('Left the voice channel due to inactivity.');
      void this.destroy('idle_timeout');
    }, this.idleTimeoutMs);
  }

  /**
   * Cancels the active idle timer.
   */
  private cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Helper to send notification messages to the associated text channel.
   */
  private notifyChannel(message: string): void {
    try {
      const channel = this.client.channels.cache.get(this.textChannelId) as
        | TextBasedChannel
        | undefined;
      if (channel && 'send' in channel) {
        void channel.send({ embeds: [infoEmbed(message)] }).catch(() => undefined);
      }
    } catch {
      // Ignored during shutdown
    }
  }

  // ─── Destroy & Cleanup ──────────────────────────────────────────────────────

  /**
   * Destroys the player, cleans up all listeners and timers, and disconnects from voice.
   */
  public async destroy(reason = 'manual'): Promise<void> {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    this.log.info({ reason }, 'Destroying GuildPlayer instance');

    this.cancelIdleTimer();
    this.queue.reset();

    try {
      await this.player.destroy();
    } catch (err) {
      this.log.warn({ err }, 'Error destroying Shoukaku player');
    }

    try {
      await this.shoukaku.leaveVoiceChannel(this.guildId);
    } catch (err) {
      this.log.warn({ err }, 'Error leaving voice channel via Shoukaku');
    }

    this.emit('destroy', reason);
    this.removeAllListeners();
  }
}
