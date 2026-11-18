import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { successEmbed, errorEmbed } from '../utils/embed.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue by its position number')
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Track position number as shown in /queue')
        .setRequired(true)
        .setMinValue(1),
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

    const pos = interaction.options.getInteger('position', true);
    const zeroBasedIndex = pos - 1;

    const removed = precondition.player.remove(zeroBasedIndex);

    if (!removed) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            `Invalid position #${pos}. The queue currently has ${precondition.player.queue.size} upcoming tracks.`,
          ),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [successEmbed(`Removed **${removed.track.title}** from the queue.`)],
    });
  },
};

export default command;
