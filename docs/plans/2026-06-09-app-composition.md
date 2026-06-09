# App Composition & Dependency Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new session either create a new app or compose existing temporary apps as pinned, read-only dependencies, per `docs/specs/2026-06-09-app-composition-design.md`.

**Architecture:** Reference model + merged presentation. One new SQLite table (`app_dependencies`) pins each dependency to an `app_versions.version_number`. The server exposes an app list, a compose mode on session creation, an extended blueprint response carrying dependency blueprints, and a pin-update endpoint. Dependency blueprints are injected as a read-only system message into LLM calls. The frontend adds a new-session modal, merged read-only ERD/API views, and an update badge.

**Tech Stack:** Hono + better-sqlite3 + tsx (server), Vue 3 + Pinia + Vite (web), zod (validation), vitest (new — unit tests), `scripts/smoke.mjs` (E2E).

**Environment note (this machine):** the repo lives in WSL. Run every command via
`wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && <command>"`. File edits go through the
`\\wsl.localhost\ubuntu\home\baba-y\fourfive\` UNC path. The smoke test assumes the default
`CODEV_LLM_PROVIDER=mock` (offline, deterministic).

**Testing strategy:** Pure DB logic (`server/schema.ts`, `server/dependencies.ts`,
`server/llm/blueprint-prompt.ts`) gets vitest unit tests against an in-memory SQLite DB.
Code touching the real workspace filesystem and the DB singleton (`server/workspace.ts`,
`server/index.ts`) is covered end-to-end by `scripts/smoke.mjs` — unit tests must **never**
import `server/db.ts` (importing it creates/opens the real `codev-workspace/codev.db`).

**Commit messages:** plain conventional commits. No AI attribution, no `Co-Authored-By`, no
`Generated with` footers (user rule).

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `server/schema.ts` | create | All `CREATE TABLE` DDL + column migrations, applied via `applySchema(db)`; no connection of its own |
| `server/test-helpers.ts` | create | In-memory DB factory + row seeding for unit tests |
| `server/dependencies.ts` | create | Dependency rows: list/get/add/update-pin, cycle check; takes an injected DB handle |
| `server/db.ts` | modify | Keeps the real connection, pragmas, `WORKSPACE_DIR`; delegates DDL to `applySchema` |
| `server/workspace.ts` | modify | `createComposedApp`, `readBlueprintVersion`, `getBlueprintWithDependencies` |
| `server/index.ts` | modify | `GET /api/apps`, compose mode on `POST /api/sessions`, extended blueprint response, `PATCH` pin, LLM context injection |
| `server/llm/blueprint-prompt.ts` | modify | `buildDependencyContext()` pure function |
| `shared/types.ts` | modify | `AppListItem`, `DependencyInfo`, `SessionBlueprintResponse`, extended `CreateSessionBody` |
| `scripts/smoke.mjs` | modify | Phase 3: composition E2E |
| `src/api/client.ts` | modify | `listApps`, `createComposeSession`, `updateDependencyPin`, new blueprint response type |
| `src/stores/session.ts` | modify | `dependencies` state, `composeSession`, `bumpDependency`, `showNewSessionModal` |
| `src/components/NewSessionModal.vue` | create | Two-choice modal: new app / compose existing apps |
| `src/components/ChatPanel.vue` | modify | "+ New" opens the modal |
| `src/App.vue` | modify | Mount `<NewSessionModal />` |
| `src/components/TempAppPanel.vue` | modify | Dependency strip + update badge; pass dep slices to views |
| `src/components/EntitiesView.vue` | modify | Read-only dependency ERD sections |
| `src/components/ApiView.vue` | modify | Read-only dependency API sections |
| `src/style.css` | modify | Styles for modal choices, dep chips, dep sections |

---

### Task 1: Schema module + `app_dependencies` table + vitest harness

**Files:**
- Create: `server/schema.ts`
- Create: `server/schema.test.ts`
- Modify: `server/db.ts`
- Modify: `package.json`

- [ ] **Step 1: Install vitest and add the test script**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm add -D vitest"
```

In `package.json`, add to `"scripts"` (after `"typecheck"`):

```json
    "test": "vitest run",
```

- [ ] **Step 2: Write the failing test**

Create `server/schema.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: FAIL — `Cannot find module './schema'` (or similar import error).

- [ ] **Step 4: Create `server/schema.ts`**

Move the DDL out of `db.ts` verbatim and add the new table at the end:

```ts
import type Database from 'better-sqlite3'

