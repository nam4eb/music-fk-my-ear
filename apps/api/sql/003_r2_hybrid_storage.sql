-- Music Fuq Me Phase 3: existing objects are local; new uploads choose driver via API.
-- Run once before switching STORAGE_DRIVER=r2. Idempotent and no data deletion.
BEGIN;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS storage_driver text NOT NULL DEFAULT 'local' CHECK(storage_driver IN ('local','r2'));
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_storage_driver text NOT NULL DEFAULT 'local' CHECK(cover_storage_driver IN ('local','r2'));
ALTER TABLE pending_uploads ADD COLUMN IF NOT EXISTS storage_driver text NOT NULL DEFAULT 'local' CHECK(storage_driver IN ('local','r2'));
CREATE INDEX IF NOT EXISTS tracks_owner_storage_driver_idx ON tracks(owner_id, storage_driver);
COMMIT;
