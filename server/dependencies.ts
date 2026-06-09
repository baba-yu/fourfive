import type Database from 'better-sqlite3'

// App-to-app dependency rows (see docs/specs/2026-06-09-app-composition-design.md).
// Every function takes an injected DB handle so unit tests can run against
// :memory: — do NOT import ./db here (it opens the real workspace DB).

type DB = Database.Database

export class DependencyError extends Error {
  override name = 'DependencyError'
}

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

function nowIso(): string {
  return new Date().toISOString()
}

/** True if making appId depend on dependsOnAppId would create a cycle. */
export function wouldCreateCycle(db: DB, appId: string, dependsOnAppId: string): boolean {
  if (appId === dependsOnAppId) return true
  const edges = db.prepare('SELECT depends_on_app_id FROM app_dependencies WHERE app_id = ?')
  const stack = [dependsOnAppId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === appId) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const row of edges.all(cur) as { depends_on_app_id: string }[]) {
      stack.push(row.depends_on_app_id)
    }
  }
  return false
}

export function addDependency(db: DB, appId: string, dependsOnAppId: string, pinnedVersion: number): void {
  const appExists = db.prepare('SELECT 1 FROM temporary_apps WHERE id = ?')
  if (!appExists.get(appId)) {
    throw new DependencyError(`unknown app: ${appId}`)
  }
  if (!appExists.get(dependsOnAppId)) {
    throw new DependencyError(`unknown dependency app: ${dependsOnAppId}`)
  }
  assertVersionExists(db, dependsOnAppId, pinnedVersion)
  if (wouldCreateCycle(db, appId, dependsOnAppId)) {
    throw new DependencyError(`dependency would create a cycle: ${appId} -> ${dependsOnAppId}`)
  }
  if (db.prepare('SELECT 1 FROM app_dependencies WHERE app_id = ? AND depends_on_app_id = ?').get(appId, dependsOnAppId)) {
    throw new DependencyError(`dependency already exists: ${appId} -> ${dependsOnAppId}`)
  }
  db.prepare(
    'INSERT INTO app_dependencies (app_id, depends_on_app_id, pinned_version, created_at) VALUES (?, ?, ?, ?)',
  ).run(appId, dependsOnAppId, pinnedVersion, nowIso())
}

function assertVersionExists(db: DB, appId: string, version: number): void {
  const row = db
    .prepare('SELECT 1 FROM app_versions WHERE app_id = ? AND version_number = ?')
    .get(appId, version)
  if (!row) throw new DependencyError(`version ${version} does not exist for app ${appId}`)
}

export function updateDependencyPin(db: DB, appId: string, dependsOnAppId: string, version: number): void {
  assertVersionExists(db, dependsOnAppId, version)
  const res = db
    .prepare('UPDATE app_dependencies SET pinned_version = ? WHERE app_id = ? AND depends_on_app_id = ?')
    .run(version, appId, dependsOnAppId)
  if (res.changes === 0) throw new DependencyError(`dependency not found: ${appId} -> ${dependsOnAppId}`)
}
