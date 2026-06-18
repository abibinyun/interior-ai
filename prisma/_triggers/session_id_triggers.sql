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
