import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { successEmbed, errorEmbed } from '../utils/embed.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing track'),

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

    const skipped = await precondition.player.skip();

    if (!skipped) {
      await interaction.editReply({
        embeds: [errorEmbed('Nothing is currently playing to skip.')],
      });
      return;
    }

    await interaction.editReply({
      embeds: [successEmbed(`Skipped **${skipped.track.title}**`)],
    });
  },
};

export default command;
