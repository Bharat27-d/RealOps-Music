import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { childLogger } from './logger.js';

const log = childLogger('client');

/**
 * Build and return the Discord.js client with the minimum intents required
 * for a slash-command-only music bot.
 *
 * Required intents:
 *   - Guilds           : guild/channel metadata for precondition checks and permission lookups
 *   - GuildVoiceStates : track join/leave/move/kick events, idle-timeout detection
 *
 * GuildMessages is intentionally omitted: all interactions are slash commands.
 */
export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel],
    // Sweep stale messages from cache every 5 minutes; keep only the last 30 minutes
    sweepers: {
      messages: {
        interval: 300,
        lifetime: 1800,
      },
    },
  });

  client.once('ready', (c) => {
    log.info(
      { tag: c.user.tag, id: c.user.id, guilds: c.guilds.cache.size },
      'Discord client ready',
    );
  });

  return client;
}
