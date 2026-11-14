import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { getCustomData } from "../types/index.js";
import { getGuildSettings } from "../utils/guildSettings.js";

export const stopCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music playback, clear the queue, and disconnect (stays in VC if 24/7 is enabled)"),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player) {
      await interaction.reply({ content: "No active player in this server.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const customData = getCustomData(player);
    const settings = getGuildSettings(interaction.guildId!);
    const is247 = customData.mode247 || settings.mode247;

    player.queue.tracks.splice(0, player.queue.tracks.length);

    if (is247) {
      await player.stopPlaying(true, false);
      await interaction.reply("Stopped playback and cleared queue. Bot remains connected in voice channel (24/7 Mode).");
    } else {
      await player.destroy("Stopped by user");
      await interaction.reply("Stopped playback, cleared queue, and disconnected.");
    }
  },
};
