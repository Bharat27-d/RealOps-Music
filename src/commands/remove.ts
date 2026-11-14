import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { truncate } from "../utils/formatters.js";

export const removeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a specific song from the queue by its position")
    .addIntegerOption((opt) =>
      opt
        .setName("position")
        .setDescription("The track number in /queue to remove")
        .setRequired(true)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player) {
      await interaction.reply({ content: "No active session found.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const pos = interaction.options.getInteger("position", true);
    if (pos > player.queue.tracks.length) {
      await interaction.reply({
        content: `Invalid position. There are only ${player.queue.tracks.length} tracks in queue.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const removed = player.queue.tracks.splice(pos - 1, 1)[0];
    await interaction.reply(`Removed **#${pos}**: **${truncate(removed?.info.title || "Track", 40)}**.`);
  },
};
