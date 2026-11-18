import { z } from 'zod';

// ─── Lavalink node schema ─────────────────────────────────────────────────────

const LavalinkNodeSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  password: z.string().min(1),
  secure: z.boolean(),
  role: z.enum(['primary', 'residential']),
});

export type LavalinkNodeConfig = z.infer<typeof LavalinkNodeSchema>;

// ─── Root env schema ─────────────────────────────────────────────────────────

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID is required'),
  DEV_GUILD_ID: z.string().optional(),

  OWNER_IDS: z
    .string()
    .min(1, 'OWNER_IDS must have at least one ID')
    .transform((s) =>
      s
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  LAVALINK_NODES: z
    .string()
    .min(1, 'LAVALINK_NODES is required')
    .transform((s, ctx) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(s);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'LAVALINK_NODES must be valid JSON',
        });
        return z.NEVER;
      }
      return parsed;
    })
    .pipe(z.array(LavalinkNodeSchema).min(1, 'At least one Lavalink node is required')),

  MAX_QUEUE_SIZE: z.coerce.number().int().min(1).max(5000).default(500),
  MAX_PER_USER_QUEUE: z.coerce.number().int().min(1).max(500).default(20),
  MAX_PLAYLIST_TRACKS: z.coerce.number().int().min(1).max(1000).default(100),
  IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
});

export type Env = z.infer<typeof EnvSchema>;

// ─── Parse and export ─────────────────────────────────────────────────────────

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    // Use console.error here — logger is not yet initialised
    console.error(`[config] Environment validation failed:\n${issues}`);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

