import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { successEmbed, warningEmbed, errorEmbed } from '../utils/embed.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Randomly shuffle the upcoming tracks in the queue'),

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

    if (precondition.player.queue.size < 2) {
      await interaction.editReply({
        embeds: [warningEmbed('Need at least 2 upcoming tracks in the queue to shuffle.')],
      });
      return;
    }

    precondition.player.shuffle();
    await interaction.editReply({
      embeds: [
        successEmbed(`Shuffled **${precondition.player.queue.size}** upcoming tracks in the queue.`),
      ],
    });
  },
};

export default command;
