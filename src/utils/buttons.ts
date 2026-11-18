import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

export const PLAYER_BUTTON_IDS = {
  TOGGLE_PAUSE: 'player_toggle_pause',
  SKIP: 'player_skip',
  STOP: 'player_stop',
} as const;

/**
 * Creates interactive action buttons for the Now Playing card.
 */
export function buildNowPlayingButtons(isPaused: boolean): ActionRowBuilder<ButtonBuilder> {
  const togglePauseButton = new ButtonBuilder()
    .setCustomId(PLAYER_BUTTON_IDS.TOGGLE_PAUSE)
    .setLabel(isPaused ? 'Resume' : 'Pause')
    .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary);

  const skipButton = new ButtonBuilder()
    .setCustomId(PLAYER_BUTTON_IDS.SKIP)
    .setLabel('Skip')
    .setStyle(ButtonStyle.Secondary);

  const stopButton = new ButtonBuilder()
    .setCustomId(PLAYER_BUTTON_IDS.STOP)
    .setLabel('Stop')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    togglePauseButton,
    skipButton,
    stopButton,
  );
}
