import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, MessageFlags } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import { type Command, getCustomData, setCustomData } from "../types/index.js";

export const autoplayCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Toggle smart autoplay (automatically queues similar tracks when the queue ends)"),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player) {
      await interaction.reply({ content: "No active session found.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.voice.channelId !== player.voiceChannelId) {
      await interaction.reply({
        content: "You must be in the same voice channel as the bot.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const customData = getCustomData(player);
    customData.autoplay = !customData.autoplay;
    setCustomData(player, customData);

    await interaction.reply(
      `Autoplay is now **${customData.autoplay ? "ENABLED" : "DISABLED"}**. Similar songs will ${
        customData.autoplay ? "automatically play" : "not be queued"
      } when the queue finishes.`
    );
  },
};
