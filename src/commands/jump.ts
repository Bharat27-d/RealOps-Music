import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { truncate } from "../utils/formatters.js";

export const jumpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("jump")
    .setDescription("Jump directly to a specific song in the queue")
    .addIntegerOption((opt) =>
      opt
        .setName("position")
        .setDescription("Track position in the queue")
        .setRequired(true)
        .setMinValue(1)
    ),

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

    const pos = interaction.options.getInteger("position", true);
    if (pos > player.queue.tracks.length) {
      await interaction.reply({
        content: `❌ Invalid position. There are only ${player.queue.tracks.length} tracks in queue.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetTrack = player.queue.tracks[pos - 1];
    await player.skip(pos);
    await interaction.reply(`⏭️ Jumped directly to **#${pos}**: **${truncate(targetTrack?.info.title || "Track", 40)}**.`);
  },
};

