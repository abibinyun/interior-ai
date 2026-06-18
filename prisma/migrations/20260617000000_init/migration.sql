-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "room_status" AS ENUM ('BRIEF_DRAFT', 'GENERATING', 'IN_REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "generation_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "room_type" AS ENUM ('LIVING_ROOM', 'DINING_ROOM', 'KITCHEN', 'MASTER_BEDROOM', 'BATHROOM', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "reference_source_type" AS ENUM ('GENERATED', 'UPLOADED', 'EXTERNAL_URL');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "style_key" TEXT NOT NULL,
    "style_notes" TEXT,
    "color_tendencies_json" JSONB,
    "material_prefs_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "session_id" TEXT,
    "room_type" "room_type" NOT NULL,
    "status" "room_status" NOT NULL DEFAULT 'BRIEF_DRAFT',
    "approved_generation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_briefs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "purpose" TEXT,
    "occupants" TEXT,
    "lighting_preferences" TEXT,
    "furniture_requirements" TEXT,
    "constraints" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "session_id" TEXT,
    "batch_id" UUID NOT NULL,
    "option_index" SMALLINT NOT NULL,
    "parent_generation_id" UUID,
    "prompt" TEXT NOT NULL,
    "negative_prompt" TEXT,
    "image_url" TEXT,
    "storage_object_key" TEXT,
    "status" "generation_status" NOT NULL DEFAULT 'PENDING',
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "session_id" TEXT,
    "source_type" "reference_source_type" NOT NULL,
    "source_id" UUID,
    "storage_object_key" TEXT,
    "external_url" TEXT,
    "mime_type" TEXT,
    "byte_size" BIGINT,
    "original_filename" TEXT,
    "caption" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_bundles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "session_id" TEXT,
    "version" INTEGER NOT NULL,
    "storage_object_key" TEXT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_session_id_created_at_idx" ON "projects"("session_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "projects_session_id_name_key" ON "projects"("session_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "style_profiles_project_id_key" ON "style_profiles"("project_id");

-- CreateIndex
CREATE INDEX "rooms_session_id_created_at_idx" ON "rooms"("session_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_project_id_room_type_key" ON "rooms"("project_id", "room_type");

-- CreateIndex
CREATE UNIQUE INDEX "design_briefs_room_id_key" ON "design_briefs"("room_id");

-- CreateIndex
CREATE INDEX "generations_room_id_created_at_idx" ON "generations"("room_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "generations_batch_id_idx" ON "generations"("batch_id");

-- CreateIndex
CREATE INDEX "generations_parent_generation_id_idx" ON "generations"("parent_generation_id");

-- CreateIndex
CREATE INDEX "generations_status_idx" ON "generations"("status");

-- CreateIndex
CREATE INDEX "generations_session_id_created_at_idx" ON "generations"("session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "references_room_id_idx" ON "references"("room_id");

-- CreateIndex
CREATE INDEX "references_session_id_idx" ON "references"("session_id");

-- CreateIndex
CREATE INDEX "export_bundles_project_id_created_at_idx" ON "export_bundles"("project_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "export_bundles_project_id_version_key" ON "export_bundles"("project_id", "version");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_briefs" ADD CONSTRAINT "design_briefs_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_parent_generation_id_fkey" FOREIGN KEY ("parent_generation_id") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "references" ADD CONSTRAINT "references_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_bundles" ADD CONSTRAINT "export_bundles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Defensive session_id denormalization (ADR-005)
-- + CHECK constraints not expressible in Prisma schema
-- ============================================================================

-- Defensive session_id denormalization triggers
-- ADR-005: deny cross-session data leakage by maintaining a denormalized
-- session_id on every child table, populated by Postgres triggers (not app code).
--
-- This file is idempotent: every CREATE uses IF NOT EXISTS or OR REPLACE.

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rooms_sync_session_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT session_id
    INTO NEW.session_id
    FROM projects
   WHERE id = NEW.project_id;
  IF NEW.session_id IS NULL THEN
    RAISE EXCEPTION 'rooms_sync_session_id: project % not found', NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rooms_session_id ON rooms;
CREATE TRIGGER trg_rooms_session_id
BEFORE INSERT OR UPDATE OF project_id ON rooms
FOR EACH ROW EXECUTE FUNCTION rooms_sync_session_id();

-- ---------------------------------------------------------------------------
-- generations (via rooms -> projects)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION generations_sync_session_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT r.session_id
    INTO NEW.session_id
    FROM rooms r
   WHERE r.id = NEW.room_id;
  IF NEW.session_id IS NULL THEN
    RAISE EXCEPTION 'generations_sync_session_id: room % not found', NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generations_session_id ON generations;
CREATE TRIGGER trg_generations_session_id
BEFORE INSERT OR UPDATE OF room_id ON generations
FOR EACH ROW EXECUTE FUNCTION generations_sync_session_id();

-- ---------------------------------------------------------------------------
-- references (via rooms -> projects)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION references_sync_session_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT r.session_id
    INTO NEW.session_id
    FROM rooms r
   WHERE r.id = NEW.room_id;
  IF NEW.session_id IS NULL THEN
    RAISE EXCEPTION 'references_sync_session_id: room % not found', NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_references_session_id ON "references";
CREATE TRIGGER trg_references_session_id
BEFORE INSERT OR UPDATE OF room_id ON "references"
FOR EACH ROW EXECUTE FUNCTION references_sync_session_id();

-- ---------------------------------------------------------------------------
-- export_bundles (via projects)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION export_bundles_sync_session_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT session_id
    INTO NEW.session_id
    FROM projects
   WHERE id = NEW.project_id;
  IF NEW.session_id IS NULL THEN
    RAISE EXCEPTION 'export_bundles_sync_session_id: project % not found', NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_export_bundles_session_id ON export_bundles;
CREATE TRIGGER trg_export_bundles_session_id
BEFORE INSERT OR UPDATE OF project_id ON export_bundles
FOR EACH ROW EXECUTE FUNCTION export_bundles_sync_session_id();

-- ---------------------------------------------------------------------------
-- CHECK constraints not expressible in Prisma schema
-- (Project status transition logic is enforced at the application layer
-- via BaseRepository; only static invariants are CHECK-constrained here.)
-- ---------------------------------------------------------------------------

-- CHECK constraints from docs/06-database-design.md §3.2
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_name_length_chk;
ALTER TABLE projects
  ADD CONSTRAINT projects_name_length_chk
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 80);

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_description_length_chk;
ALTER TABLE projects
  ADD CONSTRAINT projects_description_length_chk
  CHECK (description IS NULL OR char_length(description) <= 1000);

-- §3.3 style_profiles
ALTER TABLE style_profiles
  DROP CONSTRAINT IF EXISTS style_profiles_style_key_chk;
ALTER TABLE style_profiles
  ADD CONSTRAINT style_profiles_style_key_chk
  CHECK (style_key IN ('JAPANDI','SCANDINAVIAN','INDUSTRIAL','MODERN_MINIMALIST','CONTEMPORARY_LUXURY'));

ALTER TABLE style_profiles
  DROP CONSTRAINT IF EXISTS style_profiles_style_notes_length_chk;
ALTER TABLE style_profiles
  ADD CONSTRAINT style_profiles_style_notes_length_chk
  CHECK (style_notes IS NULL OR char_length(style_notes) <= 1000);

-- §3.4 rooms
-- A room can only be APPROVED if it has an approved_generation_id.
-- Equivalently: if approved_generation_id is NULL, status must NOT be APPROVED.
ALTER TABLE rooms
  DROP CONSTRAINT IF EXISTS rooms_approved_consistency_chk;
ALTER TABLE rooms
  ADD CONSTRAINT rooms_approved_consistency_chk
  CHECK (status <> 'APPROVED' OR approved_generation_id IS NOT NULL);

-- §3.5 design_briefs (length caps per B-01)
ALTER TABLE design_briefs
  DROP CONSTRAINT IF EXISTS design_briefs_length_chk;
ALTER TABLE design_briefs
  ADD CONSTRAINT design_briefs_length_chk
  CHECK (
    (purpose               IS NULL OR char_length(purpose)               <= 1000) AND
    (occupants             IS NULL OR char_length(occupants)             <= 500)  AND
    (lighting_preferences  IS NULL OR char_length(lighting_preferences)  <= 500)  AND
    (furniture_requirements IS NULL OR char_length(furniture_requirements) <= 1000) AND
    (constraints           IS NULL OR char_length(constraints)           <= 1000)
  );

-- §3.6 generations
ALTER TABLE generations
  DROP CONSTRAINT IF EXISTS generations_option_index_chk;
ALTER TABLE generations
  ADD CONSTRAINT generations_option_index_chk
  CHECK (option_index BETWEEN 1 AND 3);

ALTER TABLE generations
  DROP CONSTRAINT IF EXISTS generations_no_self_parent_chk;
ALTER TABLE generations
  ADD CONSTRAINT generations_no_self_parent_chk
  CHECK (parent_generation_id <> id);

ALTER TABLE generations
  DROP CONSTRAINT IF EXISTS generations_image_url_consistency_chk;
ALTER TABLE generations
  ADD CONSTRAINT generations_image_url_consistency_chk
  CHECK ((status IN ('COMPLETED','FAILED')) OR (image_url IS NULL AND storage_object_key IS NULL));

ALTER TABLE generations
  DROP CONSTRAINT IF EXISTS generations_image_url_complete_chk;
ALTER TABLE generations
  ADD CONSTRAINT generations_image_url_complete_chk
  CHECK ((status = 'COMPLETED') = (image_url IS NOT NULL));

ALTER TABLE generations
  DROP CONSTRAINT IF EXISTS generations_prompt_length_chk;
ALTER TABLE generations
  ADD CONSTRAINT generations_prompt_length_chk
  CHECK (char_length(prompt) BETWEEN 10 AND 4000);

-- §3.7 references
ALTER TABLE "references"
  DROP CONSTRAINT IF EXISTS references_source_consistency_chk;
ALTER TABLE "references"
  ADD CONSTRAINT references_source_consistency_chk
  CHECK (
    ((source_type = 'GENERATED')   = (source_id IS NOT NULL))        AND
    ((source_type = 'EXTERNAL_URL') = (external_url IS NOT NULL))    AND
    ((source_type = 'UPLOADED')     = (storage_object_key IS NOT NULL))
  );

ALTER TABLE "references"
  DROP CONSTRAINT IF EXISTS references_uploaded_consistency_chk;
ALTER TABLE "references"
  ADD CONSTRAINT references_uploaded_consistency_chk
  CHECK (
    (source_type <> 'UPLOADED') OR
    (mime_type  IS NOT NULL AND byte_size IS NOT NULL AND byte_size > 0 AND byte_size <= 10485760)
  );

ALTER TABLE "references"
  DROP CONSTRAINT IF EXISTS references_mime_type_chk;
ALTER TABLE "references"
  ADD CONSTRAINT references_mime_type_chk
  CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg','image/png','image/webp'));

ALTER TABLE "references"
  DROP CONSTRAINT IF EXISTS references_caption_length_chk;
ALTER TABLE "references"
  ADD CONSTRAINT references_caption_length_chk
  CHECK (caption IS NULL OR char_length(caption) <= 500);

-- §3.8 export_bundles
ALTER TABLE export_bundles
  DROP CONSTRAINT IF EXISTS export_bundles_version_chk;
ALTER TABLE export_bundles
  ADD CONSTRAINT export_bundles_version_chk
  CHECK (version >= 1);

ALTER TABLE export_bundles
  DROP CONSTRAINT IF EXISTS export_bundles_byte_size_chk;
ALTER TABLE export_bundles
  ADD CONSTRAINT export_bundles_byte_size_chk
  CHECK (byte_size > 0);
