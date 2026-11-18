import { readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { childLogger } from '../core/logger.js';
import { env } from '../config/env.js';

const log = childLogger('deploy');

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const commandsDir = join(__dirname, '..', 'commands');

async function collectCommandData(): Promise<unknown[]> {
  const data: unknown[] = [];
  const files = getFiles(commandsDir, ['.ts', '.js']);

  if (files.length === 0) {
    log.warn({ commandsDir }, 'No command files found — is the commands directory populated?');
    return data;
  }

  for (const file of files) {
    try {
      const mod = (await import(pathToFileURL(file).href)) as {
        default?: { data: { toJSON(): unknown } };
      };
      if (mod.default?.data) {
        data.push(mod.default.data.toJSON());
        log.debug({ file }, 'Collected command data');
      }
    } catch (err) {
      log.error({ err, file }, 'Failed to load command for deployment');
    }
  }

  return data;
}

function getFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.map')) {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getFiles(fullPath, extensions));
      } else if (extensions.includes(extname(entry.name))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Commands directory does not exist yet
  }
  return results;
}

async function deploy(): Promise<void> {
  const commands = await collectCommandData();

  if (commands.length === 0) {
    log.warn('No commands to deploy. Populate src/commands/ and try again.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const isGuildDeploy = process.env['DEPLOY_GUILD'] === 'true';

  if (isGuildDeploy) {
    if (!env.DEV_GUILD_ID) {
      log.error('DEV_GUILD_ID is not set in .env — cannot perform guild deploy');
      process.exit(1);
    }

    log.info(
      { guildId: env.DEV_GUILD_ID, commandCount: commands.length },
      'Deploying commands to guild (instant)',
    );

    await rest.put(
      Routes.applicationGuildCommands(env.CLIENT_ID, env.DEV_GUILD_ID),
      { body: commands },
    );

    log.info({ guildId: env.DEV_GUILD_ID }, 'Guild deploy complete');
  } else {
    log.info({ commandCount: commands.length }, 'Deploying commands globally (up to 1 hour propagation)');

    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: commands });

    log.info('Global deploy complete');
  }
}

deploy().catch((err: unknown) => {
  log.fatal({ err }, 'Deploy script failed');
  process.exit(1);
});
