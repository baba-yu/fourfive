import type Database from 'better-sqlite3'

// All DDL for the FourFive metadata DB, applied by db.ts to the real on-disk
// connection and by tests to an in-memory one. Must stay side-effect free:
// no connection is created here.
export function applySchema(db: Database.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS temporary_apps (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  description     TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  workspace_path  TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  app_id     TEXT REFERENCES temporary_apps(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS app_versions (
  id             TEXT PRIMARY KEY,
  app_id         TEXT NOT NULL REFERENCES temporary_apps(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  blueprint_path TEXT,
  output_md_path TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_runs (
  id         TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  provider   TEXT NOT NULL,
  model      TEXT,
  prompt     TEXT,
  response   TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_dependencies (
  app_id            TEXT NOT NULL REFERENCES temporary_apps(id) ON DELETE CASCADE,
  depends_on_app_id TEXT NOT NULL REFERENCES temporary_apps(id),
  pinned_version    INTEGER NOT NULL,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (app_id, depends_on_app_id)
);
`)

  // Migration: add token columns to messages on DBs created before usage tracking.
  const cols = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'input_tokens')) db.exec('ALTER TABLE messages ADD COLUMN input_tokens INTEGER')
  if (!cols.some((c) => c.name === 'output_tokens')) db.exec('ALTER TABLE messages ADD COLUMN output_tokens INTEGER')
}
