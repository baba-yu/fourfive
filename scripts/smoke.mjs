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

console.log('SMOKE OK')
