import { Client, Collection } from 'discord.js';
import { childLogger } from './core/logger.js';
import { createClient } from './core/client.js';
import { registerProcessHandlers } from './core/process.js';
import { loadCommands, loadEvents, resolveFromRoot, type Command } from './core/loader.js';
import { env } from './config/env.js';
import { lavalinkService } from './lavalink/index.js';
import { playerManager } from './music/index.js';

const log = childLogger('bootstrap');

interface BotClient extends Client {
  commands: Collection<string, Command>;
}

async function main(): Promise<void> {
  log.info(
    {
      logLevel: env.LOG_LEVEL,
      nodeCount: env.LAVALINK_NODES.length,
      maxQueueSize: env.MAX_QUEUE_SIZE,
    },
    'RealOps Music bot starting',
  );

  const client = createClient() as BotClient;
  client.commands = new Collection();

  registerProcessHandlers(client);

  const commandsDir = resolveFromRoot('src', 'commands');
  const eventsDir = resolveFromRoot('src', 'events');

  await loadCommands(client, commandsDir);
  await loadEvents(client, eventsDir);

  // ── Initialize Lavalink connection layer & Player Manager ──────────────────
  lavalinkService.init(client);
  playerManager.init(client);

  log.info('Logging in to Discord...');
  await client.login(env.DISCORD_TOKEN);
}

main().catch((err: unknown) => {
  const log2 = childLogger('bootstrap');
  log2.fatal({ err }, 'Fatal error during startup');
  process.exit(1);
});
