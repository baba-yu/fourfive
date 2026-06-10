# Backlog

Lightweight parking lot for deferred work — known follow-ups, deliberately
out-of-scope features, and operational notes. Should migrate to GitHub issues
once the repo has a remote ([BL-15](#bl-15--migrate-this-backlog-to-github-issues)).

IDs are stable; don't renumber. Mark items `done` (with the commit) or delete
them once shipped. Priority is a hint, not a commitment.

---

## Code-quality follow-ups

Surfaced by the app-composition reviews (changelog `202606101256`). All untouched.

### BL-1 · `setSoftwareStack` mutates a pinned blueprint version
**Type** tech-debt · **Priority** medium · **Status** open (spawned as a background task 2026-06-10)

`server/workspace.ts` `setSoftwareStack` rewrites the *current* version's
`blueprint.json` in place. If another app pins exactly that version, its pinned
content changes silently — technically violating the spec invariant "pinned
dependency versions are immutable". Impact today is limited to the user-owned
`software_stack` field, but the write-in-place pattern is the real problem.

**Fix options:** (a) store `software_stack` on the `temporary_apps` / `app_versions`
row instead of inside `blueprint.json`; (b) make `setSoftwareStack` cut a new
version; (c) accept + document the exception. `scripts/stack-check.mjs` must keep
passing.

### BL-2 · Raw error JSON shown to users
**Type** enhancement · **Priority** medium · **Status** open

`src/api/client.ts` `http()` throws `` `${status} ${statusText}: ${text}` ``, so
the modal and the pin-update chat message display
`400 Bad Request: {"error":"compose requires at least one dependency"}`. Parse the
`{ error }` body and surface just the message — makes the whole
`DependencyError → 400 → UI` path clean instead of merely functional.

### BL-3 · Silent app-list failure in the new-session modal
**Type** enhancement · **Priority** low · **Status** open

`src/components/NewSessionModal.vue` does `api.listApps().catch(() => [])`, so a
server error is indistinguishable from "no composable apps yet" — and the compose
choice's disabled tooltip then misleads. Distinguish the two states (e.g. an error
line vs the empty hint).

### BL-4 · Stale assignment after session switch in async store actions
**Type** bug · **Priority** low · **Status** open

`src/stores/session.ts` — `bumpDependency`, `send` (SSE blueprint), and
`openSession` assign fetched results after `await` without checking the session is
still current. Switching sessions mid-flight can paint the old session's data
under the new title. Window is small (local HTTP). Add a guard
(`if (current.value?.id !== cur.id) return`) before the assignments; systemic, so
fix across the actions together.

### BL-5 · Compose session shows blank tabs before its first blueprint
**Type** enhancement · **Priority** low · **Status** open

`src/components/TempAppPanel.vue` — with dependencies but no own blueprint yet,
`hasContent` is true, so Mock UI / Logic / State / Terminology render empty content
instead of the placeholder guidance. Deliberate per the inline comment; revisit if
it reads as broken. (ERD/API correctly show the merged dependency sections.)

### BL-6 · Orphan directory on a failed compose
**Type** tech-debt · **Priority** low · **Status** open

`server/workspace.ts` `createComposedApp` runs `mkdirSync(apps/<slug>/versions)`
before the transaction, so a rejected compose (e.g. bad dependency) leaves an empty
dir. Harmless — the slug is reusable on retry — but inconsistent with the otherwise
transactional creation. Move the mkdir after the transaction, or clean up on throw.

### BL-7 · PATCH pin doesn't touch `temporary_apps.updated_at`
**Type** tech-debt · **Priority** low · **Status** open

Updating a dependency pin doesn't bump the composite app's `updated_at`, so
`/api/apps` ordering doesn't reflect the change. Cosmetic.

### BL-8 · `llm_runs.prompt` grows with dependency context
**Type** chore · **Priority** low · **Status** watch

Full dependency blueprints are now persisted per turn via
`JSON.stringify(llmHistory)` (`server/index.ts`). Fine for a log table today; revisit
if the table bloats (truncate, or stop logging the system block).

---

## Deferred scope

Explicitly out of scope for the first composition cut (see the design spec's
"Out of scope" section). Forward-looking, not bugs.

### BL-9 · Transitive dependency resolution
**Type** feature · **Priority** medium · **Status** deferred

Only direct dependencies are expanded (UI + LLM context). For `A→B→C`, C is not
surfaced to A. Also undecided: the diamond version conflict (A and B pinning
different versions of C). Design before building.

### BL-10 · App-delete API with depended-on guard
**Type** feature · **Priority** medium · **Status** deferred

No app-delete endpoint exists. When added, it MUST reject deleting an app others
depend on (the DB FK already blocks the raw delete; surface it as a clean 4xx).

### BL-11 · Edit dependencies from a composing session
**Type** feature · **Priority** low · **Status** deferred

Today dependencies are fixed at compose time. Add/remove/re-pin from the composite
session's UI (re-run the cycle check on add).

### BL-12 · "Continue an existing app" modal choice
**Type** feature · **Priority** low · **Status** deferred

A third new-session option: open a fresh session against an existing app to keep
iterating on it. Nearly free given `sessions.app_id`, but left out of the first cut.

### BL-13 · Token compression of dependency blueprints
**Type** feature · **Priority** low · **Status** deferred

Dependency blueprints are injected into the LLM context in full. If large composites
blow the context budget, summarize/excerpt instead of full-JSON inclusion.

---

## Operational / handoff

### BL-14 · Smoke runs pollute the dev workspace DB
**Type** chore · **Priority** low · **Status** open

`pnpm smoke` writes real rows into `workspace/codev.db` every run (~20
`Invoice App`s + several `Composite Smoke App`s accumulated). Options: point the
smoke at a throwaway `WORKSPACE_DIR`, or add a reset script. Until then, wipe the
workspace for a clean slate.

### BL-15 · Migrate this backlog to GitHub issues
**Type** chore · **Priority** low · **Status** open

Once `dev` has a remote, port these items to issues and keep this file as a pointer
(or retire it).

### BL-16 · Confirm git identity for this repo before pushing
**Type** chore · **Priority** medium · **Status** open

The repo resolves to the personal identity (`youkifuldays@gmail.com`). If FourFive
should be attributed to the work identity (`baba@zipteam.com`), set it before the
first push — don't rewrite existing local commits without deciding. Flagged per the
machine's git-hygiene rule.
