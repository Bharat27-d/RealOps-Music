import { type VoiceState } from 'discord.js';
import { playerManager } from '../music/index.js';

const event = {
  name: 'voiceStateUpdate',
  once: false as const,

  execute(oldState: VoiceState, newState: VoiceState): void {
    playerManager.handleVoiceStateUpdate(oldState, newState);
  },
};

export default event;

