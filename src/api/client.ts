import type {
  AppListItem,
  HealthResponse,
  Message,
  SendMessageResponse,
  Session,
  SessionBlueprintResponse,
  UsageResponse,
} from '../../shared/types'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => http<HealthResponse>('/api/health'),
  listSessions: () => http<Session[]>('/api/sessions'),
  createSession: (title?: string) =>
    http<Session>('/api/sessions', { method: 'POST', body: JSON.stringify({ title }) }),
  renameSession: (sessionId: string, title: string) =>
    http<Session>(`/api/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  getMessages: (sessionId: string) => http<Message[]>(`/api/sessions/${sessionId}/messages`),
  sendMessage: (sessionId: string, content: string, think?: boolean, maxTokens?: number) =>
    http<SendMessageResponse>(`/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, think, maxTokens }),
    }),
  getBlueprint: (sessionId: string) =>
    http<SessionBlueprintResponse>(`/api/sessions/${sessionId}/blueprint`),
  listApps: () => http<AppListItem[]>('/api/apps'),
  createComposeSession: (name: string, appIds: string[]) =>
    http<Session>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ mode: 'compose', name, dependencies: appIds.map((app_id) => ({ app_id })) }),
    }),
  updateDependencyPin: (appId: string, depId: string, version: number) =>
    http<{ ok: boolean }>(`/api/apps/${appId}/dependencies/${depId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version }),
    }),
  getUsage: (sessionId: string) => http<UsageResponse>(`/api/sessions/${sessionId}/usage`),
  generateMarkdown: (sessionId: string, stack?: string) =>
    http<{ markdown: string; path: string | null }>(`/api/sessions/${sessionId}/markdown`, {
      method: 'POST',
      body: JSON.stringify({ stack }),
    }),

  // Consume the SSE message stream, invoking `on(event, data)` per event.
  // `data` is the raw (JSON-encoded) payload string; the caller parses it.
  async streamMessage(
    sessionId: string,
    content: string,
    opts: { think?: boolean; maxTokens?: number },
    on: (event: string, data: string) => void,
  ): Promise<void> {
    const res = await fetch(`/api/sessions/${sessionId}/messages/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, think: opts.think, maxTokens: opts.maxTokens }),
    })
    if (!res.ok || !res.body) {
      throw new Error(`${res.status} ${res.statusText}: ${await res.text().catch(() => '')}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        let event = 'message'
        let data = ''
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trimStart()
        }
        on(event, data)
      }
    }
  },
}
