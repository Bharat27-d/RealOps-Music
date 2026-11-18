import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { trackAddedEmbed, playlistAddedEmbed, errorEmbed } from '../utils/embed.js';
import { resolveInput } from '../music/resolver.js';
import { playerManager } from '../music/manager.js';
import { isPossibleUrl } from '../music/url.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a track, playlist, or search query')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('The URL or search terms to play')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedValue = interaction.options.getFocused().trim();

    if (!focusedValue || isPossibleUrl(focusedValue)) {
      await interaction.respond([]);
      return;
    }

    try {
      const res = await resolveInput(focusedValue, { guildId: interaction.guildId ?? undefined });
      if (res.type === 'search') {
        const choices = res.tracks.slice(0, 10).map((t) => ({
          name: `${t.title.slice(0, 70)} - ${t.author.slice(0, 25)}`,
          value: t.uri,
        }));
        await interaction.respond(choices);
        return;
      }
    } catch {
      // Autocomplete should never throw or break UI
    }

    await interaction.respond([]);
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const precondition = await checkVoicePreconditions(interaction, false);
    if (!precondition.success) {
      await interaction.editReply({ embeds: [errorEmbed(precondition.errorMessage)] });
      return;
    }

    const query = interaction.options.getString('query', true);
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const voiceChannelId = precondition.voiceChannel.id;

    const resolved = await resolveInput(query, {
      guildId,
      userId,
    });

    if (resolved.type === 'empty') {
      await interaction.editReply({ embeds: [errorEmbed(resolved.message)] });
      return;
    }

    if (resolved.type === 'error') {
      await interaction.editReply({ embeds: [errorEmbed(resolved.message)] });
      return;
    }

    const player = await playerManager.getOrCreate({
      guildId,
      voiceChannelId,
      textChannelId: interaction.channelId,
      shardId: interaction.guild?.shardId,
    });

    if (resolved.type === 'track') {
      const addResult = await player.play(resolved.track, userId);
      if (addResult.added === 0) {
        await interaction.editReply({
          embeds: [errorEmbed(addResult.rejectedReason || 'Could not queue track.')],
        });
        return;
      }
      await interaction.editReply({
        embeds: [trackAddedEmbed(resolved.track, player.queue.size)],
      });
      return;
    }

    if (resolved.type === 'playlist') {
      const addResult = await player.playPlaylist(resolved.playlist, userId);
      if (addResult.added === 0) {
        await interaction.editReply({
          embeds: [errorEmbed(addResult.rejectedReason || 'Could not queue playlist.')],
        });
        return;
      }
      await interaction.editReply({
        embeds: [playlistAddedEmbed(resolved.playlist, addResult.added, addResult.capped)],
      });
      return;
    }

    if (resolved.type === 'search') {
      const topTrack = resolved.tracks[0];
      if (!topTrack) {
        await interaction.editReply({
          embeds: [errorEmbed('No tracks found for that search.')],
        });
        return;
      }
      const addResult = await player.play(topTrack, userId);
      if (addResult.added === 0) {
        await interaction.editReply({
          embeds: [errorEmbed(addResult.rejectedReason || 'Could not queue track.')],
        });
        return;
      }
      await interaction.editReply({
        embeds: [trackAddedEmbed(topTrack, player.queue.size)],
      });
    }
  },
};

export default command;
