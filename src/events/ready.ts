import { type Client } from 'discord.js';
import { childLogger } from '../core/logger.js';

const log = childLogger('events/ready');

const event = {
  name: 'ready',
  once: true as const,

  execute(client: Client<true>): void {
    log.info(
      {
        tag: client.user.tag,
        id: client.user.id,
        guilds: client.guilds.cache.size,
      },
      'Bot is online and ready',
    );
  },
};

export default event;
