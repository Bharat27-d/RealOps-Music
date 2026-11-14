import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember , MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";

export const loopCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Set playback loop mode")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("Loop mode")
        .setRequired(true)
        .addChoices(
          { name: "Off", value: "off" },
          { name: "Current Track", value: "track" },
          { name: "Entire Queue", value: "queue" }
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

    const mode = interaction.options.getString("mode", true) as "off" | "track" | "queue";
    await player.setRepeatMode(mode);

    const labels = {
      off: "Disabled",
      track: "🔂 Single Track",
      queue: "🔁 Whole Queue",
    };

    await interaction.reply(`🔁 Loop mode set to **${labels[mode]}**.`);
  },
};

