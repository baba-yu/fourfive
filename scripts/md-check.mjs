// Test Markdown export against an existing session that already has a blueprint
// (no LLM call needed). Verifies the PRD §18 sections are present.

const BASE = process.env.BASE ?? 'http://localhost:8787'

const sessions = await (await fetch(`${BASE}/api/sessions`)).json()
let target = null
let fallback = null
for (const s of sessions) {
  const data = await (await fetch(`${BASE}/api/sessions/${s.id}/blueprint`)).json()
  const bp = data.blueprint
  if (bp) {
    fallback ??= { s, bp }
    if (bp.state_transitions?.length) {
      target = { s, bp }
      break
    }
  }
}
target ??= fallback
if (!target) {
  console.error('MD-CHECK SKIP: no session with a blueprint found')
  process.exit(2)
}
console.log(`session: ${target.s.id} / ${target.s.title} / app: ${target.bp.app.name}`)

const res = await (
  await fetch(`${BASE}/api/sessions/${target.s.id}/markdown`, { method: 'POST' })
).json()
console.log('saved path:', res.path)
console.log('--- markdown (first 1400 chars) ---')
console.log(res.markdown.slice(0, 1400))

const needed = [
  '# App Blueprint',
  '## 5. Data Model',
  '## 6. ERD',
  'erDiagram',
  '## 9. State Transitions',
  '## 10. Software Stack',
  '## 12. Open Questions',
]
if (target.bp.state_transitions?.length) needed.push('stateDiagram-v2')
const missing = needed.filter((n) => !res.markdown.includes(n))
if (missing.length) {
  console.error('\nMD-CHECK FAIL: missing sections ->', missing.join(', '))
  process.exit(1)
}
console.log('\nMD-CHECK OK')