// All DDL for the FourFive metadata DB, applied by db.ts to the real on-disk
// connection and by tests to an in-memory one. Must stay side-effect free:
// no connection is created here.
export function applySchema(db: Database.Database): void {
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
  created_at TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER
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

CREATE TABLE IF NOT EXISTS app_dependencies (
  app_id            TEXT NOT NULL REFERENCES temporary_apps(id) ON DELETE CASCADE,
  depends_on_app_id TEXT NOT NULL REFERENCES temporary_apps(id),
  pinned_version    INTEGER NOT NULL,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (app_id, depends_on_app_id)
);
`)

  // Migration: add token columns to messages on DBs created before usage tracking.
  const cols = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'input_tokens')) db.exec('ALTER TABLE messages ADD COLUMN input_tokens INTEGER')
  if (!cols.some((c) => c.name === 'output_tokens')) db.exec('ALTER TABLE messages ADD COLUMN output_tokens INTEGER')
}
```

- [ ] **Step 5: Slim down `server/db.ts`**

Replace the whole file with (only the DDL block and migration block moved out; everything else identical):

```ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { applySchema } from './schema'

// FourFive's own metadata lives in a single SQLite file inside the workspace dir.
// Per-app design artifacts (blueprint.json, erd.mmd, ...) will live in
// codev-workspace/apps/<slug>/ folders (added in later phases).
// The ONE allowed absolute path: anchor the workspace to THIS module's location
// (<project>/server/db.ts -> <project>/codev-workspace), not process.cwd(), so it
// resolves identically no matter where the server is launched from. Everything
// persisted (DB path columns) is stored RELATIVE to WORKSPACE_DIR — never absolute.
export const WORKSPACE_DIR = resolve(import.meta.dirname, '..', 'codev-workspace')
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
```

- [ ] **Step 6: Run tests and typecheck**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test && pnpm typecheck"
```

Expected: 3 tests PASS, typecheck clean.

- [ ] **Step 7: Commit**

```
git add package.json pnpm-lock.yaml server/schema.ts server/schema.test.ts server/db.ts
git commit -m "feat: extract DB schema module, add app_dependencies table, set up vitest"
```

---

### Task 2: `server/dependencies.ts` — list & get (TDD)

**Files:**
- Create: `server/test-helpers.ts`
- Create: `server/dependencies.ts`
- Create: `server/dependencies.test.ts`

- [ ] **Step 1: Create the shared test helpers**

Create `server/test-helpers.ts` (helpers only — vitest ignores it; it must NOT import `./db`):

```ts
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
```

- [ ] **Step 2: Write the failing tests**

Create `server/dependencies.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: FAIL — `Cannot find module './dependencies'`.

- [ ] **Step 4: Implement `server/dependencies.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```
git add server/test-helpers.ts server/dependencies.ts server/dependencies.test.ts
git commit -m "feat: dependency listing and lookup queries"
```

---

### Task 3: `addDependency` with version validation + cycle check (TDD)

**Files:**
- Modify: `server/dependencies.ts`
- Modify: `server/dependencies.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/dependencies.test.ts` (extend the import line to include `addDependency, DependencyError`):

```ts
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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: FAIL — `addDependency` is not exported.

- [ ] **Step 3: Implement**

Append to `server/dependencies.ts`:

```ts
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
  if (!db.prepare('SELECT 1 FROM temporary_apps WHERE id = ?').get(appId)) {
    throw new DependencyError(`unknown app: ${appId}`)
  }
  if (!db.prepare('SELECT 1 FROM temporary_apps WHERE id = ?').get(dependsOnAppId)) {
    throw new DependencyError(`unknown dependency app: ${dependsOnAppId}`)
  }
  assertVersionExists(db, dependsOnAppId, pinnedVersion)
  if (wouldCreateCycle(db, appId, dependsOnAppId)) {
    throw new DependencyError('dependency would create a cycle')
  }
  if (db.prepare('SELECT 1 FROM app_dependencies WHERE app_id = ? AND depends_on_app_id = ?').get(appId, dependsOnAppId)) {
    throw new DependencyError('dependency already exists')
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
```

- [ ] **Step 4: Run tests to verify they pass**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```
git add server/dependencies.ts server/dependencies.test.ts
git commit -m "feat: addDependency with version validation and cycle detection"
```

---

### Task 4: `updateDependencyPin` (TDD)

**Files:**
- Modify: `server/dependencies.ts`
- Modify: `server/dependencies.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/dependencies.test.ts` (add `updateDependencyPin` to the import):

```ts
describe('updateDependencyPin', () => {
  function withDep() {
    const db = makeDb()
    seedApp(db, { id: 'a1', name: 'Inventory', slug: 'inventory', versions: 3 })
    seedApp(db, { id: 'a2', name: 'Portal', slug: 'portal', versions: 1 })
    addDependency(db, 'a2', 'a1', 1)
    return db
  }

  it('moves the pin to an existing version', () => {
    const db = withDep()
    updateDependencyPin(db, 'a2', 'a1', 3)
    expect(getDependencies(db, 'a2')[0].pinned_version).toBe(3)
  })

  it('rejects a version that does not exist', () => {
    const db = withDep()
    expect(() => updateDependencyPin(db, 'a2', 'a1', 99)).toThrow(/version 99/)
  })

  it('rejects a missing dependency row', () => {
    const db = withDep()
    expect(() => updateDependencyPin(db, 'a1', 'a2', 1)).toThrow(/not found/)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: FAIL — `updateDependencyPin` is not exported.

- [ ] **Step 3: Implement**

Append to `server/dependencies.ts`:

```ts
export function updateDependencyPin(db: DB, appId: string, dependsOnAppId: string, version: number): void {
  assertVersionExists(db, dependsOnAppId, version)
  const res = db
    .prepare('UPDATE app_dependencies SET pinned_version = ? WHERE app_id = ? AND depends_on_app_id = ?')
    .run(version, appId, dependsOnAppId)
  if (res.changes === 0) throw new DependencyError('dependency not found')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```
git add server/dependencies.ts server/dependencies.test.ts
git commit -m "feat: updateDependencyPin"
```

---

### Task 5: Workspace functions + shared DTO types

`workspace.ts` touches the real filesystem and the DB singleton, so it has no unit tests;
Task 6's smoke test covers it end-to-end. Typecheck gates this task.

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/workspace.ts`

- [ ] **Step 1: Add DTO types to `shared/types.ts`**

Append after `UsageResponse` (and note `CreateSessionBody` is replaced, not appended):

```ts
export interface AppListItem {
  id: string
  name: string
  slug: string
  description: string | null
  current_version: number
  updated_at: string
}

/** One dependency of the current session's app, with its pinned blueprint. */
export interface DependencyInfo {
  app_id: string
  name: string
  slug: string
  pinned_version: number
  current_version: number
  blueprint: Blueprint | null
}

export interface SessionBlueprintResponse {
  blueprint: Blueprint | null
  dependencies: DependencyInfo[]
}
```

Replace the existing `CreateSessionBody` with:

```ts
export interface CreateSessionBody {
  title?: string
  mode?: 'new' | 'compose'
  /** compose: name of the new composite app (also the session title). */
  name?: string
  /** compose: apps the new app depends on; pinned at their current version. */
  dependencies?: { app_id: string }[]
}
```

- [ ] **Step 2: Refactor `getLatestBlueprint` and add `readBlueprintVersion`**

In `server/workspace.ts`, replace the existing `getLatestBlueprint` function with:

```ts
/** Read one persisted blueprint version for an app, or null. */
export function readBlueprintVersion(slug: string, version: number): Blueprint | null {
  if (version < 1) return null
  const file = join(appDir(slug), 'versions', pad(version), 'blueprint.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Blueprint
  } catch {
    return null
  }
}

/** Read the latest persisted blueprint for the session's app, or null. */
export function getLatestBlueprint(sessionId: string): Blueprint | null {
  const app = getSessionApp(sessionId)
  if (!app) return null
  return readBlueprintVersion(app.slug, app.current_version)
}
```

- [ ] **Step 3: Add `createComposedApp` and `getBlueprintWithDependencies`**

In `server/workspace.ts`, add imports at the top:

```ts
import { addDependency, getDependencies, DependencyError } from './dependencies'
import type { SessionBlueprintResponse } from '../shared/types'
```

Append at the end of the file:

```ts
/**
 * Create the composite app row up front (version 0, no blueprint yet) with its
 * dependencies pinned at each target's current version. Created eagerly —
 * unlike the lazy first-blueprint path — because dependency rows need the
 * parent app_id. The first blueprint save then takes the normal version+1 path.
 */
export function createComposedApp(name: string, dependencyAppIds: string[]): { id: string; slug: string } {
  const ts = nowIso()
  const id = randomUUID()
  const slug = uniqueSlug(name)
  const dir = appDir(slug)
  mkdirSync(join(dir, 'versions'), { recursive: true })
  db.transaction(() => {
    db.prepare(
      `INSERT INTO temporary_apps (id, name, slug, description, current_version, workspace_path, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(id, name, slug, null, 0, rel(dir), ts, ts)
    for (const depId of dependencyAppIds) {
      const dep = db.prepare('SELECT current_version FROM temporary_apps WHERE id = ?').get(depId) as
        | { current_version: number }
        | undefined
      if (!dep) throw new DependencyError(`unknown dependency app: ${depId}`)
      addDependency(db, id, depId, dep.current_version)
    }
  })()
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ id, name, slug, created_at: ts }, null, 2))
  return { id, slug }
}

/** Own blueprint plus each dependency's pinned blueprint, for the API and LLM context. */
export function getBlueprintWithDependencies(sessionId: string): SessionBlueprintResponse {
  const app = getSessionApp(sessionId)
  const blueprint = getLatestBlueprint(sessionId)
  const dependencies = app
    ? getDependencies(db, app.id).map((d) => ({
        app_id: d.depends_on_app_id,
        name: d.name,
        slug: d.slug,
        pinned_version: d.pinned_version,
        current_version: d.current_version,
        blueprint: readBlueprintVersion(d.slug, d.pinned_version),
      }))
    : []
  return { blueprint, dependencies }
}
```

- [ ] **Step 4: Typecheck and run unit tests**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm typecheck && pnpm test"
```

Expected: clean, 17 tests PASS.

- [ ] **Step 5: Commit**

```
git add shared/types.ts server/workspace.ts
git commit -m "feat: composed-app creation and dependency-aware blueprint loading"
```

---

### Task 6: HTTP endpoints + smoke extension (E2E TDD)

**Breaking-change note:** this task changes the `GET /api/sessions/:id/blueprint` response
shape. The web UI's blueprint pane will be broken at runtime until Task 8 lands — that is
expected mid-stack; do not try to keep both shapes.

**Files:**
- Modify: `scripts/smoke.mjs`
- Modify: `server/index.ts`

- [ ] **Step 1: Extend the smoke test first (failing E2E)**

In `scripts/smoke.mjs`, the existing "GET blueprint endpoint" block reads the OLD response
shape. Replace this block:

```js
// GET blueprint endpoint should return the persisted copy.
const fetched = await (await fetch(`${BASE}/api/sessions/${session.id}/blueprint`)).json()
if (!fetched || fetched.app.name !== bp.app.name) {
  console.error('SMOKE FAIL: GET /blueprint did not return the persisted blueprint')
  process.exit(1)
}
console.log('persisted:', fetched.app.name, 'OK')
```

with:

```js
// GET blueprint endpoint should return the persisted copy (new composite shape).
const fetched = await (await fetch(`${BASE}/api/sessions/${session.id}/blueprint`)).json()
if (!fetched?.blueprint || fetched.blueprint.app.name !== bp.app.name) {
  console.error('SMOKE FAIL: GET /blueprint did not return the persisted blueprint')
  process.exit(1)
}
if (!Array.isArray(fetched.dependencies) || fetched.dependencies.length !== 0) {
  console.error('SMOKE FAIL: plain app should have zero dependencies')
  process.exit(1)
}
console.log('persisted:', fetched.blueprint.app.name, 'OK')
```

Then append Phase 3 before the final `console.log('SMOKE OK')`:

```js
// Phase 3: composition — list apps, compose a session, pin handling.
const apps = await (await fetch(`${BASE}/api/apps`)).json()
const target = apps.find((a) => a.name === bp.app.name)
console.log('apps     :', apps.length, target ? `(found ${target.name} v${target.current_version})` : '(target missing)')
if (!target || target.current_version < 1) {
  console.error('SMOKE FAIL: /api/apps is missing the invoice app')
  process.exit(1)
}

const composed = await postJson('/api/sessions', {
  mode: 'compose',
  name: 'Composite Smoke App',
  dependencies: [{ app_id: target.id }],
})
if (!composed.app_id || composed.title !== 'Composite Smoke App') {
  console.error('SMOKE FAIL: compose session missing app_id or title')
  process.exit(1)
}
console.log('composed :', composed.id, '/', composed.title)

const cbp = await (await fetch(`${BASE}/api/sessions/${composed.id}/blueprint`)).json()
if (cbp.blueprint !== null || cbp.dependencies?.length !== 1) {
  console.error('SMOKE FAIL: composed blueprint response shape', JSON.stringify(cbp)?.slice(0, 200))
  process.exit(1)
}
const dep = cbp.dependencies[0]
if (dep.name !== bp.app.name || dep.pinned_version !== target.current_version || !dep.blueprint) {
  console.error('SMOKE FAIL: dependency info wrong', JSON.stringify(dep)?.slice(0, 200))
  process.exit(1)
}
console.log('dep      :', dep.name, `pinned v${dep.pinned_version}`, 'OK')

const pinOk = await fetch(`${BASE}/api/apps/${composed.app_id}/dependencies/${dep.app_id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ version: dep.pinned_version }),
})
if (!pinOk.ok) {
  console.error('SMOKE FAIL: pin update to an existing version should succeed')
  process.exit(1)
}
const pinBad = await fetch(`${BASE}/api/apps/${composed.app_id}/dependencies/${dep.app_id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ version: 999 }),
})
if (pinBad.status !== 400) {
  console.error('SMOKE FAIL: pin update to a missing version should 400')
  process.exit(1)
}
const badCompose = await fetch(`${BASE}/api/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ mode: 'compose', name: 'X', dependencies: [] }),
})
if (badCompose.status !== 400) {
  console.error('SMOKE FAIL: compose with no dependencies should 400')
  process.exit(1)
}
console.log('compose  : pin + validation OK')
```

- [ ] **Step 2: Run the smoke to verify it fails**

Start the server, run smoke, stop the server:

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && (pnpm start:server &>/tmp/codev-smoke-server.log & echo $! >/tmp/codev-smoke.pid); sleep 2; pnpm smoke; s=$?; kill $(cat /tmp/codev-smoke.pid) 2>/dev/null; pkill -f 'tsx server/index.ts' 2>/dev/null; exit $s"
```

Expected: FAIL at `persisted:` (old response shape) — exit non-zero.

- [ ] **Step 3: Implement the endpoints in `server/index.ts`**

Update imports:

```ts
import { saveBlueprint, getLatestBlueprint, saveMarkdown, setSoftwareStack, createComposedApp, getBlueprintWithDependencies } from './workspace'
import { listComposableApps, updateDependencyPin, DependencyError } from './dependencies'
```

Replace the `POST /api/sessions` handler with:

```ts
app.post('/api/sessions', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string
    mode?: 'new' | 'compose'
    name?: string
    dependencies?: { app_id: string }[]
  }
  const id = randomUUID()
  const ts = nowIso()

  if (body.mode === 'compose') {
    const name = body.name?.trim()
    const deps = (body.dependencies ?? []).map((d) => d.app_id).filter(Boolean)
    if (!name) return c.json({ error: 'name is required for compose' }, 400)
    if (deps.length === 0) return c.json({ error: 'compose requires at least one dependency' }, 400)
    let appRef: { id: string; slug: string }
    try {
      appRef = createComposedApp(name, deps)
    } catch (err) {
      if (err instanceof DependencyError) return c.json({ error: err.message }, 400)
      throw err
    }
    db.prepare(
      'INSERT INTO sessions (id, app_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, appRef.id, name, ts, ts)
    return c.json(db.prepare('SELECT * FROM sessions WHERE id = ?').get(id), 201)
  }

  const title = body.title?.trim() || DEFAULT_SESSION_TITLE
  db.prepare(
    'INSERT INTO sessions (id, app_id, title, created_at, updated_at) VALUES (?, NULL, ?, ?, ?)',
  ).run(id, title, ts, ts)
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  return c.json(row, 201)
})
```

Replace the `GET /api/sessions/:id/blueprint` handler with:

```ts
app.get('/api/sessions/:id/blueprint', (c) => {
  return c.json(getBlueprintWithDependencies(c.req.param('id')))
})
```

Add after the blueprint handler:

```ts
// --- apps & dependencies ---

app.get('/api/apps', (c) => c.json(listComposableApps(db)))

app.patch('/api/apps/:id/dependencies/:depId', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { version?: number }
  if (typeof body.version !== 'number') return c.json({ error: 'version is required' }, 400)
  try {
    updateDependencyPin(db, c.req.param('id'), c.req.param('depId'), body.version)
  } catch (err) {
    if (err instanceof DependencyError) return c.json({ error: err.message }, 400)
    throw err
  }
  return c.json({ ok: true })
})
```

- [ ] **Step 4: Run the smoke to verify it passes**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && (pnpm start:server &>/tmp/codev-smoke-server.log & echo $! >/tmp/codev-smoke.pid); sleep 2; pnpm smoke; s=$?; kill $(cat /tmp/codev-smoke.pid) 2>/dev/null; pkill -f 'tsx server/index.ts' 2>/dev/null; exit $s"
```

Expected: `SMOKE OK`, with new lines `apps :`, `composed :`, `dep :`, `compose : pin + validation OK`.

- [ ] **Step 5: Typecheck and unit tests**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm typecheck && pnpm test"
```

Expected: clean, 17 tests PASS.

- [ ] **Step 6: Commit**

```
git add scripts/smoke.mjs server/index.ts
git commit -m "feat: app list, compose session mode, dependency pin endpoints"
```

---

### Task 7: LLM dependency context (TDD for the pure part)

Dependency blueprints become a `system` message prepended to the LLM history. This works
provider-agnostically: ClaudeProvider extracts `system`-role messages into the API `system`
param, Ollama passes them through, and the mock provider ignores them (so the smoke stays
deterministic). No provider interface change.

**Files:**
- Modify: `server/llm/blueprint-prompt.ts`
- Create: `server/llm/blueprint-prompt.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write the failing test**

Create `server/llm/blueprint-prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildDependencyContext } from './blueprint-prompt'
import type { Blueprint } from '../../shared/blueprint'

const BP: Blueprint = {
  app: { name: 'Inventory' },
  mock_ui: { screens: [] },
  entities: [{ name: 'products', columns: [{ name: 'id', type: 'TEXT', pk: true }] }],
  business_logic: [],
  terminology: [],
  apis: [],
  open_questions: [],
  state_transitions: [],
}

describe('buildDependencyContext', () => {
  it('returns null when there are no dependencies with blueprints', () => {
    expect(buildDependencyContext([])).toBeNull()
    expect(
      buildDependencyContext([{ name: 'X', slug: 'x', pinned_version: 1, blueprint: null }]),
    ).toBeNull()
  })

  it('builds a system message with namespacing rules and the dependency JSON', () => {
    const msg = buildDependencyContext([
      { name: 'Inventory', slug: 'inventory', pinned_version: 3, blueprint: BP },
    ])
    expect(msg?.role).toBe('system')
    expect(msg?.content).toContain('Inventory')
    expect(msg?.content).toContain('inventory')
    expect(msg?.content).toContain('v3')
    expect(msg?.content).toContain('READ-ONLY')
    expect(msg?.content).toContain('"products"')
    expect(msg?.content).toContain('never redefine')
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: FAIL — `buildDependencyContext` is not exported.

- [ ] **Step 3: Implement `buildDependencyContext`**

Append to `server/llm/blueprint-prompt.ts`:

```ts
export interface DependencyContextInput {
  name: string
  slug: string
  pinned_version: number
  blueprint: Blueprint | null
}

/**
 * Read-only context describing the apps this session's app composes. Prepended
 * to the LLM history as a system message for BOTH chat and blueprint
 * generation, so the model references dependency entities/APIs instead of
 * redefining them. Returns null when there is nothing to include.
 */
export function buildDependencyContext(deps: DependencyContextInput[]): ChatMessage | null {
  const withBp = deps.filter((d) => d.blueprint != null)
  if (withBp.length === 0) return null
  const sections = withBp.map(
    (d) => `### ${d.name} (namespace: ${d.slug}, pinned v${d.pinned_version})\n${JSON.stringify(d.blueprint)}`,
  )
  return {
    role: 'system',
    content: [
      'This app COMPOSES the following existing apps. Their blueprints are READ-ONLY context:',
      ...sections,
      [
        'Rules:',
        '- Reference their entities/APIs/terms with namespaced notation `<namespace>.<name>` (e.g. `inventory.products`); never redefine them.',
        "- This app's own blueprint may only contain new screens, glue logic, and entities the integration itself requires.",
      ].join('\n'),
    ].join('\n\n'),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm test"
```

Expected: PASS (19 tests).

- [ ] **Step 5: Inject the context in both message handlers**

In `server/index.ts`, add to imports:

```ts
import { buildDependencyContext } from './llm/blueprint-prompt'
```

In the **non-streaming** handler (`POST /api/sessions/:id/messages`), right after the
`const history = ...` statement, add:

```ts
  const depCtx = buildDependencyContext(getBlueprintWithDependencies(sessionId).dependencies)
  const llmHistory: ChatMessage[] = depCtx ? [depCtx, ...history] : history
```

Then in that handler replace the three uses of `history` below that point:
- `provider.chat(history, opts)` → `provider.chat(llmHistory, opts)`
- `JSON.stringify(history)` (llm_runs insert) → `JSON.stringify(llmHistory)`
- `const fullHistory: ChatMessage[] = [...history, ...]` → `[...llmHistory, ...]`

In the **streaming** handler (`POST /api/sessions/:id/messages/stream`), right after its
`const history = ...` statement, add the same two lines, and replace:
- `provider.chatStream(history, opts, ...)` → `provider.chatStream(llmHistory, opts, ...)`
- `const fullHistory: ChatMessage[] = [...history, ...]` → `[...llmHistory, ...]`

- [ ] **Step 6: Verify — typecheck + smoke still green**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm typecheck && pnpm test"
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && (pnpm start:server &>/tmp/codev-smoke-server.log & echo $! >/tmp/codev-smoke.pid); sleep 2; pnpm smoke; s=$?; kill $(cat /tmp/codev-smoke.pid) 2>/dev/null; pkill -f 'tsx server/index.ts' 2>/dev/null; exit $s"
```

Expected: typecheck clean, 19 tests PASS, `SMOKE OK`.

- [ ] **Step 7: Commit**

```
git add server/llm/blueprint-prompt.ts server/llm/blueprint-prompt.test.ts server/index.ts
git commit -m "feat: inject read-only dependency context into LLM chat and blueprint prompts"
```

---

### Task 8: Frontend API client + store

No component changes yet — this task updates the data layer and must end with a clean
`vue-tsc` typecheck (which forces the store to adopt the new blueprint response shape).

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/stores/session.ts`

- [ ] **Step 1: Update `src/api/client.ts`**

Extend the type import:

```ts
import type {
  AppListItem,
  HealthResponse,
  Message,
  SendMessageResponse,
  Session,
  SessionBlueprintResponse,
  UsageResponse,
} from '../../shared/types'
```

Replace the `getBlueprint` entry and add three new entries inside the `api` object:

```ts
  getBlueprint: (sessionId: string) =>
    http<SessionBlueprintResponse>(`/api/sessions/${sessionId}/blueprint`),
  listApps: () => http<AppListItem[]>('/api/apps'),
  createComposeSession: (name: string, appIds: string[]) =>
    http<Session>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ mode: 'compose', name, dependencies: appIds.map((app_id) => ({ app_id })) }),
    }),
  updateDependencyPin: (appId: string, depId: string, version: number) =>
    http<{ ok: boolean }>(`/api/apps/${appId}/dependencies/${depId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version }),
    }),
```

(`Blueprint` is no longer imported by this file — remove its import line.)

- [ ] **Step 2: Update `src/stores/session.ts`**

Extend the type import:

```ts
import type { DependencyInfo, Message, Session } from '../../shared/types'
```

Add state refs next to `blueprint`:

```ts
  const dependencies = ref<DependencyInfo[]>([])
  const showNewSessionModal = ref(false)
```

In `openSession`, replace the blueprint lines:

```ts
    const res = await api.getBlueprint(s.id)
    blueprint.value = res.blueprint
    dependencies.value = res.dependencies
    softwareStack.value = res.blueprint?.software_stack ?? ''
```

Replace `newSession` and add two new actions after it:

```ts
  async function newSession() {
    const s = await api.createSession()
    showNewSessionModal.value = false
    await refreshSessions()
    await openSession(s)
  }

  async function composeSession(name: string, appIds: string[]) {
    const s = await api.createComposeSession(name, appIds)
    showNewSessionModal.value = false
    await refreshSessions()
    await openSession(s)
  }

  /** Move a dependency's pin to its latest version and refresh the merged view. */
  async function bumpDependency(dep: DependencyInfo) {
    const appId = current.value?.app_id
    if (!appId || dep.current_version <= dep.pinned_version) return
    await api.updateDependencyPin(appId, dep.app_id, dep.current_version)
    const res = await api.getBlueprint(current.value!.id)
    blueprint.value = res.blueprint
    dependencies.value = res.dependencies
  }
```

Add to the returned object: `dependencies, showNewSessionModal, composeSession, bumpDependency`.

Note: the SSE `blueprint` event still carries only the app's own blueprint — that is
correct; dependencies cannot change during a chat turn, so `dependencies` stays as loaded
by `openSession`/`bumpDependency`.

- [ ] **Step 3: Typecheck**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm typecheck"
```

Expected: clean. (If `vue-tsc` complains about an unused `Blueprint` import in `client.ts`,
the removal in Step 1 was missed.)

- [ ] **Step 4: Commit**

```
git add src/api/client.ts src/stores/session.ts
git commit -m "feat: dependency-aware session store and API client"
```

---

### Task 9: New-session modal

**Files:**
- Create: `src/components/NewSessionModal.vue`
- Modify: `src/components/ChatPanel.vue`
- Modify: `src/App.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Create `src/components/NewSessionModal.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSessionStore } from '../stores/session'
import { api } from '../api/client'
import type { AppListItem } from '../../shared/types'

const store = useSessionStore()
const mode = ref<'choose' | 'compose'>('choose')
const apps = ref<AppListItem[]>([])
const selected = ref<Set<string>>(new Set())
const name = ref('')
const creating = ref(false)
const error = ref('')

// Reset and (re)load the app list every time the modal opens.
watch(
  () => store.showNewSessionModal,
  async (open) => {
    if (!open) return
    mode.value = 'choose'
    selected.value = new Set()
    name.value = ''
    error.value = ''
    apps.value = await api.listApps().catch(() => [])
  },
)

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function confirmCompose() {
  if (!name.value.trim() || selected.value.size === 0 || creating.value) return
  creating.value = true
  error.value = ''
  try {
    await store.composeSession(name.value.trim(), [...selected.value])
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div v-if="store.showNewSessionModal" class="modal" @click.self="store.showNewSessionModal = false">
    <div class="modal__box modal__box--narrow">
      <header class="modal__bar">
        <span class="modal__title">New session</span>
        <div class="modal__actions">
          <button class="btn" @click="store.showNewSessionModal = false">Close</button>
        </div>
      </header>

      <div v-if="mode === 'choose'" class="newsess">
        <button class="newsess__choice" @click="store.newSession()">
          <strong>Create a new app</strong>
          <span>Start from an empty session; the app takes shape as you chat.</span>
        </button>
        <button
          class="newsess__choice"
          :disabled="apps.length === 0"
          :title="apps.length === 0 ? 'No existing apps with a saved blueprint yet' : ''"
          @click="mode = 'compose'"
        >
          <strong>Compose existing apps</strong>
          <span>Build a new app on top of existing ones (read-only, version-pinned dependencies).</span>
        </button>
      </div>

      <div v-else class="newsess">
        <label class="newsess__label">New app name</label>
        <input v-model="name" class="newsess__name" placeholder="e.g. Order & Inventory portal" />
        <label class="newsess__label">Dependencies</label>
        <ul class="newsess__apps">
          <li v-for="a in apps" :key="a.id">
            <label class="newsess__app">
              <input type="checkbox" :checked="selected.has(a.id)" @change="toggle(a.id)" />
              <span class="newsess__app-name">{{ a.name }}</span>
              <span class="newsess__app-meta">v{{ a.current_version }} · {{ a.updated_at.slice(0, 10) }}</span>
            </label>
          </li>
        </ul>
        <p v-if="error" class="newsess__error">⚠️ {{ error }}</p>
        <footer class="newsess__foot">
          <button class="btn" @click="mode = 'choose'">Back</button>
          <button
            class="btn btn--primary"
            :disabled="!name.trim() || selected.size === 0 || creating"
            @click="confirmCompose"
          >
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Open the modal from ChatPanel**

In `src/components/ChatPanel.vue`, change the "+ New" button:

```html
      <button class="btn" @click="store.showNewSessionModal = true">+ New</button>
```

- [ ] **Step 3: Mount the modal in `src/App.vue`**

Add the import and tag (next to `MarkdownModal`):

```ts
import NewSessionModal from './components/NewSessionModal.vue'
```

```html
    <MarkdownModal />
    <NewSessionModal />
```

- [ ] **Step 4: Add styles to `src/style.css`**

Append:

```css
/* --- New-session modal --- */
.modal__box--narrow { max-width: 480px; }
.newsess { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.newsess__choice {
  display: flex; flex-direction: column; gap: 4px; text-align: left;
  padding: 12px 14px; border: 1px solid var(--border, #444); border-radius: 8px;
  background: transparent; color: inherit; cursor: pointer;
}
.newsess__choice:hover:not(:disabled) { border-color: var(--accent, #7aa2f7); }
.newsess__choice:disabled { opacity: 0.45; cursor: not-allowed; }
.newsess__choice span { font-size: 12px; opacity: 0.75; }
.newsess__label { font-size: 12px; opacity: 0.75; }
.newsess__name { padding: 6px 8px; }
.newsess__apps { list-style: none; margin: 0; padding: 0; max-height: 220px; overflow-y: auto; }
.newsess__app { display: flex; align-items: center; gap: 8px; padding: 6px 4px; cursor: pointer; }
.newsess__app-name { flex: 1; }
.newsess__app-meta { font-size: 11px; opacity: 0.6; }
.newsess__error { color: #f87171; font-size: 12px; margin: 0; }
.newsess__foot { display: flex; justify-content: space-between; gap: 8px; }
```

(If `var(--border)` / `var(--accent)` don't exist in `style.css`, keep the fallback values
— they are written as `var(--x, fallback)` on purpose. Match nearby conventions if the file
defines its own variables.)

- [ ] **Step 5: Typecheck**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm typecheck"
```

Expected: clean.

- [ ] **Step 6: Manual verification in the browser**

Run `pnpm dev` (WSL) and verify with the preview tools or a browser:
1. Click "+ New" → modal opens with two choices.
2. "Create a new app" → modal closes, a fresh empty session is current.
3. With no composable apps, "Compose existing apps" is disabled.
4. Send "I want to build an invoice app" in a session (mock provider) so an app exists;
   click "+ New" → "Compose existing apps" → the invoice app is listed with v1; select it,
   name the app "Composite", Create → modal closes, new session titled "Composite".

- [ ] **Step 7: Commit**

```
git add src/components/NewSessionModal.vue src/components/ChatPanel.vue src/App.vue src/style.css
git commit -m "feat: new-session modal with compose-existing-apps flow"
```

---

### Task 10: Merged views + update badge

**Files:**
- Modify: `src/components/TempAppPanel.vue`
- Modify: `src/components/EntitiesView.vue`
- Modify: `src/components/ApiView.vue`
- Modify: `src/style.css`

- [ ] **Step 1: Pass dependency slices through `TempAppPanel.vue`**

Replace the `<script setup>` block with:

```ts
import { computed, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import MockUiView from './MockUiView.vue'
import EntitiesView from './EntitiesView.vue'
import LogicView from './LogicView.vue'
import StateView from './StateView.vue'
import ApiView from './ApiView.vue'
import TerminologyView from './TerminologyView.vue'

const store = useSessionStore()
const tabs = ['Mock UI', 'ERD', 'Logic', 'State', 'API', 'Terminology'] as const
type Tab = (typeof tabs)[number]
const active = ref<Tab>('Mock UI')
const bp = computed(() => store.blueprint)
// Read-only slices of each dependency's pinned blueprint for the merged views.
const depEntities = computed(() =>
  store.dependencies
    .filter((d) => d.blueprint)
    .map((d) => ({ name: d.name, slug: d.slug, entities: d.blueprint!.entities })),
)
const depApis = computed(() =>
  store.dependencies
    .filter((d) => d.blueprint)
    .map((d) => ({ name: d.name, slug: d.slug, apis: d.blueprint!.apis })),
)
// A compose session has dependencies before its first own blueprint — still show content.
const hasContent = computed(() => !!bp.value || store.dependencies.length > 0)
```

Replace the `<template>` with:

```html
<template>
  <section class="temp">
    <header class="temp__bar">
      <span class="temp__title">
        Temp app<template v-if="bp">: {{ bp.app.name }}</template>
      </span>
      <nav class="temp__tabs">
        <button
          v-for="t in tabs"
          :key="t"
          class="temp__tab"
          :class="{ 'temp__tab--active': active === t }"
          @click="active = t"
        >
          {{ t }}
        </button>
      </nav>
    </header>

    <div v-if="store.dependencies.length" class="temp__deps">
      <span class="temp__deps-label">Depends on:</span>
      <span v-for="d in store.dependencies" :key="d.app_id" class="dep-chip">
        {{ d.name }} v{{ d.pinned_version }}
        <button
          v-if="d.current_version > d.pinned_version"
          class="dep-chip__bump"
          :title="`Update pin from v${d.pinned_version} to v${d.current_version}`"
          @click="store.bumpDependency(d)"
        >
          → v{{ d.current_version }} available
        </button>
      </span>
    </div>

    <div class="temp__body" :class="{ 'temp__body--filled': hasContent }">
      <div v-if="!hasContent" class="temp__placeholder">
        <p class="temp__ph-title">{{ active }}</p>
        <p class="temp__ph-desc">
          "{{ active }}" will appear here.<br />
          FourFive generates it automatically once the spec takes shape in chat.
        </p>
      </div>
      <template v-else>
        <MockUiView v-if="active === 'Mock UI'" :screens="bp?.mock_ui.screens ?? []" />
        <EntitiesView v-else-if="active === 'ERD'" :entities="bp?.entities ?? []" :deps="depEntities" />
        <LogicView v-else-if="active === 'Logic'" :rules="bp?.business_logic ?? []" />
        <StateView v-else-if="active === 'State'" :transitions="bp?.state_transitions ?? []" />
        <ApiView v-else-if="active === 'API'" :apis="bp?.apis ?? []" :deps="depApis" />
        <TerminologyView v-else-if="active === 'Terminology'" :terms="bp?.terminology ?? []" />
      </template>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Dependency sections in `EntitiesView.vue`**

Replace the `<script setup>` block with:

```ts
import { computed } from 'vue'
import type { Entity } from '../../shared/blueprint'
import { entitiesToMermaidErd } from '../../shared/mermaid'
import { useSessionStore } from '../stores/session'
import MermaidDiagram from './MermaidDiagram.vue'

const props = defineProps<{
  entities: Entity[]
  deps?: { name: string; slug: string; entities: Entity[] }[]
}>()
const store = useSessionStore()

const erd = computed(() => entitiesToMermaidErd(props.entities))
// Tables in the current scope-of-concern (from the focused field's maps_to).
const highlightTables = computed(() => [...store.scope.db].map((d) => d.split('.')[0]))
// One pre-rendered ERD per dependency (read-only; no scope highlighting).
const depErds = computed(() =>
  (props.deps ?? []).map((d) => ({ ...d, erd: entitiesToMermaidErd(d.entities) })),
)
```

Replace the `<template>` with:

```html
<template>
  <div class="view">
    <MermaidDiagram v-if="entities.length" :code="erd" :highlight="highlightTables" />
    <div v-for="e in entities" :key="e.name" class="entity">
      <div class="entity__head">
        <span class="entity__name">{{ e.name }}</span>
        <span v-if="e.description" class="entity__desc">{{ e.description }}</span>
      </div>
      <table class="tbl">
        <thead>
          <tr><th>Column</th><th>Type</th><th>Constraints</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="c in e.columns"
            :key="c.name"
            :class="{ 'row--scope': store.scope.db.has(`${e.name}.${c.name}`) }"
          >
            <td class="tbl__strong">{{ c.name }}</td>
            <td class="tbl__mono">{{ c.type }}</td>
            <td>
              <span v-if="c.pk" class="badge2 badge2--pk">PK</span>
              <span v-if="c.fk" class="badge2 badge2--fk">FK → {{ c.fk }}</span>
              <span v-if="c.unique" class="badge2">UNIQUE</span>
              <span v-if="c.nullable" class="badge2 badge2--null">NULL</span>
            </td>
            <td class="tbl__muted">{{ c.description }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <section v-for="d in depErds" :key="d.slug" class="depsec">
      <div class="depsec__head">
        <span class="depsec__name">{{ d.name }}</span>
        <span class="badge2">read-only</span>
        <span class="depsec__ns">namespace: {{ d.slug }}</span>
      </div>
      <MermaidDiagram v-if="d.entities.length" :code="d.erd" :highlight="[]" />
      <div v-for="e in d.entities" :key="`${d.slug}.${e.name}`" class="entity">
        <div class="entity__head">
          <span class="entity__name">{{ d.slug }}.{{ e.name }}</span>
          <span v-if="e.description" class="entity__desc">{{ e.description }}</span>
        </div>
        <table class="tbl">
          <thead>
            <tr><th>Column</th><th>Type</th><th>Constraints</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in e.columns" :key="c.name">
              <td class="tbl__strong">{{ c.name }}</td>
              <td class="tbl__mono">{{ c.type }}</td>
              <td>
                <span v-if="c.pk" class="badge2 badge2--pk">PK</span>
                <span v-if="c.fk" class="badge2 badge2--fk">FK → {{ c.fk }}</span>
                <span v-if="c.unique" class="badge2">UNIQUE</span>
                <span v-if="c.nullable" class="badge2 badge2--null">NULL</span>
              </td>
              <td class="tbl__muted">{{ c.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 3: Dependency sections in `ApiView.vue`**

Replace the file content with:

```vue
<script setup lang="ts">
import type { ApiEndpoint } from '../../shared/blueprint'
import { useSessionStore } from '../stores/session'

defineProps<{
  apis: ApiEndpoint[]
  deps?: { name: string; slug: string; apis: ApiEndpoint[] }[]
}>()
const store = useSessionStore()
</script>

<template>
  <div class="view">
    <div
      v-for="(a, i) in apis"
      :key="`${a.method}-${a.path}-${i}`"
      class="api"
      :class="{ 'api--scope': store.scope.api.has(`${a.method} ${a.path}`) }"
    >
      <div class="api__line">
        <span class="api__method" :class="`api__method--${a.method.toLowerCase()}`">{{ a.method }}</span>
        <span class="api__path">{{ a.path }}</span>
      </div>
      <p v-if="a.summary" class="api__summary">{{ a.summary }}</p>
      <div v-if="a.related_db.length || a.related_ui.length" class="api__rel">
        <span v-for="d in a.related_db" :key="d" class="chip chip--ghost">{{ d }}</span>
        <span v-for="u in a.related_ui" :key="u" class="chip">{{ u }}</span>
      </div>
    </div>

    <section v-for="d in deps ?? []" :key="d.slug" class="depsec">
      <div class="depsec__head">
        <span class="depsec__name">{{ d.name }}</span>
        <span class="badge2">read-only</span>
        <span class="depsec__ns">namespace: {{ d.slug }}</span>
      </div>
      <div v-for="(a, i) in d.apis" :key="`${d.slug}-${a.method}-${a.path}-${i}`" class="api">
        <div class="api__line">
          <span class="api__method" :class="`api__method--${a.method.toLowerCase()}`">{{ a.method }}</span>
          <span class="api__path">{{ a.path }}</span>
        </div>
        <p v-if="a.summary" class="api__summary">{{ a.summary }}</p>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 4: Styles**

Append to `src/style.css`:

```css
/* --- Dependency strip + read-only dependency sections --- */
.temp__deps {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 12px; border-bottom: 1px solid var(--border, #333);
  font-size: 12px;
}
.temp__deps-label { opacity: 0.6; }
.dep-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px; border: 1px solid var(--border, #444); border-radius: 999px;
}
.dep-chip__bump {
  border: none; background: var(--accent, #7aa2f7); color: #000;
  border-radius: 999px; padding: 1px 8px; font-size: 11px; cursor: pointer;
}
.depsec {
  margin-top: 18px; padding: 10px; border: 1px dashed var(--border, #555);
  border-radius: 8px; opacity: 0.8;
}
.depsec__head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.depsec__name { font-weight: 600; }
.depsec__ns { font-size: 11px; opacity: 0.6; margin-left: auto; }
```

- [ ] **Step 5: Typecheck**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm typecheck"
```

Expected: clean.

- [ ] **Step 6: Manual verification in the browser**

With `pnpm dev` running (mock provider):
1. Create an invoice app session ("I want to build an invoice app") so a composable app exists.
2. "+ New" → Compose → select Invoice App → name "Composite" → Create.
3. The dependency strip shows `Invoice App v1`; ERD tab shows `invoice-app.customers` etc.
   in a dashed read-only section; API tab shows its endpoints in a read-only section.
4. The mock provider returns an identical blueprint every turn, so the invoice app never
   advances past v1 through the UI. Create v2 by hand to exercise the badge
   (`<depId>`/`<slug>` from `GET /api/apps`):

   ```bash
   cp -r codev-workspace/apps/<slug>/versions/001 codev-workspace/apps/<slug>/versions/002
   sqlite3 codev-workspace/codev.db "
     INSERT INTO app_versions (id, app_id, version_number, blueprint_path, output_md_path, created_at)
       SELECT 'manual-v2', app_id, 2, replace(blueprint_path, '001', '002'), NULL, created_at
       FROM app_versions WHERE app_id = '<depId>' AND version_number = 1;
     UPDATE temporary_apps SET current_version = 2 WHERE id = '<depId>';"
   ```

5. Reopen the "Composite" session (switch away and back): the chip shows
   "→ v2 available"; clicking it refreshes the strip to `Invoice App v2` and the badge
   disappears.

- [ ] **Step 7: Commit**

```
git add src/components/TempAppPanel.vue src/components/EntitiesView.vue src/components/ApiView.vue src/style.css
git commit -m "feat: merged read-only dependency views and pin-update badge"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full gate**

```
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && pnpm typecheck && pnpm test"
wsl.exe -d ubuntu -- bash -c "cd ~/fourfive && (pnpm start:server &>/tmp/codev-smoke-server.log & echo $! >/tmp/codev-smoke.pid); sleep 2; pnpm smoke; s=$?; kill $(cat /tmp/codev-smoke.pid) 2>/dev/null; pkill -f 'tsx server/index.ts' 2>/dev/null; exit $s"
```

Expected: typecheck clean, 19 unit tests PASS, `SMOKE OK`.

- [ ] **Step 2: Spec cross-check**

Walk `docs/specs/2026-06-09-app-composition-design.md` section by section and confirm each
shipped: data model + invariants (Tasks 1, 3, 4), API (Tasks 5, 6), LLM context (Task 7),
modal + merged views + badge (Tasks 8–10), out-of-scope items untouched.

- [ ] **Step 3: Done**

Report status; branch `dev` stays unpushed until the user pushes (Claude cannot push —
Git Credential Manager auth).
