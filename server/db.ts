import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { applySchema } from './schema'

// FourFive's own metadata lives in a single SQLite file inside the workspace dir.
// Per-app design artifacts (blueprint.json, erd.mmd, ...) will live in
// workspace/apps/<slug>/ folders (added in later phases).
// The ONE allowed absolute path: anchor the workspace to THIS module's location
// (<project>/server/db.ts -> <project>/workspace), not process.cwd(), so it
// resolves identically no matter where the server is launched from. Everything
// persisted (DB path columns) is stored RELATIVE to WORKSPACE_DIR — never absolute.
export const WORKSPACE_DIR = resolve(import.meta.dirname, '..', 'workspace')
mkdirSync(WORKSPACE_DIR, { recursive: true })

const DB_PATH = resolve(WORKSPACE_DIR, 'codev.db')

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
applySchema(db)

export function nowIso(): string {
  return new Date().toISOString()
}

// Default title for a freshly-created session. Treated as "unnamed": the first
// blueprint auto-names the session after its app (see server/workspace.ts),
// unless the user has already renamed it.
export const DEFAULT_SESSION_TITLE = 'New session'
