import type Database from 'better-sqlite3'

// App-to-app dependency rows (see docs/specs/2026-06-09-app-composition-design.md).
// Every function takes an injected DB handle so unit tests can run against
// :memory: — do NOT import ./db here (it opens the real workspace DB).

type DB = Database.Database

export class DependencyError extends Error {}

export interface ComposableApp {
  id: string
  name: string
  slug: string
  description: string | null
  current_version: number
  updated_at: string
}

export interface DependencyRow {
  app_id: string
  depends_on_app_id: string
  pinned_version: number
  name: string
  slug: string
  current_version: number
}

/** Apps eligible as composition targets: at least one saved blueprint version. */
export function listComposableApps(db: DB): ComposableApp[] {
  return db
    .prepare(
      `SELECT id, name, slug, description, current_version, updated_at
       FROM temporary_apps WHERE current_version >= 1
       ORDER BY updated_at DESC`,
    )
    .all() as ComposableApp[]
}

export function getDependencies(db: DB, appId: string): DependencyRow[] {
  return db
    .prepare(
      `SELECT d.app_id, d.depends_on_app_id, d.pinned_version,
              a.name, a.slug, a.current_version
       FROM app_dependencies d
       JOIN temporary_apps a ON a.id = d.depends_on_app_id
       WHERE d.app_id = ?
       ORDER BY a.name`,
    )
    .all(appId) as DependencyRow[]
}
