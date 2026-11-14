import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { getCustomData, setCustomData } from "../types/index.js";
import { setGuild247, getGuildSettings } from "../utils/guildSettings.js";

export const mode247Command: Command = {
  data: new SlashCommandBuilder()
    .setName("247")
    .setDescription("Toggle 24/7 mode (keeps the bot in your voice channel permanently, even when not playing)"),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: "You need to be in a voice channel to configure 24/7 mode.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions?.has("Connect") || !permissions?.has("Speak")) {
      await interaction.reply({
        content: "I do not have permission to connect and speak in your voice channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let player = client.lavalink.getPlayer(interaction.guildId!);

    // If player does not exist, create it and join the voice channel immediately
    if (!player) {
      player = client.lavalink.createPlayer({
        guildId: interaction.guildId!,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: client.botConfig.player.defaultVolume,
        instaUpdateFiltersFix: true,
      });
    }

    // Connect to voice channel if not connected
    if (!player.connected) {
      player.voiceChannelId = voiceChannel.id;
      await player.connect();
    }

    const customData = getCustomData(player);
    const savedSettings = getGuildSettings(interaction.guildId!);

    // Toggle 24/7 mode
    const newStatus = !(customData.mode247 || savedSettings.mode247);
    customData.mode247 = newStatus;
    setCustomData(player, customData);

    // Save to persistent file storage
    setGuild247(interaction.guildId!, newStatus, voiceChannel.id, interaction.channelId);

    if (newStatus) {
      await interaction.reply(
        `24/7 Mode is now **ENABLED**. The bot will stay in **${voiceChannel.name}** permanently, even when no music is playing.`
      );
    } else {
      await interaction.reply(
        `24/7 Mode is now **DISABLED**. The bot will auto-disconnect when the queue is empty and idle.`
      );
    }
  },
};
