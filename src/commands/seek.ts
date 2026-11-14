import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { formatDuration, parseDuration } from "../utils/formatters.js";

export const seekCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Seek to a specific timestamp in the current song")
    .addStringOption((opt) =>
      opt
        .setName("timestamp")
        .setDescription("Time position (e.g., '1:30', '90s', '02:45')")
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player || !player.queue.current) {
      await interaction.reply({ content: "Nothing is currently playing.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!player.queue.current.info.isSeekable) {
      await interaction.reply({ content: "This audio stream does not support seeking.", flags: MessageFlags.Ephemeral });
      return;
    }

    const input = interaction.options.getString("timestamp", true);
    const ms = parseDuration(input);

    if (ms === null || ms < 0 || ms > player.queue.current.info.duration) {
      await interaction.reply({
        content: `Invalid timestamp. Enter a time between \`00:00\` and \`${formatDuration(player.queue.current.info.duration)}\`.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await player.seek(ms);
    await interaction.reply(`Seeked to \`${formatDuration(ms)}\`.`);
  },
};
