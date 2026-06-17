-- Minimal bootstrap. Real schema ships in M2 (Prisma migrations).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

GRANT ALL PRIVILEGES ON DATABASE interior TO interior;
