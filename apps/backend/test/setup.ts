// Runs before each test file's module evaluation.
// We must set env here so that `import { AppModule }` (which calls
// `ConfigModule.forRoot({ validate: loadEnv })`) succeeds at import time.
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'info';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_COOKIE_NAME = 'sid';
process.env.SESSION_COOKIE_SECRET = 'a'.repeat(32);
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.AI_PROVIDER = 'pollinations';
process.env.AI_PRIMARY_BASE_URL = 'https://example.com';
process.env.AI_FALLBACK_BASE_URL = 'https://example.com';
process.env.AI_PRIMARY_API_KEY = '';
process.env.AI_FALLBACK_API_KEY = '';
process.env.GENERATION_TIMEOUT_MS = '60000';
process.env.GENERATION_HARD_TIMEOUT_MS = '90000';
process.env.STORAGE_PROVIDER = 'supabase';
process.env.SUPABASE_URL = 'https://example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_STORAGE_BUCKET = 'interior-dev';
process.env.SIGNED_URL_TTL_SECONDS = '900';
process.env.RATE_LIMIT_PER_SESSION_PER_MIN = '10';
