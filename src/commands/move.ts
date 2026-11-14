import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { truncate } from "../utils/formatters.js";

export const moveCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a track in the queue from one position to another")
    .addIntegerOption((opt) =>
      opt.setName("from").setDescription("The current position of the track").setRequired(true).setMinValue(1)
    )
    .addIntegerOption((opt) =>
      opt.setName("to").setDescription("The new position for the track").setRequired(true).setMinValue(1)
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

    const from = interaction.options.getInteger("from", true);
    const to = interaction.options.getInteger("to", true);

    const max = player.queue.tracks.length;
    if (from > max || to > max) {
      await interaction.reply({
        content: `❌ Positions must be between 1 and ${max}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (from === to) {
      await interaction.reply({ content: "⚠️ The track is already at that position.", flags: MessageFlags.Ephemeral });
      return;
    }

    const [track] = player.queue.tracks.splice(from - 1, 1);
    player.queue.tracks.splice(to - 1, 0, track);

    await interaction.reply(`🔀 Moved **${truncate(track.info.title, 40)}** from **#${from}** to **#${to}**.`);
  },
};

