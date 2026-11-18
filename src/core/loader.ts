import { readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Client, type Collection } from 'discord.js';
import { childLogger } from './logger.js';

const log = childLogger('loader');

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface Command {
  data: { name: string; toJSON(): unknown };
  execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: import('discord.js').AutocompleteInteraction): Promise<void>;
}

export interface BotEvent {
  name: string;
  once?: boolean;
  execute(...args: unknown[]): Promise<void> | void;
}

// ─── Command loader ───────────────────────────────────────────────────────────

/**
 * Recursively scan `commandsDir` for .ts/.js files and load each default
 * export as a Command. The command is indexed by its slash-command name.
 */
export async function loadCommands(
  client: Client & { commands: Collection<string, Command> },
  commandsDir: string,
): Promise<void> {
  const files = getFiles(commandsDir, ['.ts', '.js']);

  let loaded = 0;
  for (const file of files) {
    try {
      const moduleUrl = pathToFileURL(file).href;
      const mod = (await import(moduleUrl)) as { default?: Command };

      if (!mod.default || typeof mod.default.execute !== 'function') {
        log.warn({ file }, 'Command file missing default export with execute(); skipping');
        continue;
      }

      const command = mod.default;
      client.commands.set(command.data.name, command);
      log.debug({ name: command.data.name, file }, 'Command loaded');
      loaded++;
    } catch (err) {
      log.error({ err, file }, 'Failed to load command');
    }
  }

  log.info({ count: loaded }, 'Commands loaded');
}

// ─── Event loader ─────────────────────────────────────────────────────────────

/**
 * Recursively scan `eventsDir` for .ts/.js files and register each default
 * export as a Discord client event listener.
 */
export async function loadEvents(client: Client, eventsDir: string): Promise<void> {
  const files = getFiles(eventsDir, ['.ts', '.js']);

  let loaded = 0;
  for (const file of files) {
    try {
      const moduleUrl = pathToFileURL(file).href;
      const mod = (await import(moduleUrl)) as { default?: BotEvent };

      if (!mod.default || typeof mod.default.execute !== 'function') {
        log.warn({ file }, 'Event file missing default export with execute(); skipping');
        continue;
      }

      const event = mod.default;
      if (event.once === true) {
        client.once(event.name, (...args) => void event.execute(...args));
      } else {
        client.on(event.name, (...args) => void event.execute(...args));
      }

      log.debug(
        { name: event.name, once: event.once ?? false, file },
        'Event registered',
      );
      loaded++;
    } catch (err) {
      log.error({ err, file }, 'Failed to load event');
    }
  }

  log.info({ count: loaded }, 'Events registered');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getFiles(fullPath, extensions));
      } else if (extensions.includes(extname(entry.name))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory does not exist yet during initial scaffold
  }
  return results;
}

/**
 * Resolve an absolute path relative to the project root.
 */
export function resolveFromRoot(...segments: string[]): string {
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  return join(__dirname, '..', '..', ...segments);
}
