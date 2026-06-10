# Design: temporary-app composition and dependency management

Date: 2026-06-09
Status: approved (pre-implementation)

## Background and goals

Today the session→app relationship is implicit. `POST /api/sessions` creates an
empty session; the app is auto-created on the first blueprint save
(`saveBlueprint` in `server/workspace.ts`). There is no concept of dependencies
between apps, and no API that lists apps.

This design delivers:

1. A modal at new-session time that lets the user choose between **creating a
   new app** and **composing existing temporary apps**.
2. App-to-app dependencies tracked in the DB.
3. Dependencies pinned to a version, so a dependency edited later in its own
   session cannot silently break the composing app.

## Core approach: reference model + merged presentation

"Composing" is implemented as **references (dependencies)**, not as a merge
(no copied/combined blueprint).

- Each temporary app keeps its own blueprint. Entities, APIs, and logic are
  owned by that app and edited only in that app's own sessions.
- A composite app holds only its **integration-layer blueprint** (new screens,
  glue logic, any additional entities) plus **dependency declarations**.
- The "looks monolithic" experience comes from **merging at render time**:
  the ERD/API tabs show dependency elements namespaced and read-only. The
  persisted data stays separated.

This gives "monolithic on the surface, separated concerns underneath"
(microservice-style ownership) without data duplication.

## Data model

One new table. Existing tables (`temporary_apps`, `sessions`, `app_versions`,
`messages`, `llm_runs`) are unchanged.

```sql
CREATE TABLE IF NOT EXISTS app_dependencies (
  app_id            TEXT NOT NULL REFERENCES temporary_apps(id) ON DELETE CASCADE,
  depends_on_app_id TEXT NOT NULL REFERENCES temporary_apps(id),
  pinned_version    INTEGER NOT NULL,  -- app_versions.version_number of the dependency
  created_at        TEXT NOT NULL,
  PRIMARY KEY (app_id, depends_on_app_id)
);
```

### Invariants

- **No dependency cycles**: inserting a dependency row runs a DFS reachability
  check and rejects the insert if it would create a cycle.
- **Existing versions only**: `pinned_version` must exist in the dependency's
  `app_versions`.
- **Dependencies are immutable from the composite**: a composing session can
  never modify a dependency's blueprint (read-only in the LLM context too).
- **Depended-on apps cannot be deleted**: no app-delete API exists today; when
  one is added it must reject deleting an app that others depend on.

## API

### New

- `GET /api/apps`
  App list for the modal. Each row: `id, name, slug, description,
  current_version, updated_at`. Only apps with `current_version >= 1` (at
  least one saved blueprint) are returned — version-0 apps are meaningless as
  composition targets.

- `PATCH /api/apps/:id/dependencies/:depId`
  Body `{ "version": <integer> }`. Explicitly moves the pin. 400 for a
  version that doesn't exist.

### Extended

- `POST /api/sessions`
  No body (or `{ mode: "new" }`) keeps today's behavior: empty session, app
  lazily created on first blueprint save.
  With `{ mode: "compose", name: string, dependencies: [{ app_id: string }] }`:
  1. Create the `temporary_apps` row immediately (`current_version = 0`, slug
     derived from `name`, workspace folder created). Immediate creation is
     required because dependency rows need the parent `app_id`.
  2. Insert each dependency pinned at the dependency's current
     `current_version`, running the cycle check (a fresh app can only
     self-reference in practice, but the check function is written generically).
  3. Create the session with `app_id` set; session title = `name`.
  `compose` with empty `dependencies` is a 400 (use `new` instead).

- `GET /api/sessions/:id/blueprint`
  Extended response: own blueprint plus dependency info:

  ```json
  {
    "blueprint": { ... } | null,
    "dependencies": [
      {
        "app_id": "...",
        "name": "Inventory",
        "slug": "inventory",
        "pinned_version": 3,
        "current_version": 5,
        "blueprint": { ... }
      }
    ]
  }
  ```

  `dependencies[].blueprint` is read from the pinned version's blueprint file.
  The client compares `current_version > pinned_version` for the update badge.
  Apps without dependencies return `dependencies: []`.
  No compatibility layer: the frontend moves to the new shape in the same PR.

## LLM context

- When building prompts for chat (`/api/sessions/:id/messages/stream`) and
  blueprint generation, include each dependency's pinned blueprint as
  **read-only context**.
- The system prompt states:
  - Dependency entities, APIs, and terminology must be **referenced, never
    redefined**.
  - References use namespaced notation (e.g. `inventory.products`).
  - The composite app's blueprint may only contain new screens, glue logic,
    and entities newly required by the integration.
- Token mitigation for large dependency blueprints (summarizing/excerpting) is
  out of scope; start with full inclusion and design separately if it hurts.

## UI

### New-session modal

- "+ New session" no longer creates a session immediately; it opens a modal.
- Two choices:
  1. **Create a new app** — today's behavior; close the modal and start an
     empty session.
  2. **Compose existing apps** — multi-select list from `GET /api/apps`
     (name, current version, updated date) plus a name input for the new app.
     Confirm calls `POST /api/sessions {mode: "compose", ...}`.
- With zero existing apps, choice 2 is disabled (grayed out).
- `init()` in `src/stores/session.ts` auto-runs `newSession()` when there are
  no sessions. That auto-create stays and counts as "create a new app" (no
  modal on first launch).

### Merged views in TempAppPanel

- ERD and API tabs render dependency elements namespaced, visually distinct
  (e.g. gray border), and read-only.
- Logic / State / Terminology / Mock UI tabs show only the app's own blueprint
  (out of scope this round).

### Update badge

- When a dependency's `current_version` > `pinned_version`, show a
  "v3 → v5 available" badge.
- One click on the badge calls `PATCH /api/apps/:id/dependencies/:depId` to
  move the pin to latest, then refetches the blueprint to refresh the views.

## Out of scope (this round)

- **Transitive dependency resolution**: for A→B→C, C's context is not
  expanded; direct dependencies only. The diamond problem (A and B pinning
  different versions of C) is likewise not handled.
- **App-delete API** and its depended-on check (recorded as an invariant only).
- **Editing dependencies from the composing session** (edit them in their own
  sessions).
- **A "continue an existing app" modal choice**: nearly free given
  `sessions.app_id`, but not in this scope.
- **Token compression of dependency blueprints** (summaries/excerpts).

## Affected files

| File | Change |
|---|---|
| `server/db.ts` | add `app_dependencies` table |
| `server/workspace.ts` | dependency CRUD, cycle check, immediate app creation for compose, dependency blueprint loading |
| `server/index.ts` | `GET /api/apps`, extended `POST /api/sessions`, extended blueprint response, dependency PATCH |
| `server/llm/blueprint-prompt.ts` | include dependency context and reference rules |
| `src/api/client.ts` | new API client functions, updated blueprint response types |
| `src/stores/session.ts` | hold dependency info, compose-session creation, pin-update action |
| `src/App.vue` etc. | new-session modal (new component), merged TempAppPanel views, update badge |
| `shared/types.ts` / `shared/blueprint.ts` | dependency-related types |
