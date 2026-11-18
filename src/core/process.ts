import { type Client } from 'discord.js';
import { childLogger } from './logger.js';

const log = childLogger('process');

// ─── Unhandled rejection / exception handlers ─────────────────────────────────

/**
 * Log every unhandled promise rejection with full context.
 *
 * We deliberately do NOT exit on unhandledRejection: a thrown error from one
 * guild's player must not crash the entire bot. The exception is uncaughtException,
 * which indicates a programming error severe enough to warrant a restart.
 */
export function registerProcessHandlers(client: Client): void {
  process.on('unhandledRejection', (reason, promise) => {
    log.error(
      {
        err: reason instanceof Error ? reason : new Error(String(reason)),
        promise: String(promise),
      },
      'Unhandled promise rejection — continuing',
    );
  });

  process.on('uncaughtException', (err, origin) => {
    log.fatal({ err, origin }, 'Uncaught exception — shutting down');
    void shutdown(client, 1);
  });

  process.on('uncaughtExceptionMonitor', (err, origin) => {
    log.fatal({ err, origin }, 'uncaughtExceptionMonitor');
  });

  // ─── Graceful shutdown signals ──────────────────────────────────────────────

  process.once('SIGINT', () => {
    log.info('SIGINT received — beginning graceful shutdown');
    void shutdown(client, 0);
  });

  process.once('SIGTERM', () => {
    log.info('SIGTERM received — beginning graceful shutdown');
    void shutdown(client, 0);
  });

  log.debug('Process handlers registered');
}

// ─── Shutdown sequence ────────────────────────────────────────────────────────

let _shutdownInProgress = false;

/**
 * Ordered graceful shutdown:
 * 1. Run all registered shutdown hooks (players, Lavalink nodes) with per-hook timeout
 * 2. Destroy the Discord client
 * 3. Flush the logger and exit
 */
export async function shutdown(client: Client, code: number): Promise<never> {
  if (_shutdownInProgress) {
    await new Promise<never>(() => {});
  }
  _shutdownInProgress = true;

  log.info('Shutdown sequence started');

  for (const [name, hook] of _shutdownHooks) {
    try {
      await Promise.race([
        hook(),
        new Promise<void>((_resolve, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5_000),
        ),
      ]);
      log.debug({ hook: name }, 'Shutdown hook completed');
    } catch (err) {
      log.warn({ err, hook: name }, 'Shutdown hook failed or timed out — continuing');
    }
  }

  try {
    client.destroy();
    log.info('Discord client destroyed');
  } catch (err) {
    log.warn({ err }, 'Error destroying Discord client');
  }

  log.info({ code }, 'Process exiting');

  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  process.exit(code);
}

// ─── Shutdown hook registry ──────────────────────────────────────────────────

const _shutdownHooks = new Map<string, () => Promise<void>>();

export function registerShutdownHook(name: string, hook: () => Promise<void>): void {
  if (_shutdownHooks.has(name)) {
    throw new Error(`Shutdown hook '${name}' is already registered`);
  }
  _shutdownHooks.set(name, hook);
  log.debug({ hook: name }, 'Shutdown hook registered');
}
