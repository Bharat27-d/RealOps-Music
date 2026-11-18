import { type Channel } from 'discord.js';
import { playerManager } from '../music/index.js';

const event = {
  name: 'channelDelete',
  once: false as const,

  execute(channel: Channel): void {
    playerManager.handleChannelDelete(channel);
  },
};

export default event;

