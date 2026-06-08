// Verify the SSE message stream: event sequence + multi-chunk content + thinking.
// Run against a server (mock provider streams + emits fake thinking on think:true).
const BASE = process.env.BASE ?? 'http://localhost:8787'

const s = await (
  await fetch(`${BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'stream-check' }),
  })
).json()

const res = await fetch(`${BASE}/api/sessions/${s.id}/messages/stream`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ content: 'I want to build an invoice app', think: true }),
})
if (!res.ok || !res.body) {
  console.error('STREAM-CHECK FAIL: bad response', res.status)
  process.exit(1)
}

const reader = res.body.getReader()
const dec = new TextDecoder()
let buf = ''
const seq = []
let contentChunks = 0
let contentLen = 0
let thinkingLen = 0
let blueprintApp = null

for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  buf += dec.decode(value, { stream: true })
  let i
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const raw = buf.slice(0, i)
    buf = buf.slice(i + 2)
    let ev = 'message'
    let d = ''
    for (const ln of raw.split('\n')) {
      if (ln.startsWith('event:')) ev = ln.slice(6).trim()
      else if (ln.startsWith('data:')) d += ln.slice(5).trimStart()
    }
    if (ev === 'content') {
      contentChunks++
      contentLen += JSON.parse(d).length
    } else if (ev === 'thinking') {
      thinkingLen += JSON.parse(d).length
    } else {
      seq.push(ev)
      if (ev === 'blueprint') {
        const bp = JSON.parse(d)
        blueprintApp = bp && bp.app ? bp.app.name : null
      }
    }
  }
}

console.log('event sequence:', seq.join(' -> '))
console.log(`content chunks: ${contentChunks}, contentLen: ${contentLen}, thinkingLen: ${thinkingLen}`)
console.log('blueprint app:', blueprintApp)

const ok =
  seq[0] === 'user' &&
  seq.includes('assistant') &&
  seq.includes('blueprint') &&
  seq.at(-1) === 'done' &&
  contentChunks > 1 &&
  thinkingLen > 0 &&
  blueprintApp
console.log(ok ? 'STREAM-CHECK OK' : 'STREAM-CHECK FAIL')
process.exit(ok ? 0 : 1)
