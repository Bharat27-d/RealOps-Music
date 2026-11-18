import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { successEmbed, infoEmbed, errorEmbed } from '../utils/embed.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current audio playback'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const precondition = await checkVoicePreconditions(interaction, true);
    if (!precondition.success) {
      await interaction.editReply({ embeds: [errorEmbed(precondition.errorMessage)] });
      return;
    }
    if (!precondition.player) {
      await interaction.editReply({ embeds: [errorEmbed('Nothing is currently playing.')] });
      return;
    }

    if (precondition.player.isPaused) {
      await interaction.editReply({ embeds: [infoEmbed('Playback is already paused.')] });
      return;
    }

    await precondition.player.pause();
    await interaction.editReply({ embeds: [successEmbed('Playback paused.')] });
  },
};

export default command;
