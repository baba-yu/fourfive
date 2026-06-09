// Verify the software-stack round-trip: POST a stack -> it lands in Markdown §10.
const BASE = process.env.BASE ?? 'http://localhost:8787'

const sessions = await (await fetch(`${BASE}/api/sessions`)).json()
let sid = null
for (const s of sessions) {
  const data = await (await fetch(`${BASE}/api/sessions/${s.id}/blueprint`)).json()
  if (data.blueprint) {
    sid = s.id
    break
  }
}
if (!sid) {
  console.error('STACK-CHECK SKIP: no session with a blueprint')
  process.exit(2)
}

const stack = 'Frontend: Vue 3 + TS\nBackend: Django\nDatabase: PostgreSQL'
const res = await (
  await fetch(`${BASE}/api/sessions/${sid}/markdown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stack }),
  })
).json()

const i = res.markdown.indexOf('## 10. Software Stack')
console.log('--- §10 ---')
console.log(res.markdown.slice(i, i + 160))

if (!res.markdown.includes('Backend: Django')) {
  console.error('STACK-CHECK FAIL: stack not reflected in §10')
  process.exit(1)
}
console.log('STACK-CHECK OK')
