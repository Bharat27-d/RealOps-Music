import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, PermissionsBitField , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import { type Command, getCustomData, setCustomData } from "../types/index.js";

export const mode247Command: Command = {
  data: new SlashCommandBuilder()
    .setName("247")
    .setDescription("Toggle 24/7 mode (keeps bot in voice channel even when inactive)"),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player) {
      await interaction.reply({ content: "❌ No active session found. Start one with `/play` first.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "❌ You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const customData = getCustomData(player);
    customData.mode247 = !customData.mode247;
    setCustomData(player, customData);

    await interaction.reply(
      `⏰ 24/7 Mode is now **${customData.mode247 ? "ENABLED" : "DISABLED"}**. The bot will ${
        customData.mode247 ? "remain in the voice channel indefinitely" : "auto-disconnect when inactive"
      }.`
    );
  },
};
