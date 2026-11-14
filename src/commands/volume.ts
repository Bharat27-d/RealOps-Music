import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";

export const volumeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set the audio playback volume (1% - 200%)")
    .addIntegerOption((opt) =>
      opt
        .setName("percent")
        .setDescription("Volume level from 1 to 200")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(200)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player) {
      await interaction.reply({ content: "❌ No active player found.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "❌ You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const volume = interaction.options.getInteger("percent", true);
    await player.setVolume(volume);

    let emoji = "🔉";
    if (volume > 100) emoji = "🔊";
    else if (volume < 30) emoji = "🔈";

    await interaction.reply(`${emoji} Volume set to **${volume}%**.`);
  },
};

