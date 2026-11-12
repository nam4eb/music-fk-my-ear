BEGIN;
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  artist text NOT NULL DEFAULT 'Unknown artist',
  album text NOT NULL DEFAULT '',
  genre text NOT NULL DEFAULT 'Other',
  language text NOT NULL DEFAULT 'unknown',
  moods text[] NOT NULL DEFAULT '{}',
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  mime_type text NOT NULL,
  year integer CHECK (year BETWEEN 1900 AND 2100),
  is_favorite boolean NOT NULL DEFAULT false,
  storage_key text NOT NULL UNIQUE,
  cover_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tracks_owner_created_idx ON tracks(owner_id, created_at DESC);
CREATE TABLE IF NOT EXISTS pending_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes > 0),
  kind text NOT NULL CHECK(kind IN ('audio', 'cover')),
  track_id uuid REFERENCES tracks(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);
CREATE INDEX IF NOT EXISTS pending_uploads_owner_idx ON pending_uploads(owner_id);
CREATE TABLE IF NOT EXISTS playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS playlists_owner_idx ON playlists(owner_id);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id uuid NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY(playlist_id, track_id)
);
CREATE INDEX IF NOT EXISTS playlist_tracks_order_idx ON playlist_tracks(playlist_id, position);
CREATE TABLE IF NOT EXISTS listening_events (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK(event_type IN ('play', 'pause', 'skip', 'complete')),
  listened_seconds integer NOT NULL DEFAULT 0 CHECK(listened_seconds BETWEEN 0 AND 86400),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listening_events_owner_date_idx ON listening_events(owner_id, created_at DESC);
COMMIT;
