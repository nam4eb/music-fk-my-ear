# VibeBox 2.0 — QA / verification status

**Completed in this environment:**

- Project package/source files authored for Next.js + Tailwind, Express + PostgreSQL, R2/local storage, and shared TypeScript core.
- `packages/core`: **7/7 unit tests PASS** (filename parsing, conservative tags, time-of-day ranking, completed vs. skipped weighting, listening insights, duration formatting).
- `packages/core`: TypeScript build PASS with local TypeScript compiler.
- All TypeScript/TSX files: syntax parsing performed with TypeScript parser and no syntax diagnostics.
- SQL schema, CORS configuration, GitHub Pages workflow and environment examples added.

**Not completed / not claimed:**

- No `npm install`, Next production build, API typecheck with dependency types or browser end-to-end playback smoke was possible here: the build container cannot resolve `registry.npmjs.org`. Dependencies are specified but no `package-lock.json` is shipped. Run `npm install`, `npm run build` and the end-to-end checklist in `docs/DEPLOY_VI.md` in an internet-connected environment.
- No PostgreSQL database, Render service or R2 bucket was provisioned or connected; no live streaming or production deploy was performed.
- V1 IndexedDB import needs a real device/origin test and is not guaranteed to migrate clouds from an unrelated origin.

**Release status: SOURCE_DELIVERED / LIVE_UNVERIFIED.**


## VibeBox 2.1 — Google Sign-In patch (2026-11-13)

### Changed
- Replaced owner setup/login UI with Google Identity Services button; Google OAuth Web Client ID is obtained from `GET /api/config`.
- New `POST /api/auth/google` verifies Google ID Token server-side using `google-auth-library` and restricts access to `GOOGLE_OWNER_EMAIL`. Google `sub` is bound to the existing owner, or a new owner is created only if the table was empty. No password/setup-token login endpoints remain.
- Added `002_google_owner_auth.sql` to preserve existing `users.id` and all owner-scoped music data; makes password_hash nullable and adds unique `google_sub`.
- Local Docker Postgres published on host port 5433 (internal port 5432).

### Checks actually run
- Shared core: `tsc -p packages/core/tsconfig.json` **PASS**.
- Core recommendation unit tests: **7/7 PASS** (`node --experimental-strip-types --test ...`).
- Google owner policy unit tests: **3/3 PASS** (owner creation, legacy linking, mismatch prevention).
- TypeScript transpile syntax diagnostics for 6 updated TS/TSX files: **PASS**. This is **not equivalent** to full typecheck.
- `npm install` in this sandbox did not complete because package retrieval timed out; full `npm run build:api`, `npm run build:web`, PostgreSQL integration and real Google OAuth sign-in **NOT VERIFIED**.

### Required on developer Windows PC
1. Create OAuth Web Application Client ID and add authorized origin `http://localhost:3000`.
2. Configure `GOOGLE_CLIENT_ID` and `GOOGLE_OWNER_EMAIL` in `apps/api/.env`; retain an actual random JWT_SECRET.
3. Run SQL 001 and 002 in order on the existing PostgreSQL volume. Do not use `docker compose down -v`.
4. `npm install`, `npm run build:core`, `npm run build:api`, `npm run build:web`, `npm run dev:api`, `npm run dev:web`.
5. Validate owner login and non-owner rejection and verify library data.

### Security notes
- Current JWT remains stored in browser localStorage (preexisting architecture), not HttpOnly cookies. Avoid untrusted browser extensions and public devices.
- Rotate JWT_SECRET during migration to invalidate old 7-day login sessions when appropriate.
- Google Client ID is public metadata; Google Client Secret (not used in this flow) and service credentials must never be placed in frontend.
