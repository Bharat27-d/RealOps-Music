import { SlashCommandBuilder, type ChatInputCommandInteraction , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { createPlayerEmbed } from "../ui/playerEmbed.js";

export const nowPlayingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Display the currently playing song with interactive controls"),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player || !player.queue.current) {
      await interaction.reply({ content: "❌ Nothing is currently playing.", flags: MessageFlags.Ephemeral });
      return;
    }

    const payload = createPlayerEmbed(player);
    await interaction.reply(payload);
  },
};

