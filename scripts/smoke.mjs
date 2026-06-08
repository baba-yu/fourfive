// End-to-end smoke test for the local server: health -> create session ->
// send message -> verify both messages persisted. Exits non-zero on failure.
// Assumes the server is (or will shortly be) listening on BASE.

const BASE = process.env.BASE ?? 'http://localhost:8787'

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`)
      if (r.ok) return await r.json()
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 200))
  }
  throw new Error(`server did not become healthy at ${BASE}`)
}

async function postJson(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status}: ${await r.text()}`)
  return r.json()
}

const health = await waitForServer()
console.log('health   :', JSON.stringify(health))

const session = await postJson('/api/sessions', { title: 'smoke' })
console.log('session  :', session.id, '/', session.title)

const sent = await postJson(`/api/sessions/${session.id}/messages`, {
  content: 'I want to build an invoice app',
})
console.log('assistant:', sent.assistantMessage.content.slice(0, 60).replace(/\n/g, ' '), '…')

const msgs = await (await fetch(`${BASE}/api/sessions/${session.id}/messages`)).json()
console.log('messages :', msgs.length, '(expected 2)')

if (msgs.length !== 2) {
  console.error('SMOKE FAIL: expected exactly 2 persisted messages')
  process.exit(1)
}
if (sent.userMessage.role !== 'user' || sent.assistantMessage.role !== 'assistant') {
  console.error('SMOKE FAIL: unexpected message roles')
  process.exit(1)
}

// Phase 2: the invoice message should yield a structured blueprint.
const bp = sent.blueprint
console.log(
  'blueprint:',
  bp
    ? `${bp.app.name} — ${bp.entities.length} entities, ${bp.mock_ui.screens[0]?.fields.length ?? 0} fields, ${bp.terminology.length} terms`
    : 'null',
)
if (!bp || !bp.app?.name) {
  console.error('SMOKE FAIL: expected a blueprint from the invoice message')
  process.exit(1)
}
if (bp.entities.length < 1 || bp.terminology.length < 1 || bp.business_logic.length < 1) {
  console.error('SMOKE FAIL: blueprint missing entities/terms/logic')
  process.exit(1)
}

// GET blueprint endpoint should return the persisted copy.
const fetched = await (await fetch(`${BASE}/api/sessions/${session.id}/blueprint`)).json()
if (!fetched || fetched.app.name !== bp.app.name) {
  console.error('SMOKE FAIL: GET /blueprint did not return the persisted blueprint')
  process.exit(1)
}
console.log('persisted:', fetched.app.name, 'OK')

console.log('SMOKE OK')
