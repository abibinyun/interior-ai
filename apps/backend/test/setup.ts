// Runs before each test file's module evaluation.
// We must set env here so that `import { AppModule }` (which calls
// `ConfigModule.forRoot({ validate: loadEnv })`) succeeds at import time.
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'info';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://interior:interior@127.0.0.1:5432/interior?schema=public';
process.env.SESSION_COOKIE_NAME = 'sid';
process.env.SESSION_COOKIE_SECRET = 'a'.repeat(32);
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.AI_PROVIDER = 'pollinations';
process.env.AI_PRIMARY_BASE_URL = 'https://gen.pollinations.ai';
process.env.AI_FALLBACK_BASE_URL = 'https://api.myceli.ai';
process.env.AI_PRIMARY_API_KEY = '';
process.env.AI_FALLBACK_API_KEY = '';
process.env.GENERATION_TIMEOUT_MS = '60000';
process.env.GENERATION_HARD_TIMEOUT_MS = '90000';
process.env.STORAGE_PROVIDER = 'supabase';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_STORAGE_BUCKET = 'generations';
process.env.SIGNED_URL_TTL_SECONDS = '900';
process.env.RATE_LIMIT_PER_SESSION_PER_MIN = '10';
// Disable the auto-trigger so tests can drive the pipeline manually
// without racing the production fire-and-forget path.
process.env.ENABLE_GENERATION_AUTO_TRIGGER = 'false';
