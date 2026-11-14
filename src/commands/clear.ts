import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";

export const clearCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear all tracks from the queue (keeps current track playing)"),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player) {
      await interaction.reply({ content: "❌ No active session found.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "❌ You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const count = player.queue.tracks.length;
    if (count === 0) {
      await interaction.reply({ content: "⚠️ The queue is already empty.", flags: MessageFlags.Ephemeral });
      return;
    }

    player.queue.tracks.splice(0, player.queue.tracks.length);
    await interaction.reply(`🗑️ Cleared **${count}** tracks from the queue.`);
  },
};

