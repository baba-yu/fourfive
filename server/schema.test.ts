import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from './schema'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  applySchema(db)
  return db
}

function seedApp(db: Database.Database, id: string, slug: string): void {
  db.prepare(
    `INSERT INTO temporary_apps (id, name, slug, description, current_version, workspace_path, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 1, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(id, slug, slug, `apps/${slug}`)
}

describe('applySchema', () => {
  it('creates all tables including app_dependencies', () => {
    const db = makeDb()
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name)
    for (const t of ['temporary_apps', 'sessions', 'messages', 'app_versions', 'llm_runs', 'app_dependencies']) {
      expect(names).toContain(t)
    }
  })

  it('is idempotent (safe to apply twice)', () => {
    const db = makeDb()
    expect(() => applySchema(db)).not.toThrow()
  })

  it('allows only one row per (app, dependency) pair', () => {
    const db = makeDb()
    seedApp(db, 'a1', 'one')
    seedApp(db, 'a2', 'two')
    const ins = db.prepare(
      `INSERT INTO app_dependencies (app_id, depends_on_app_id, pinned_version, created_at)
       VALUES (?, ?, 1, '2026-01-01T00:00:00.000Z')`,
    )
    ins.run('a1', 'a2')
    expect(() => ins.run('a1', 'a2')).toThrow()
  })
})
