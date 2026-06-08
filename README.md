# FourFive

A local design tool: start from chat, design and visualize a throwaway "temporary
app", and export everything-but-the-UI as a Markdown blueprint.

> **Why "FourFive"?** After the 四畳半 (*yojōhan*) — a 4.5-tatami room. In Japan
> it's the small, spare space you start out from, where you tinker and experiment
> your way to something out of almost nothing. That's the stage FourFive is built
> for: shaping an app from nothing but a chat.

> **Status: MVP complete (Phases 1–5) + local-LLM SSE streaming**
> Chat produces a structured blueprint and renders it in the right pane
> (Mock UI / Mermaid ERD / Logic / State / API / Terminology). Focusing an input
> highlights the related DB/API ("scope of concern") and glows the matching
> entity in the ERD. You can export a Markdown blueprint (PRD §18) including state
> transitions and a software stack. Replies stream token-by-token over SSE, with a
> collapsible "thinking" view and an async blueprint update.
> The LLM is switchable: `mock` (default), Ollama (GPU-capable), Claude — see
> [docs/guides/local-llm.md](docs/guides/local-llm.md).

## Stack

- Frontend: Vue 3 + TypeScript + Vite + Pinia
- Local server: Node.js + Hono (SSE streaming)
- DB: SQLite (better-sqlite3) — `codev-workspace/codev.db`; design artifacts in `codev-workspace/apps/<slug>/versions/NNN/`
- Diagrams: Mermaid (ERD + state diagram), lazy-loaded
- LLM: `mock` (default, offline) / Ollama / Claude — all via `fetch`, no SDK

## Run (WSL)

pnpm is provided via corepack (pinned to 10.33.0 by `package.json`'s `packageManager`).

```bash
corepack pnpm install
corepack pnpm dev        # server (:8787) + web (:5173)
# → open http://localhost:5173
```

The default LLM is `mock`, so chat works with no configuration. To use a real LLM:

```bash
cp .env.example .env
# set CODEV_LLM_PROVIDER=ollama or claude in .env
```

> **Connecting a local LLM (Ollama): see [docs/guides/local-llm.md](docs/guides/local-llm.md).**

Smoke test (server-only, end-to-end):

```bash
corepack pnpm start:server   # in another terminal
corepack pnpm smoke
```

## Scripts

| pnpm script   | what                          |
| ------------- | ----------------------------- |
| `dev`         | server + web together         |
| `dev:server`  | server only (tsx watch)       |
| `dev:web`     | frontend only (vite)          |
| `build`       | typecheck + web build         |
| `typecheck`   | typecheck only (front + server) |
| `start:server`| server only (no watch)        |
| `smoke`       | server E2E smoke test         |

Startup/shutdown helpers (`bash scripts/<name>`):

| scripts/                                            | what                                            |
| --------------------------------------------------- | ----------------------------------------------- |
| `dev-bg.sh`                                         | start dev detached, wait for :5173/:8787        |
| `dev-stop.sh`                                       | stop all dev stacks                             |
| `dev-restart.sh`                                    | stop → start a single clean stack               |
| `ollama-bg.sh` / `ollama-restart.sh` / `ollama-diag.sh` | Ollama daemon (see [docs/guides/local-llm.md](docs/guides/local-llm.md)) |
| `verify.sh`                                         | typecheck + smoke + build                       |
| `*-check.mjs`                                       | llm / md / stack / stream checks                |

## Layout

```
server/            Hono server, DB schema, LLM providers, blueprint validate/save, SSE
src/               Vue frontend (chat + right-pane views)
shared/            front/server shared types (types, blueprint, mermaid)
scripts/           dev/ollama start-stop, smoke/verify/check scripts
docs/              documentation (guides/local-llm.md; changelog/ is gitignored)
codev-workspace/   SQLite + per-app artifacts (gitignored except .gitkeep)
```

## Notes

- **WSL-native.** `better-sqlite3` is a native module, so install and run with the
  same Node (don't mix an install done by a different-OS Node).
- Ollama is verified working ([docs/guides/local-llm.md](docs/guides/local-llm.md)); small models
  sometimes produce unstable blueprint JSON — use a larger model.
- **Claude is a partial stub**: chat works but does **not** stream token-by-token
  (one-shot fallback). Validate model id/params against the `claude-api` reference
  before relying on it.
- **The app is English end-to-end** — UI strings, server/error messages, the
  Markdown export, and the mock's sample data. Docs are in English too. (The
  mock still recognizes Japanese invoice prompts, so JP input also triggers the
  offline demo.)
