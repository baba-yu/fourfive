import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from './schema'
import { makeDb, seedApp } from './test-helpers'

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
    seedApp(db, { id: 'a1', name: 'one', slug: 'one' })
    expect(() => applySchema(db)).not.toThrow()
    const row = db.prepare("SELECT 1 AS found FROM temporary_apps WHERE id = 'a1'").get() as
      | { found: number }
      | undefined
    expect(row?.found).toBe(1)
  })

  it('allows only one row per (app, dependency) pair', () => {
    const db = makeDb()
    seedApp(db, { id: 'a1', name: 'one', slug: 'one' })
    seedApp(db, { id: 'a2', name: 'two', slug: 'two' })
    const ins = db.prepare(
      `INSERT INTO app_dependencies (app_id, depends_on_app_id, pinned_version, created_at)
       VALUES (?, ?, 1, '2026-01-01T00:00:00.000Z')`,
    )
    ins.run('a1', 'a2')
    expect(() => ins.run('a1', 'a2')).toThrow()
  })

  it('adds input_tokens / output_tokens via migration when they are missing', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(
      `CREATE TABLE messages (
        id         TEXT PRIMARY KEY,
        session_id TEXT,
        role       TEXT,
        content    TEXT,
        created_at TEXT
      )`,
    )
    applySchema(db)
    const cols = (db.prepare('PRAGMA table_info(messages)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('input_tokens')
    expect(cols).toContain('output_tokens')
  })
})
