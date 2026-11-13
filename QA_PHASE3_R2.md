# Music Fuq Me 2.3 — Phase 3 R2 QA

**Scope:** source-based migration to private Cloudflare R2. No Cloudflare account was connected in this test environment.

## PASS (offline)

- 7/7 recommendation-engine tests.
- 3/3 Google owner-policy tests.
- 5/5 bulk-selection tests.
- 8/8 R2 migration safety-helper tests (dry-run defaults, explicit confirmation, input limits, key validation and remote integrity checks).
- Node syntax checks on the 3 modified backend TS files, and TypeScript parser/transpilation syntax checks on 4 modified TS/TSX files.
- New API behavior wired to per-object driver in PostgreSQL; new uploads assigned driver from current API config, reads and deletes use persisted per-object driver.
- Migration SQL is additive and defaults existing records to `local`; CLI never deletes original local source files.
- Both ZIP archives passed `testzip()` integrity check.

## NOT VERIFIED (needs user's Windows machine / live cloud)

- `npm install` and a complete Next.js + Express build: npm registry DNS was unavailable to this execution environment; static syntax checks do not replace a full typecheck.
- PostgreSQL SQL 003 on the user's actual DB, including the 765 imported tracks.
- Live private R2 bucket, IAM credential and CORS functionality.
- Browser playback seeking/streaming over R2, upload-complete verification and cover display.
- Production HTTPS/API hosting or Google OAuth flow against a live domain.

## Safe acceptance sequence

1. Extract patch without overwriting `.env`; run `npm install`, `npm run build:core`, `npm run build:api`, `npm run build:web`.
2. Run SQL 003 against correct DB and keep media files in place.
3. Run `npm run r2:check` to verify bucket PUT/HEAD/GET/DELETE.
4. Run `npm run r2:migrate` without any flags (inventory only).
5. Apply pilot of five files using `--apply --confirm --limit=5 --verify-download`, test old and migrated playback.
6. Run full migration, observe `/api/storage/status` and manually verify several random tracks; do not delete originals automatically.
7. Host API and Postgres on production services only after media migration or ensuring the new host can access local legacy media.

## Known limitations

- Single PUT is used for file uploads; no multipart/resume in the browser yet. Cloudflare recommends multipart for large media or unstable connections.
- Presigned URLs have a limited lifetime. A live player may need to request a new signed URL after expiry.
- Uploads abandoned before `/api/uploads/complete` may create orphaned R2 objects; cleanup lifecycle/job remains future work.
- Local backup copies of migrated tracks are retained intentionally and must be cleaned up manually only after independent verification and backup.
- Signed audio URLs are bearer capabilities until expiry. Do not publish them or store them in logs.
