import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { nowPlayingEmbed, errorEmbed } from '../utils/embed.js';
import { buildNowPlayingButtons } from '../utils/buttons.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Display information and controls for the currently playing track'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const precondition = await checkVoicePreconditions(interaction, true);
    if (!precondition.success) {
      await interaction.editReply({ embeds: [errorEmbed(precondition.errorMessage)] });
      return;
    }
    if (!precondition.player) {
      await interaction.editReply({ embeds: [errorEmbed('Nothing is currently playing in this server.')] });
      return;
    }

    const now = precondition.player.nowPlaying();
    if (!now) {
      await interaction.editReply({
        embeds: [errorEmbed('Nothing is currently playing in this server.')],
      });
      return;
    }

    await interaction.editReply({
      embeds: [nowPlayingEmbed(now)],
      components: [buildNowPlayingButtons(precondition.player.isPaused)],
    });
  },
};

export default command;
