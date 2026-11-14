import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";

export const shuffleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("shuffle")
    .setDescription("Randomly shuffle all tracks in the queue"),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player) {
      await interaction.reply({ content: "❌ No active session in this server.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "❌ You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (player.queue.tracks.length <= 1) {
      await interaction.reply({ content: "⚠️ Need at least 2 tracks in queue to shuffle.", flags: MessageFlags.Ephemeral });
      return;
    }

    await player.queue.shuffle();
    await interaction.reply(`🔀 Shuffled **${player.queue.tracks.length}** songs in the queue!`);
  },
};

