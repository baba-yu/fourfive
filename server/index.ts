// Load .env (Node 20.12+/24) before anything reads process.env. No-op if absent.
try {
  process.loadEnvFile()
} catch {
  /* no .env file — rely on the ambient environment */
}

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { randomUUID } from 'node:crypto'
import { db, nowIso } from './db'
import { getProvider } from './llm/provider'
import { validateBlueprint } from './blueprint-schema'
import { saveBlueprint, getLatestBlueprint, saveMarkdown, setSoftwareStack } from './workspace'
import { renderBlueprintMarkdown } from './markdown'
import type { ChatMessage, Message } from '../shared/types'

const app = new Hono()
app.use('/api/*', cors())

const provider = getProvider()

app.get('/api/health', (c) =>
  c.json({ ok: true, provider: provider.name, model: provider.model, version: '0.1.0' }),
)

// --- sessions ---

app.get('/api/sessions', (c) => {
  const rows = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all()
  return c.json(rows)
})

app.post('/api/sessions', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { title?: string }
  const id = randomUUID()
  const ts = nowIso()
  const title = body.title?.trim() || 'New session'
  db.prepare(
    'INSERT INTO sessions (id, app_id, title, created_at, updated_at) VALUES (?, NULL, ?, ?, ?)',
  ).run(id, title, ts, ts)
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  return c.json(row, 201)
})

// --- messages ---

app.get('/api/sessions/:id/messages', (c) => {
  const id = c.req.param('id')
  const rows = db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(id)
  return c.json(rows)
})

app.post('/api/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id')
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)
  if (!session) return c.json({ error: 'session not found' }, 404)

  const body = (await c.req.json().catch(() => ({}))) as {
    content?: string
    think?: boolean
    maxTokens?: number
  }
  const content = (body.content ?? '').trim()
  if (!content) return c.json({ error: 'content is required' }, 400)

  // Per-message LLM options (Thinking toggle, output-token cap). Providers that
  // don't support a given option ignore it.
  const opts = { think: body.think, maxTokens: body.maxTokens }

  const userMsg: Message = {
    id: randomUUID(),
    session_id: sessionId,
    role: 'user',
    content,
    created_at: nowIso(),
  }
  insertMessage(userMsg)

  // Replay the full session history as the LLM context.
  const history = db
    .prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as ChatMessage[]

  let assistantText: string
  try {
    const result = await provider.chat(history, opts)
    assistantText = result.content
    db.prepare(
      'INSERT INTO llm_runs (id, session_id, provider, model, prompt, response, created_at) VALUES (?,?,?,?,?,?,?)',
    ).run(
      randomUUID(),
      sessionId,
      provider.name,
      result.model,
      JSON.stringify(history),
      assistantText,
      nowIso(),
    )
  } catch (err) {
    assistantText = `⚠️ LLM call failed (provider=${provider.name}): ${(err as Error).message}`
  }

  const assistantMsg: Message = {
    id: randomUUID(),
    session_id: sessionId,
    role: 'assistant',
    content: assistantText,
    created_at: nowIso(),
  }
  insertMessage(assistantMsg)
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(assistantMsg.created_at, sessionId)

  // Try to (re)build the structured blueprint from the conversation. Failures
  // here never break the chat — the blueprint is best-effort.
  let blueprint = getLatestBlueprint(sessionId)
  try {
    const fullHistory: ChatMessage[] = [...history, { role: 'assistant', content: assistantText }]
    const proposed = await provider.proposeBlueprint(fullHistory, blueprint, opts)
    if (proposed != null) {
      const result = validateBlueprint(proposed)
      if (result.success) {
        // software_stack is user-owned; the LLM never sets it. Carry it forward.
        result.data.software_stack = blueprint?.software_stack
        const changed = JSON.stringify(result.data) !== JSON.stringify(blueprint)
        if (changed) {
          saveBlueprint(sessionId, result.data)
          blueprint = result.data
        }
      } else {
        console.warn('[codev] proposed blueprint failed validation:', result.error.issues.length, 'issues')
      }
    }
  } catch (err) {
    console.warn('[codev] blueprint step error:', (err as Error).message)
  }

  return c.json({ userMessage: userMsg, assistantMessage: assistantMsg, blueprint })
})

