import {
  type Interaction,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  type Client,
  Collection,
} from 'discord.js';
import { childLogger } from '../core/logger.js';
import { type Command } from '../core/loader.js';
import { checkVoicePreconditions } from '../utils/preconditions.js';
import { PLAYER_BUTTON_IDS, buildNowPlayingButtons } from '../utils/buttons.js';
import { nowPlayingEmbed, errorEmbed } from '../utils/embed.js';

const log = childLogger('events/interactionCreate');

const event = {
  name: 'interactionCreate',
  once: false as const,

  async execute(interaction: Interaction): Promise<void> {
    const client = interaction.client as Client & { commands: Collection<string, Command> };

    // ── 1. Slash Commands ─────────────────────────────────────────────────────
    if (interaction instanceof ChatInputCommandInteraction) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        log.warn(
          { commandName: interaction.commandName, userId: interaction.user.id },
          'Unknown slash command received',
        );
        await interaction.reply({ content: 'Unknown command.', ephemeral: true });
        return;
      }

      try {
        await command.execute(interaction);
      } catch (err) {
        log.error(
          {
            err,
            commandName: interaction.commandName,
            guildId: interaction.guildId,
            userId: interaction.user.id,
          },
          'Command execution failed',
        );

        const errorPayload = {
          content: 'Something went wrong running that command.',
          ephemeral: true,
        };

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(errorPayload).catch(() => undefined);
        } else {
          await interaction.reply(errorPayload).catch(() => undefined);
        }
      }

      return;
    }

    // ── 2. Autocomplete ───────────────────────────────────────────────────────
    if (interaction instanceof AutocompleteInteraction) {
      const command = client.commands.get(interaction.commandName);

      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (err) {
        log.error(
          {
            err,
            commandName: interaction.commandName,
            guildId: interaction.guildId,
          },
          'Autocomplete handler failed',
        );
      }

      return;
    }

    // ── 3. Interactive Now-Playing Button Controls ─────────────────────────────
    if (interaction instanceof ButtonInteraction) {
      const customId = interaction.customId;

      if (
        customId !== PLAYER_BUTTON_IDS.TOGGLE_PAUSE &&
        customId !== PLAYER_BUTTON_IDS.SKIP &&
        customId !== PLAYER_BUTTON_IDS.STOP
      ) {
        return;
      }

      // Precondition: user must be in the same voice channel with an active player
      const precondition = await checkVoicePreconditions(interaction, true);
      if (!precondition.success) {
        await interaction.reply({
          embeds: [errorEmbed(precondition.errorMessage)],
          ephemeral: true,
        });
        return;
      }
      if (!precondition.player) {
        await interaction.reply({
          embeds: [errorEmbed('Nothing is currently playing in this server.')],
          ephemeral: true,
        });
        return;
      }

      const player = precondition.player;

      try {
        if (customId === PLAYER_BUTTON_IDS.TOGGLE_PAUSE) {
          if (player.isPaused) {
            await player.resume();
          } else {
            await player.pause();
          }

          const now = player.nowPlaying();
          if (now) {
            await interaction.update({
              embeds: [nowPlayingEmbed(now)],
              components: [buildNowPlayingButtons(player.isPaused)],
            });
          } else {
            await interaction.deferUpdate();
          }
        } else if (customId === PLAYER_BUTTON_IDS.SKIP) {
          await player.skip();
          await interaction.reply({
            content: 'Skipped track.',
            ephemeral: true,
          });
        } else if (customId === PLAYER_BUTTON_IDS.STOP) {
          await player.stop();
          await interaction.reply({
            content: 'Stopped playback and cleared the queue.',
            ephemeral: true,
          });
        }
      } catch (err) {
        log.error({ err, customId, guildId: interaction.guildId }, 'Button interaction failed');
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'Failed to process player control.',
            ephemeral: true,
          });
        }
      }
    }
  },
};

export default event;
