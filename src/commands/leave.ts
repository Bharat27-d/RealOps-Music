import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { successEmbed, errorEmbed } from '../utils/embed.js';
import { playerManager } from '../music/manager.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from the voice channel and clear queue state'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const precondition = await checkVoicePreconditions(interaction, false);
    if (!precondition.success) {
      await interaction.editReply({ embeds: [errorEmbed(precondition.errorMessage)] });
      return;
    }

    const guildId = interaction.guildId!;
    const player = playerManager.get(guildId);

    if (!player) {
      await interaction.editReply({
        embeds: [errorEmbed('The bot is not connected to a voice channel in this server.')],
      });
      return;
    }

    await playerManager.destroy(guildId, 'leave_command');

    await interaction.editReply({
      embeds: [successEmbed('Disconnected from voice channel and cleared queue.')],
    });
  },
};

export default command;