app.get('/api/sessions/:id/blueprint', (c) => {
  return c.json(getLatestBlueprint(c.req.param('id')))
})

// Streaming variant used by the browser: SSE stream of
// user -> thinking* -> content* -> assistant -> blueprint -> done.
// The blueprint is generated AFTER the chat reply (the slow part) and pushed on
// the same stream, so the right pane updates without blocking the reply.
app.post('/api/sessions/:id/messages/stream', async (c) => {
  const sessionId = c.req.param('id')
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId)
  if (!session) return c.json({ error: 'session not found' }, 404)

  const body = (await c.req.json().catch(() => ({}))) as {
    content?: string
    think?: boolean
    maxTokens?: number
  }
  const content = (body.content ?? '').trim()
  if (!content) return c.json({ error: 'content is required' }, 400)
  const opts = { think: body.think, maxTokens: body.maxTokens }

  const userMsg: Message = {
    id: randomUUID(),
    session_id: sessionId,
    role: 'user',
    content,
    created_at: nowIso(),
  }
  insertMessage(userMsg)
  const history = db
    .prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as ChatMessage[]

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'user', data: JSON.stringify(userMsg) })

    let assistantText = ''
    try {
      const result = await provider.chatStream(history, opts, async (d) => {
        if (d.thinking) await stream.writeSSE({ event: 'thinking', data: JSON.stringify(d.thinking) })
        if (d.content) await stream.writeSSE({ event: 'content', data: JSON.stringify(d.content) })
      })
      assistantText = result.content
    } catch (err) {
      assistantText = `⚠️ LLM call failed (provider=${provider.name}): ${(err as Error).message}`
      await stream.writeSSE({ event: 'content', data: JSON.stringify(assistantText) })
    }

    const assistantMsg: Message = {
      id: randomUUID(),
      session_id: sessionId,
      role: 'assistant',
      content: assistantText,
      created_at: nowIso(),
    }
    insertMessage(assistantMsg)
    db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(assistantMsg.created_at, sessionId)
    await stream.writeSSE({ event: 'assistant', data: JSON.stringify(assistantMsg) })

    let blueprint = getLatestBlueprint(sessionId)
    try {
      const fullHistory: ChatMessage[] = [...history, { role: 'assistant', content: assistantText }]
      const proposed = await provider.proposeBlueprint(fullHistory, blueprint, opts)
      if (proposed != null) {
        const valid = validateBlueprint(proposed)
        if (valid.success) {
          valid.data.software_stack = blueprint?.software_stack
          if (JSON.stringify(valid.data) !== JSON.stringify(blueprint)) {
            saveBlueprint(sessionId, valid.data)
            blueprint = valid.data
          }
        }
      }
    } catch (err) {
      console.warn('[codev] blueprint step error:', (err as Error).message)
    }
    await stream.writeSSE({ event: 'blueprint', data: JSON.stringify(blueprint) })
    await stream.writeSSE({ event: 'done', data: '1' })
  })
})

app.post('/api/sessions/:id/markdown', async (c) => {
  const sessionId = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as { stack?: string }
  if (typeof body.stack === 'string') setSoftwareStack(sessionId, body.stack)
  const bp = getLatestBlueprint(sessionId)
  if (!bp) return c.json({ error: 'no blueprint yet' }, 400)
  const markdown = renderBlueprintMarkdown(bp)
  const saved = saveMarkdown(sessionId, markdown)
  return c.json({ markdown, path: saved?.path ?? null })
})

function insertMessage(m: Message): void {
  db.prepare(
    'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?,?,?,?,?)',
  ).run(m.id, m.session_id, m.role, m.content, m.created_at)
}

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port })
console.log(`[codev] server http://localhost:${port}  (LLM provider: ${provider.name} / ${provider.model})`)
