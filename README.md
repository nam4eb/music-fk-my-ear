# VibeBox 2.0 — Personal Music (Full-stack)

A private, mobile-first music app built with **Next.js 16, React 19, Tailwind CSS 4, Express, PostgreSQL, and Cloudflare R2**. Single-owner account. Stream your own audio files via temporary signed URLs, organize by genre/language/mood, create playlists, and get behavior-based Daily Mix recommendations. Shared pure TypeScript recommendation logic is reusable in a later Expo client.

**[Hướng dẫn cài đặt và triển khai đầy đủ (Tiếng Việt)](docs/DEPLOY_VI.md)**

## What is included

- Responsive dark-mode Next.js UI, English + Vietnamese interface, installable PWA shell, mobile player and desktop controls.
- Native HTML5 audio playback: play/pause, seek, queue, shuffle, repeat, volume, Media Session API.
- First-time owner setup protected with a private `SETUP_TOKEN`, password hashed with bcrypt, JWT bearer authentication, API rate limiting.
- Private R2 direct browser uploads (presigned PUT) and streaming (presigned GET), artwork uploads, server-side file existence/length verification; local filesystem driver for development without R2.
- PostgreSQL metadata, playlists, favorites and listening history. REST CRUD scoped to owner.
- Deterministic 30-day personalized Daily Mix, mood/time of day suggestions, insights over 7 days. **No AI model or audio analysis claimed.** Filename keyword tagging is conservative and optional/manual.
- GitHub Pages CI workflow to export Next.js frontend. Backend must run separately on a Node host.

## Folder structure

```text
apps/web/                  Next.js 16 static export + Tailwind 4 + mobile UI
apps/api/                  Express API, PostgreSQL, private R2/local storage
apps/api/sql/001_init.sql  Database schema
packages/core/             Shared domain types, taxonomy, recommendations and tests
docs/DEPLOY_VI.md          Setup, R2/Neon/Render/Pages deployment guide
docs/r2-cors.json          Example R2 CORS policy
.github/workflows/         Test/build/deploy static frontend to GitHub Pages
docker-compose.yml         Local PostgreSQL 16 (development only)
```

## Quick start

```bash
docker compose up -d db
docker compose exec -T db psql -U vibebox -d vibebox < apps/api/sql/001_init.sql
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
# Edit apps/api/.env, set random JWT_SECRET (32+) and SETUP_TOKEN (16+)
npm run dev:api  # terminal 1
npm run dev:web  # terminal 2
```

Open http://localhost:3000. `STORAGE_DRIVER=local` makes uploads functional without an R2 account **while testing locally**. Do not use ephemeral local storage on free cloud hosts.

## Commands

```bash
npm test                     # 7 shared ranking/metadata logic tests
npm run build:core           # build shared TypeScript package
npm run build:web            # Next.js static export -> apps/web/out
npm run build:api            # TypeScript -> apps/api/dist
npm run build                # build all
```

## API outline

| Method | Route | Description |
|---|---|---|
| GET | `/health` | Health/configured storage mode |
| GET | `/api/config` | First-user setup status and upload limit |
| POST | `/api/auth/setup` | Create owner once with setup token |
| POST | `/api/auth/login` | Login with email/password |
| GET | `/api/auth/me` | Session check |
| GET | `/api/bootstrap` | Tracks, playlists, listening events |
| GET | `/api/mixes/daily` | Suggested tracks from history |
| POST | `/api/uploads/init` | Signed PUT URL for track/cover |
| POST | `/api/uploads/complete` | Verify bytes and save track/cover in database |
| GET | `/api/tracks/:id/stream-url` | Short-lived private audio URL |
| GET | `/api/tracks/:id/cover-url` | Short-lived private cover URL |
| PATCH/DELETE | `/api/tracks/:id` | Metadata/favorite update; delete audio |
| GET/POST | `/api/playlists` | List/create playlists |
| PATCH/DELETE | `/api/playlists/:id` | Update/delete playlists |
| POST/DELETE | `/api/playlists/:id/tracks[/:trackId]` | Add/remove tracks |
| POST | `/api/events` | Listening activity |
| GET | `/api/insights` | Seven-day summary |

Protected routes require `Authorization: Bearer <JWT>`. Secrets never belong in frontend environment variables. Only upload files you own or have permission to use.

## Status / limitations

- This archive contains source code and unit tests. A real deployment still requires setting up DB, R2, backend hosting, credentials, migrations and acceptance testing. No production deployment is claimed.
- No server-side ffmpeg transcoding/audio fingerprinting or automated audio mood/language detection. Manual tagging and conservative filename hints are available.
- PWA caches same-origin frontend shell assets, not private cloud music. Offline cloud listening is not implemented yet.
- Signed URLs expire; request fresh link when resuming a track if it errors.
- Local test driver is not intended for production. Remaining TODOs: orphan upload cleanup on failed/expired sessions, historical event pagination past 3000 events, multipart uploads >100MB, token revocation/HttpOnly same-origin authentication, native Expo implementation.
