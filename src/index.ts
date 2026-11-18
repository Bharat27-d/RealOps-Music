import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Collection } from 'discord.js';
import { childLogger } from './core/logger.js';
import { createClient } from './core/client.js';
import { registerProcessHandlers } from './core/process.js';
import { loadCommands, loadEvents, type Command } from './core/loader.js';
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

  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const commandsDir = join(__dirname, 'commands');
  const eventsDir = join(__dirname, 'events');

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
