// Shared fixtures for server unit tests. MUST stay importable without side
// effects: never import ./db here (it opens the real workspace DB) — tests
// run exclusively against :memory: databases created by makeDb().
import Database from 'better-sqlite3'
import { applySchema } from './schema'

export function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  applySchema(db)
  return db
}

export interface SeedAppOpts {
  id: string
  name: string
  slug: string
  /** Number of saved blueprint versions; current_version is set to this. Default 1. */
  versions?: number
  updatedAt?: string
}

export function seedApp(db: Database.Database, opts: SeedAppOpts): void {
  const versions = opts.versions ?? 1
  const ts = opts.updatedAt ?? '2026-01-01T00:00:00.000Z'
  db.prepare(
    `INSERT INTO temporary_apps (id, name, slug, description, current_version, workspace_path, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
  ).run(opts.id, opts.name, opts.slug, versions, `apps/${opts.slug}`, ts, ts)
  const ins = db.prepare(
    `INSERT INTO app_versions (id, app_id, version_number, blueprint_path, output_md_path, created_at)
     VALUES (?, ?, ?, NULL, NULL, ?)`,
  )
  for (let v = 1; v <= versions; v++) ins.run(`${opts.id}-v${v}`, opts.id, v, ts)
}
