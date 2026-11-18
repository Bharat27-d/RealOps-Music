import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { successEmbed, errorEmbed } from '../utils/embed.js';
import { type LoopMode } from '../music/queue.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the loop mode for the music queue')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Loop mode to activate')
        .setRequired(true)
        .addChoices(
          { name: 'Off (default)', value: 'off' },
          { name: 'Track (repeat current song)', value: 'track' },
          { name: 'Queue (repeat entire queue)', value: 'queue' },
        ),
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

    const mode = interaction.options.getString('mode', true) as LoopMode;
    precondition.player.setLoop(mode);

    const modeLabels: Record<LoopMode, string> = {
      off: 'Disabled',
      track: 'Current Track',
      queue: 'Entire Queue',
    };

    await interaction.editReply({
      embeds: [successEmbed(`Loop mode set to **${modeLabels[mode]}**`)],
    });
  },
};

export default command;
