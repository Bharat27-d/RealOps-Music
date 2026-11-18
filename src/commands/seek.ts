import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { successEmbed, errorEmbed } from '../utils/embed.js';
import { formatDuration } from '../utils/time.js';
import { type Command } from '../core/loader.js';

function parsePositionToMs(input: string): number | null {
  const trimmed = input.trim();

  // Colon-separated format: mm:ss or hh:mm:ss
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => Number(p));
    if (parts.some((p) => isNaN(p) || p < 0)) return null;

    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return ((minutes ?? 0) * 60 + (seconds ?? 0)) * 1000;
    }
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return (((hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0)) * 1000);
    }
    return null;
  }

  // Pure integer seconds
  const seconds = Number(trimmed);
  if (!isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  return null;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a timestamp in the currently playing track')
    .addStringOption((option) =>
      option
        .setName('position')
        .setDescription('Timestamp to seek to (e.g. 1:30 or 90)')
        .setRequired(true),
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

    const currentTrack = precondition.player.queue.current;
    if (!currentTrack) {
      await interaction.editReply({
        embeds: [errorEmbed('Nothing is currently playing.')],
      });
      return;
    }

    if (currentTrack.track.isStream) {
      await interaction.editReply({
        embeds: [errorEmbed('Cannot seek in a live audio stream.')],
      });
      return;
    }

    const input = interaction.options.getString('position', true);
    const positionMs = parsePositionToMs(input);

    if (positionMs === null || positionMs < 0 || positionMs > currentTrack.track.duration) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            `Invalid seek position. Enter a timestamp up to track length (\`${formatDuration(currentTrack.track.duration)}\`), e.g. \`1:30\`.`,
          ),
        ],
      });
      return;
    }

    await precondition.player.seek(positionMs);
    await interaction.editReply({
      embeds: [successEmbed(`Seeked to **${formatDuration(positionMs)}**`)],
    });
  },
};

export default command;
