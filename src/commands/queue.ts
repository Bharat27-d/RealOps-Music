import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { queueEmbed, errorEmbed } from '../utils/embed.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the current music queue')
    .addIntegerOption((option) =>
      option
        .setName('page')
        .setDescription('Page number to view (10 tracks per page)')
        .setMinValue(1),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const precondition = await checkVoicePreconditions(interaction, false);
    if (!precondition.success) {
      await interaction.editReply({ embeds: [errorEmbed(precondition.errorMessage)] });
      return;
    }

    const player = precondition.player;
    if (!player || (!player.queue.current && player.queue.size === 0)) {
      await interaction.editReply({
        embeds: [errorEmbed('The music queue is currently empty.')],
      });
      return;
    }

    const requestedPage = interaction.options.getInteger('page') ?? 1;
    const pageSize = 10;
    const totalPages = Math.ceil(player.queue.size / pageSize) || 1;
    const page = Math.max(1, Math.min(requestedPage, totalPages));

    const startIndex = (page - 1) * pageSize;
    const pageItems = player.queue.list.slice(startIndex, startIndex + pageSize);

    await interaction.editReply({
      embeds: [
        queueEmbed(
          player.queue.current,
          pageItems,
          page,
          totalPages,
          player.queue.totalDuration,
        ),
      ],
    });
  },
};

export default command;

