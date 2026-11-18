import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { successEmbed, errorEmbed } from '../utils/embed.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Adjust the playback volume (0% to 100%)')
    .addIntegerOption((option) =>
      option
        .setName('level')
        .setDescription('Volume level percentage')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100),
    ),

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

    const level = interaction.options.getInteger('level', true);
    await precondition.player.setVolume(level);

    await interaction.editReply({
      embeds: [successEmbed(`Volume set to **${level}%**`)],
    });
  },
};

export default command;
