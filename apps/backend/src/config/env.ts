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

  AI_PROVIDER: z.enum(['pollinations', 'myceli']).default('pollinations'),
  AI_PRIMARY_BASE_URL: z.string().url(),
  AI_FALLBACK_BASE_URL: z.string().url(),
  AI_PRIMARY_API_KEY: z.string().optional().default(''),
  AI_FALLBACK_API_KEY: z.string().optional().default(''),
  GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  GENERATION_HARD_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),

  STORAGE_PROVIDER: z.enum(['supabase']).default('supabase'),
  SUPABASE_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_STORAGE_BUCKET: z.string().min(1),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  RATE_LIMIT_PER_SESSION_PER_MIN: z.coerce.number().int().positive().default(10),
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
