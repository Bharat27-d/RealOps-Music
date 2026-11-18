import { type Client, type VoiceState, type Channel } from 'discord.js';
import { childLogger } from '../core/logger.js';
import { registerShutdownHook } from '../core/process.js';
import { lavalinkService } from '../lavalink/index.js';
import { GuildPlayer } from './player.js';

const log = childLogger('music/manager');

export interface CreatePlayerOptions {
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  shardId?: number | undefined;
}

/**
 * PlayerManager tracks and orchestrates GuildPlayer instances across all Discord guilds.
 */
export class PlayerManager {
  private readonly players = new Map<string, GuildPlayer>();
  private client: Client | null = null;

  public init(client: Client): void {
    if (this.client) return;
    this.client = client;

    // Register process shutdown hook to gracefully destroy all players
    registerShutdownHook('players', async () => {
      await this.destroyAll();
    });

    log.info('PlayerManager initialized');
  }

  /**
   * Retrieves an active player for a specific guild if it exists.
   */
  public get(guildId: string): GuildPlayer | undefined {
    return this.players.get(guildId);
  }

  /**
   * Checks whether an active player exists for a guild.
   */
  public has(guildId: string): boolean {
    return this.players.has(guildId);
  }

  /**
   * Total number of active players currently running.
   */
  public get count(): number {
    return this.players.size;
  }

  /**
   * Retrieves an existing player or creates and connects a new one to the specified voice channel.
   */
  public async getOrCreate(options: CreatePlayerOptions): Promise<GuildPlayer> {
    if (!this.client) {
      throw new Error('PlayerManager must be initialized with client before creating players.');
    }

    const existing = this.players.get(options.guildId);
    if (existing) {
      // Update text channel for command feedback if called from another channel
      existing.textChannelId = options.textChannelId;
      return existing;
    }

    log.info(
      {
        guildId: options.guildId,
        voiceChannelId: options.voiceChannelId,
        textChannelId: options.textChannelId,
      },
      'Connecting to voice channel and creating new GuildPlayer...',
    );

    const shoukaku = lavalinkService.getShoukaku();

    // Connect to voice channel via Shoukaku
    const shoukakuPlayer = await shoukaku.joinVoiceChannel({
      guildId: options.guildId,
      channelId: options.voiceChannelId,
      shardId: options.shardId ?? 0,
      deaf: true,
    });

    const guildPlayer = new GuildPlayer({
      guildId: options.guildId,
      textChannelId: options.textChannelId,
      voiceChannelId: options.voiceChannelId,
      shoukaku,
      shoukakuPlayer,
      client: this.client,
    });

    // Automatically remove from registry when destroyed
    guildPlayer.once('destroy', () => {
      this.players.delete(options.guildId);
      log.debug({ guildId: options.guildId }, 'Player removed from PlayerManager registry');
    });

    this.players.set(options.guildId, guildPlayer);
    return guildPlayer;
  }

  /**
   * Destroys a player and leaves the voice channel for a specific guild.
   */
  public async destroy(guildId: string, reason = 'manual'): Promise<void> {
    const player = this.players.get(guildId);
    if (player) {
      await player.destroy(reason);
      this.players.delete(guildId);
    }
  }

  /**
   * Gracefully destroys all active players across all guilds during shutdown.
   */
  public async destroyAll(): Promise<void> {
    if (this.players.size === 0) return;

    log.info({ count: this.players.size }, 'Destroying all active players...');

    const destroyPromises = [...this.players.values()].map((player) =>
      player.destroy('shutdown').catch((err) => {
        log.warn({ guildId: player.guildId, err }, 'Failed to cleanly destroy player');
      }),
    );

    await Promise.allSettled(destroyPromises);
    this.players.clear();
    log.info('All players destroyed');
  }

  /**
   * Dispatches voice state updates from Discord to the corresponding GuildPlayer.
   */
  public handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const guildId = newState.guild.id || oldState.guild.id;
    const player = this.players.get(guildId);
    if (player) {
      player.handleVoiceStateUpdate(oldState, newState);
    }
  }

  /**
   * Handles channel deletion (e.g. if voice channel is deleted by admin).
   */
  public handleChannelDelete(channel: Channel): void {
    if (!('guild' in channel) || !channel.guild) return;

    const player = this.players.get(channel.guild.id);
    if (!player) return;

    if (player.voiceChannelId === channel.id) {
      log.warn({ guildId: channel.guild.id, channelId: channel.id }, 'Voice channel was deleted');
      void player.destroy('channel_deleted');
    }
  }
}

export const playerManager = new PlayerManager();

