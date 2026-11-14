import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";

export const pauseCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause the current playback"),

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

    if (player.paused) {
      await interaction.reply({ content: "⚠️ The player is already paused. Use `/resume`.", flags: MessageFlags.Ephemeral });
      return;
    }

    await player.pause();
    await interaction.reply("⏸️ Playback has been paused.");
  },
};

