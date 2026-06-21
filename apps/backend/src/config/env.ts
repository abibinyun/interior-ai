import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),

  SESSION_COOKIE_NAME: z.string().default('sid'),
  SESSION_COOKIE_SECRET: z
    .string()
    .min(32, 'SESSION_COOKIE_SECRET must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  AI_PROVIDER: z.enum(['pollinations', 'myceli', 'ai-horde']).default('pollinations'),
  AI_PRIMARY_BASE_URL: z.string().url(),
  AI_FALLBACK_BASE_URL: z.string().url(),
  AI_PRIMARY_API_KEY: z.string().optional().default(''),
  AI_FALLBACK_API_KEY: z.string().optional().default(''),
  // AI Horde (https://stablehorde.net/) — crowdsourced image
  // generation. Async submit + poll API. An API key is recommended
  // (registered at https://stablehorde.net/register) — without one
  // you're in the anonymous pool with a per-IP rate limit and
  // higher queue position. The key is loaded here as a plain
  // string (NOT a URL) because AI Horde authenticates via the
  // `apikey` header rather than a Bearer token.
  AI_HORDE_BASE_URL: z.string().url().default('https://stablehorde.net/api'),
  AI_HORDE_API_KEY: z.string().optional().default(''),
  GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  GENERATION_HARD_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),

  STORAGE_PROVIDER: z.enum(['supabase']).default('supabase'),
  SUPABASE_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().min(1),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // Rate limiting (ADR-013). The "generations" group covers
  // AI-touching endpoints (`/api/rooms/:id/generations*` and
  // `/api/rooms/:id/approval`) — each call hits the provider + storage
  // so the limit is tighter than the general session limit.
  //
  // Both knobs are tunable per-environment:
  // - `RATE_LIMIT_GENERATIONS_MAX` is the request count per window
  // - `RATE_LIMIT_GENERATIONS_WINDOW_MS` is the window length in ms
  //   (default 60 000 = 1 min)
  //
  // Set `RATE_LIMIT_DISABLED=true` to bypass the guard entirely (used
  // by tests that make many requests within a single session).
  //
  // Foot-gun guard: MAX must be at least 3, otherwise the
  // POST-create + immediate GET-list refetch + first batch poll
  // cycle will trip the limiter on a normal user flow. The schema
  // enforces this at boot.
  RATE_LIMIT_GENERATIONS_MAX: z.coerce
    .number()
    .int()
    .positive()
    .refine((n) => n >= 3, {
      message: 'RATE_LIMIT_GENERATIONS_MAX must be >= 3 (one POST + one refetch + one poll)',
    })
    .default(5),
  RATE_LIMIT_GENERATIONS_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .refine((n) => n >= 1_000, {
      message: 'RATE_LIMIT_GENERATIONS_WINDOW_MS must be >= 1000 (1s floor)',
    })
    .default(60_000),
  RATE_LIMIT_DISABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Maximum JSON request body size in bytes (M17 hardening).
  MAX_REQUEST_BODY_BYTES: z.coerce.number().int().positive().default(100 * 1024),
  // Default true; tests can disable the auto-trigger to keep their prisma
  // updates deterministic (see ADR-014 for why we expose this).
  ENABLE_GENERATION_AUTO_TRIGGER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Always re-read from the source so tests can mutate env between runs
  // and modules loaded at different times see the latest values.
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `${e.path.join('.') || '(root)'}: ${e.message}`)
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${formatted}`);
  }
  return result.data;
}

export function corsOriginsList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
