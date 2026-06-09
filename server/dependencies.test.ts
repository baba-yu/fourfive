import { describe, expect, it } from 'vitest'
import { makeDb, seedApp } from './test-helpers'
import { listComposableApps, getDependencies, addDependency, DependencyError } from './dependencies'

describe('listComposableApps', () => {
  it('returns only apps with at least one saved version, newest first', () => {
    const db = makeDb()
    seedApp(db, { id: 'a1', name: 'Inventory', slug: 'inventory', versions: 2, updatedAt: '2026-06-01T00:00:00.000Z' })
    seedApp(db, { id: 'a2', name: 'Billing', slug: 'billing', versions: 1, updatedAt: '2026-06-02T00:00:00.000Z' })
    seedApp(db, { id: 'a3', name: 'Empty', slug: 'empty', versions: 0 })
    const apps = listComposableApps(db)
    expect(apps.map((a) => a.id)).toEqual(['a2', 'a1'])
    expect(apps[1]).toMatchObject({ name: 'Inventory', slug: 'inventory', current_version: 2 })
  })
})

describe('getDependencies', () => {
  it('joins dependency rows with target app metadata', () => {
    const db = makeDb()
    seedApp(db, { id: 'a1', name: 'Inventory', slug: 'inventory', versions: 2 })
    seedApp(db, { id: 'a2', name: 'Portal', slug: 'portal', versions: 0 })
    db.prepare(
      `INSERT INTO app_dependencies (app_id, depends_on_app_id, pinned_version, created_at)
       VALUES ('a2', 'a1', 1, '2026-01-01T00:00:00.000Z')`,
    ).run()
    const deps = getDependencies(db, 'a2')
    expect(deps).toHaveLength(1)
    expect(deps[0]).toMatchObject({
      app_id: 'a2',
      depends_on_app_id: 'a1',
      pinned_version: 1,
      name: 'Inventory',
      slug: 'inventory',
      current_version: 2,
    })
  })

  it('returns [] for an app with no dependencies', () => {
    const db = makeDb()
    seedApp(db, { id: 'a1', name: 'Solo', slug: 'solo' })
    expect(getDependencies(db, 'a1')).toEqual([])
  })

  it('orders dependencies by target app name', () => {
    const db = makeDb()
    seedApp(db, { id: 'z', name: 'Zeta', slug: 'zeta', versions: 1 })
    seedApp(db, { id: 'a', name: 'Alpha', slug: 'alpha', versions: 1 })
    seedApp(db, { id: 'p', name: 'Portal', slug: 'portal', versions: 0 })
    db.prepare(
      `INSERT INTO app_dependencies (app_id, depends_on_app_id, pinned_version, created_at)
       VALUES ('p', 'z', 1, '2026-01-01T00:00:00.000Z'), ('p', 'a', 1, '2026-01-01T00:00:00.000Z')`,
    ).run()
    expect(getDependencies(db, 'p').map((d) => d.name)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('addDependency', () => {
  function twoApps() {
    const db = makeDb()
    seedApp(db, { id: 'a1', name: 'Inventory', slug: 'inventory', versions: 2 })
    seedApp(db, { id: 'a2', name: 'Portal', slug: 'portal', versions: 1 })
    return db
  }

  it('inserts a row pinned at the given version', () => {
    const db = twoApps()
    addDependency(db, 'a2', 'a1', 2)
    expect(getDependencies(db, 'a2')[0]).toMatchObject({ depends_on_app_id: 'a1', pinned_version: 2 })
  })

  it('rejects an unknown app', () => {
    const db = twoApps()
    expect(() => addDependency(db, 'nope', 'a1', 1)).toThrow(DependencyError)
  })

  it('rejects an unknown dependency app', () => {
    const db = twoApps()
    expect(() => addDependency(db, 'a2', 'nope', 1)).toThrow(DependencyError)
  })

  it('rejects a pinned version that does not exist', () => {
    const db = twoApps()
    expect(() => addDependency(db, 'a2', 'a1', 99)).toThrow(/version 99/)
  })

  it('rejects a self-dependency', () => {
    const db = twoApps()
    expect(() => addDependency(db, 'a1', 'a1', 1)).toThrow(/cycle/)
  })

  it('rejects a direct cycle (a→b then b→a)', () => {
    const db = twoApps()
    addDependency(db, 'a2', 'a1', 1)
    expect(() => addDependency(db, 'a1', 'a2', 1)).toThrow(/cycle/)
  })

  it('rejects a transitive cycle (a→b→c then c→a)', () => {
    const db = twoApps()
    seedApp(db, { id: 'a3', name: 'Core', slug: 'core', versions: 1 })
    addDependency(db, 'a1', 'a2', 1) // a1 → a2
    addDependency(db, 'a2', 'a3', 1) // a2 → a3
    expect(() => addDependency(db, 'a3', 'a1', 1)).toThrow(/cycle/)
  })

  it('rejects a duplicate pair', () => {
    const db = twoApps()
    addDependency(db, 'a2', 'a1', 1)
    expect(() => addDependency(db, 'a2', 'a1', 2)).toThrow(/already/)
  })
})
