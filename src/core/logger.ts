import pino, { type Logger } from 'pino';
import { env } from '../config/env.js';

// ─── Root logger ─────────────────────────────────────────────────────────────

const isDev =
  process.env['NODE_ENV'] !== 'production' &&
  process.stdout.isTTY === true;

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {
        formatters: {
          level(label: string) {
            return { level: label };
          },
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }),
});

// ─── Child-logger factory ─────────────────────────────────────────────────────

/**
 * Create a child logger with a fixed `module` binding and optional extra fields.
 */
export function childLogger(
  module: string,
  bindings: Record<string, unknown> = {},
): Logger {
  return logger.child({ module, ...bindings });
}
