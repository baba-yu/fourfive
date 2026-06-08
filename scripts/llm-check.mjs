// Lenient check that the configured real LLM provider responds end-to-end.
// Unlike smoke.mjs (which asserts the mock's rich invoice blueprint), this just
// confirms a real, non-mock reply comes back and reports blueprint status.
// Usage: node scripts/llm-check.mjs   (server must be running with the provider)

const BASE = process.env.BASE ?? 'http://localhost:8787'
const PROMPT =
  process.env.PROMPT ??
  'I want to build an inventory management app. I want to manage a product master, stock levels, and inbound/outbound history.'

const THINK = process.env.THINK === 'true'
const health = await (await fetch(`${BASE}/api/health`)).json()
console.log(`provider: ${health.provider} / model: ${health.model} / think: ${THINK}`)

const s = await (
  await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'llm-check' }),
  })
).json()
console.log(`session: ${s.id}`)

const t0 = Date.now()
const res = await (
  await fetch(`${BASE}/api/sessions/${s.id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: PROMPT, think: THINK }),
  })
).json()
const dt = ((Date.now() - t0) / 1000).toFixed(1)

const reply = res.assistantMessage?.content ?? ''
console.log(`\n--- assistant reply (${dt}s) ---`)
console.log(reply.slice(0, 400))

const bp = res.blueprint
console.log('\n--- blueprint ---')
if (bp) {
  const fields = bp.mock_ui.screens.reduce((n, sc) => n + sc.fields.length, 0)
  console.log(`app: ${bp.app.name}`)
  console.log(
    `entities: ${bp.entities.length}, screens: ${bp.mock_ui.screens.length}, fields: ${fields}, logic: ${bp.business_logic.length}, terms: ${bp.terminology.length}, apis: ${bp.apis.length}`,
  )
} else {
  console.log('(no blueprint this turn — model may not have returned valid JSON; chat still works)')
}

if (!reply || /This is a mock/.test(reply)) {
  console.error('\nFAIL: expected a real (non-mock) reply')
  process.exit(1)
}
console.log('\nLLM-CHECK OK (real provider responded)')
