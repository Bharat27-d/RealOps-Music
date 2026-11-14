import {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
  MessageFlags,
  type Interaction,
  type VoiceState,
} from "discord.js";
import { LavalinkManager, type SearchPlatform } from "lavalink-client";
import { config, type BotConfig } from "../config.js";
import { type Command, getCustomData, setCustomData } from "../types/index.js";
import { registerLavalinkEvents } from "./LavalinkEvents.js";
import { handleButtonInteraction } from "../interactions/buttonHandler.js";
import { allCommands } from "../commands/index.js";
import { getGuildSettings, getAll247Guilds } from "../utils/guildSettings.js";

export class MusicClient extends Client {
  public lavalink: LavalinkManager;
  public commands: Collection<string, Command> = new Collection();
  public botConfig: BotConfig;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.botConfig = config;

    this.lavalink = new LavalinkManager({
      nodes: [
        {
          id: "primary-node",
          host: config.lavalink.host,
          port: config.lavalink.port,
          authorization: config.lavalink.password,
          secure: config.lavalink.secure,
          heartBeatInterval: 0,
          enablePingOnStatsCheck: false,
          retryAmount: 100,
          retryDelay: 3000,
        },
      ],
      sendToShard: (guildId: string, payload: unknown) => {
        const guild = this.guilds.cache.get(guildId);
        if (guild?.shard) {
          guild.shard.send(payload);
        }
      },
      client: {
        id: config.discord.clientId,
        username: "RealOps Music",
      },
      autoSkip: true,
      playerOptions: {
        applyVolumeAsFilter: false,
        clientBasedPositionUpdateInterval: 150,
        defaultSearchPlatform: (config.player.defaultSearchPlatform as SearchPlatform) || "ytmsearch",
        onDisconnect: {
          autoReconnect: true,
          destroyPlayer: false,
        },
        onEmptyQueue: {
          destroyAfterMs: config.player.autoDisconnectIdleSec * 1000,
        },
        useUnresolvedData: true,
      },
      queueOptions: {
        maxPreviousTracks: 25,
      },
    });

    // Register commands
    for (const cmd of allCommands) {
      this.commands.set(cmd.data.name, cmd);
    }

    // Register Lavalink audio events
    registerLavalinkEvents(this);

    // Register Discord events
    this.registerDiscordEvents();
  }

  private registerDiscordEvents(): void {
    // Forward Discord voice state data to Lavalink
    this.on("raw", (data) => {
      this.lavalink.sendRawData(data);
    });

    // Bot Ready Event
    this.once(Events.ClientReady, async () => {
      console.log(`🚀 [Bot] Logged in as ${this.user?.tag} (${this.user?.id})`);

      // Initialize Lavalink connection
      await this.lavalink.init({
        id: this.user!.id,
        username: this.user!.username,
      });

      // Register Slash Commands globally
      await this.deploySlashCommands();

      // Auto-reconnect to all active 24/7 voice channels
      await this.reconnect247Guilds();
    });

    // Interaction (Slash Command / Button) Event
    this.on(Events.InteractionCreate, async (interaction: Interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          const command = this.commands.get(interaction.commandName);
          if (!command) {
            await interaction.reply({
              content: "Command not found.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await command.execute(interaction, this);
        } else if (interaction.isButton()) {
          await handleButtonInteraction(interaction, this);
        }
      } catch (error) {
        console.error(`[Interaction] Error handling ${interaction.id}:`, error);
        if (interaction.isRepliable()) {
          const msg = { content: "There was an error executing this command.", flags: MessageFlags.Ephemeral as any };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(msg).catch(() => null);
          } else {
            await interaction.reply(msg).catch(() => null);
          }
        }
      }
    });

    // Voice State Update (auto-disconnect when bot is left alone in VC)
    this.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
      const guildId = oldState.guild.id || newState.guild.id;
      const player = this.lavalink.getPlayer(guildId);
      if (!player || !player.voiceChannelId) return;

      const customData = getCustomData(player);
      const guildSettings = getGuildSettings(guildId);
      if (customData.mode247 || guildSettings.mode247) return; // 24/7 mode bypasses empty disconnect

      const channel = this.channels.cache.get(player.voiceChannelId);
      if (!channel || !channel.isVoiceBased()) return;

      // Filter out bots to count humans
      const humanMembers = channel.members.filter((m) => !m.user.bot);

      if (humanMembers.size === 0) {
        setTimeout(async () => {
          const checkPlayer = this.lavalink.getPlayer(guildId);
          if (!checkPlayer || !checkPlayer.voiceChannelId) return;

          const recheckCustom = getCustomData(checkPlayer);
          const recheckSettings = getGuildSettings(guildId);
          if (recheckCustom.mode247 || recheckSettings.mode247) return;

          const recheckChannel = this.channels.cache.get(checkPlayer.voiceChannelId);
          if (recheckChannel?.isVoiceBased()) {
            const currentHumans = recheckChannel.members.filter((m) => !m.user.bot);
            if (currentHumans.size === 0) {
              await checkPlayer.destroy("Channel empty timeout");
            }
          }
        }, this.botConfig.player.autoDisconnectEmptySec * 1000);
      }
    });
  }

  /**
   * Automatically restores voice channel connections for guilds with 24/7 mode enabled
   */
  public async reconnect247Guilds(): Promise<void> {
    const list = getAll247Guilds();
    if (list.length === 0) return;

    console.log(`[24/7] Restoring ${list.length} saved 24/7 voice channel connections...`);
    for (const item of list) {
      try {
        const guild = this.guilds.cache.get(item.guildId);
        if (!guild) continue;

        const vc = guild.channels.cache.get(item.voiceChannelId);
        if (!vc || !vc.isVoiceBased()) continue;

        let player = this.lavalink.getPlayer(item.guildId);
        if (!player) {
          player = this.lavalink.createPlayer({
            guildId: item.guildId,
            voiceChannelId: item.voiceChannelId,
            textChannelId: item.textChannelId,
            selfDeaf: true,
            volume: this.botConfig.player.defaultVolume,
            instaUpdateFiltersFix: true,
          });
        }

        const customData = getCustomData(player);
        customData.mode247 = true;
        setCustomData(player, customData);

        if (!player.connected) {
          await player.connect();
          console.log(`[24/7] Reconnected to "${vc.name}" in guild "${guild.name}"`);
        }
      } catch (err) {
        console.error(`[24/7] Failed to reconnect guild ${item.guildId}:`, err);
      }
    }
  }

  public async deploySlashCommands(): Promise<void> {
    if (!this.botConfig.discord.token || !this.user) return;

    try {
      const rest = new REST({ version: "10" }).setToken(this.botConfig.discord.token);
      const commandData = Array.from(this.commands.values()).map((cmd) => cmd.data.toJSON());

      console.log(`📦 Registering ${commandData.length} slash commands globally...`);
      await rest.put(Routes.applicationCommands(this.user.id), {
        body: commandData,
      });
      console.log("✅ Successfully registered all slash commands globally!");
    } catch (error) {
      console.error("❌ Failed to register slash commands:", error);
    }
  }
}
