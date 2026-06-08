import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { db, nowIso, WORKSPACE_DIR } from './db'
import type { Blueprint } from '../shared/blueprint'

const APPS_DIR = resolve(WORKSPACE_DIR, 'apps')

interface AppRow {
  id: string
  name: string
  slug: string
  description: string | null
  current_version: number
  workspace_path: string
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // Non-ASCII names (e.g. Japanese) collapse to empty — fall back to a stable id.
  return base || `app-${randomUUID().slice(0, 8)}`
}

function uniqueSlug(name: string): string {
  const base = slugify(name)
  let slug = base
  let n = 2
  while (db.prepare('SELECT 1 FROM temporary_apps WHERE slug = ?').get(slug)) {
    slug = `${base}-${n++}`
  }
  return slug
}

export function getSessionApp(sessionId: string): AppRow | null {
  const row = db
    .prepare(
      `SELECT a.* FROM temporary_apps a
       JOIN sessions s ON s.app_id = a.id
       WHERE s.id = ?`,
    )
    .get(sessionId) as AppRow | undefined
  return row ?? null
}

function pad(version: number): string {
  return String(version).padStart(3, '0')
}

/** Persist a new blueprint version for the session's app (creating the app on first save). */
export function saveBlueprint(sessionId: string, bp: Blueprint): { slug: string; version: number } {
  const ts = nowIso()
  let app = getSessionApp(sessionId)

  if (!app) {
    const id = randomUUID()
    const slug = uniqueSlug(bp.app.name)
    const workspace_path = join(APPS_DIR, slug)
    mkdirSync(join(workspace_path, 'versions'), { recursive: true })
    db.prepare(
      `INSERT INTO temporary_apps (id, name, slug, description, current_version, workspace_path, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, bp.app.name, slug, bp.app.description ?? null, 0, workspace_path, ts, ts)
    db.prepare('UPDATE sessions SET app_id = ?, updated_at = ? WHERE id = ?').run(id, ts, sessionId)
    writeFileSync(
      join(workspace_path, 'app.json'),
      JSON.stringify({ id, name: bp.app.name, slug, created_at: ts }, null, 2),
    )
    app = getSessionApp(sessionId)!
  }

  const version = app.current_version + 1
  const versionDir = join(app.workspace_path, 'versions', pad(version))
  mkdirSync(versionDir, { recursive: true })
  const blueprintPath = join(versionDir, 'blueprint.json')
  writeFileSync(blueprintPath, JSON.stringify(bp, null, 2))

  db.prepare(
    `INSERT INTO app_versions (id, app_id, version_number, blueprint_path, output_md_path, created_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(randomUUID(), app.id, version, blueprintPath, null, ts)
  db.prepare('UPDATE temporary_apps SET current_version = ?, name = ?, description = ?, updated_at = ? WHERE id = ?').run(
    version,
    bp.app.name,
    bp.app.description ?? null,
    ts,
    app.id,
  )

  return { slug: app.slug, version }
}

/** Read the latest persisted blueprint for the session's app, or null. */
export function getLatestBlueprint(sessionId: string): Blueprint | null {
  const app = getSessionApp(sessionId)
  if (!app || app.current_version < 1) return null
  const file = join(app.workspace_path, 'versions', pad(app.current_version), 'blueprint.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Blueprint
  } catch {
    return null
  }
}

/** Render destination: save Markdown into the session's current version folder. */
export function saveMarkdown(sessionId: string, markdown: string): { path: string } | null {
  const app = getSessionApp(sessionId)
  if (!app || app.current_version < 1) return null
  const versionDir = join(app.workspace_path, 'versions', pad(app.current_version))
  mkdirSync(versionDir, { recursive: true })
  const mdPath = join(versionDir, 'output.md')
  writeFileSync(mdPath, markdown)
  db.prepare(
    'UPDATE app_versions SET output_md_path = ? WHERE app_id = ? AND version_number = ?',
  ).run(mdPath, app.id, app.current_version)
  return { path: mdPath }
}

/** Patch the current blueprint's user-specified software_stack in place. */
export function setSoftwareStack(sessionId: string, stack: string): boolean {
  const app = getSessionApp(sessionId)
  if (!app || app.current_version < 1) return false
  const file = join(app.workspace_path, 'versions', pad(app.current_version), 'blueprint.json')
  if (!existsSync(file)) return false
  try {
    const bp = JSON.parse(readFileSync(file, 'utf8')) as Blueprint
    bp.software_stack = stack
    writeFileSync(file, JSON.stringify(bp, null, 2))
    return true
  } catch {
    return false
  }
}
