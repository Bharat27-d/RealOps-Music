import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { truncate } from "../utils/formatters.js";

export const previousCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("previous")
    .setDescription("Play the previous track from history"),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player) {
      await interaction.reply({ content: "❌ No active music session found.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "❌ You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (player.queue.previous.length === 0) {
      await interaction.reply({ content: "⚠️ No previous tracks in history.", flags: MessageFlags.Ephemeral });
      return;
    }

    const prev = await player.queue.shiftPrevious();
    if (prev) {
      await player.queue.add(prev, 0);
      await player.skip();
      await interaction.reply(`⏮️ Playing previous track: **${truncate(prev.info.title, 40)}**.`);
    }
  },
};

