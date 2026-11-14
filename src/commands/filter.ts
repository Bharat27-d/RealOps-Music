import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";

export const filterCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Apply real-time audio effects and DSP filters")
    .addStringOption((opt) =>
      opt
        .setName("preset")
        .setDescription("Filter preset to apply")
        .setRequired(true)
        .addChoices(
          { name: "Clear All (Reset to Normal)", value: "clear" },
          { name: "Bass Boost", value: "bassboost" },
          { name: "Nightcore (Speed & Pitch Up)", value: "nightcore" },
          { name: "Vaporwave (Slow & Reverb feel)", value: "vaporwave" },
          { name: "8D Audio (Rotating Surround)", value: "8d" },
          { name: "Tremolo (Wavy Audio)", value: "tremolo" },
          { name: "Karaoke (Vocal Suppression)", value: "karaoke" }
        )
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

    await interaction.deferReply();
    const preset = interaction.options.getString("preset", true);

    try {
      switch (preset) {
        case "clear":
          await player.filterManager.resetFilters();
          await interaction.editReply("✨ All audio filters have been **cleared**.");
          break;

        case "bassboost":
          await player.filterManager.setEQPreset("BassboostHigh");
          await interaction.editReply("🔊 **Bass Boost (High)** has been enabled.");
          break;

        case "nightcore":
          await player.filterManager.toggleNightcore();
          await interaction.editReply("🌙 **Nightcore** mode toggled.");
          break;

        case "vaporwave":
          await player.filterManager.toggleVaporwave();
          await interaction.editReply("🌊 **Vaporwave** mode toggled.");
          break;

        case "8d":
          await player.filterManager.toggleRotation(0.2);
          await interaction.editReply("🎧 **8D Audio** rotating effect toggled.");
          break;

        case "tremolo":
          await player.filterManager.toggleTremolo(4.0, 0.75);
          await interaction.editReply("〰️ **Tremolo** effect toggled.");
          break;

        case "karaoke":
          await player.filterManager.toggleKaraoke(1.0, 1.0, 220.0, 100.0);
          await interaction.editReply("🎤 **Karaoke (Vocal Suppression)** effect toggled.");
          break;

        default:
          await interaction.editReply("❌ Unknown filter preset.");
          break;
      }
    } catch (error) {
      console.error("[Filter] Failed to apply filter:", error);
      await interaction.editReply("❌ Failed to apply the selected audio filter.");
    }
  },
};

