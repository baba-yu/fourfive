import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// codev's own metadata lives in a single SQLite file inside the workspace dir.
// Per-app design artifacts (blueprint.json, erd.mmd, ...) will live in
// codev-workspace/apps/<slug>/ folders (added in later phases).
export const WORKSPACE_DIR = resolve(process.cwd(), 'codev-workspace')
mkdirSync(WORKSPACE_DIR, { recursive: true })

const DB_PATH = resolve(WORKSPACE_DIR, 'codev.db')

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

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
  created_at TEXT NOT NULL
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
`)

export function nowIso(): string {
  return new Date().toISOString()
}
