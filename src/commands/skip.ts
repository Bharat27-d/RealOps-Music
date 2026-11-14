import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { truncate } from "../utils/formatters.js";

export const skipCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the currently playing track (or multiple tracks)")
    .addIntegerOption((opt) =>
      opt
        .setName("to")
        .setDescription("Skip directly to a specific track index in the queue")
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player || !player.queue.current) {
      await interaction.reply({ content: "❌ Nothing is currently playing.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "❌ You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const toIndex = interaction.options.getInteger("to");
    const currentTitle = player.queue.current.info.title;

    if (toIndex) {
      if (toIndex > player.queue.tracks.length) {
        await interaction.reply({
          content: `❌ Invalid index. There are only ${player.queue.tracks.length} songs in queue.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await player.skip(toIndex, false);
      await interaction.reply(`⏭️ Skipped ahead to track **#${toIndex}**.`);
    } else {
      if (player.queue.tracks.length > 0) {
        await player.skip(0, false);
        await interaction.reply(`⏭️ Skipped **${truncate(currentTitle, 40)}**.`);
      } else {
        await player.stopPlaying(true, false);
        await interaction.reply(`⏭️ Skipped **${truncate(currentTitle, 40)}**. (Queue is now empty)`);
      }
    }
  },
};
