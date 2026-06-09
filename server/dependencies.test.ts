import { describe, expect, it } from 'vitest'
import { makeDb, seedApp } from './test-helpers'
import { listComposableApps, getDependencies } from './dependencies'

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
})
