import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Message, Session } from '../../shared/types'
import type { Blueprint } from '../../shared/blueprint'
import { api } from '../api/client'

function loadBool(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? dflt : v === 'true'
  } catch {
    return dflt
  }
}
function loadNum(key: string, dflt: number): number {
  try {
    const v = localStorage.getItem(key)
    const n = v === null ? NaN : Number(v)
    return Number.isFinite(n) ? n : dflt
  } catch {
    return dflt
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore persistence errors */
  }
}

export interface Scope {
  db: Set<string> // "table.column"
  logic: Set<string> // rule ids
  api: Set<string> // "METHOD path"
}

const EMPTY_SCOPE: Scope = { db: new Set(), logic: new Set(), api: new Set() }

function normalizeApi(s: string): string {
  return s.trim().replace(/\s+/, ' ')
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const current = ref<Session | null>(null)
  const messages = ref<Message[]>([])
  const sending = ref(false)
  const provider = ref('…')
  const blueprint = ref<Blueprint | null>(null)
  const usage = ref({ input: 0, output: 0, total: 0 })

  // LLM knobs (per message)
  const thinking = ref(loadBool('codev.thinking', false))
  const maxTokensOn = ref(loadBool('codev.maxTokensOn', false))
  const maxTokens = ref(loadNum('codev.maxTokens', 512))

  // Markdown export
  const markdown = ref<string | null>(null)
  const markdownPath = ref<string | null>(null)
  const markdownLoading = ref(false)
  const showMarkdown = ref(false)
  const softwareStack = ref('') // user-specified, loaded from the blueprint

  // Live streaming assistant message (thinking + content + collapse state).
  const streamingMsg = ref<{ content: string; thinking: string; thinkingOpen: boolean } | null>(null)
  // Thinking text per completed message id (collapsed/viewable; not persisted server-side).
  const thinkingById = ref<Record<string, string>>({})

  // "Scope of concern": the mock-UI field in focus drives cross-pane highlights.
  const activeFieldId = ref<string | null>(null)

  const scope = computed<Scope>(() => {
    const bp = blueprint.value
    const fid = activeFieldId.value
    if (!bp || !fid) return EMPTY_SCOPE
    const field = bp.mock_ui.screens.flatMap((s) => s.fields).find((f) => f.id === fid)
    if (!field) return EMPTY_SCOPE

    const db = new Set(field.maps_to)
    const tables = new Set([...db].map((d) => d.split('.')[0]))
    const logic = new Set<string>()
    const apiIds = new Set<string>()

    for (const rule of bp.business_logic) {
      const hit =
        rule.related_db.some((d) => db.has(d)) ||
        rule.inputs.includes(field.id) ||
        rule.outputs.includes(field.id)
      if (hit) {
        logic.add(rule.id)
        rule.related_api.forEach((a) => apiIds.add(normalizeApi(a)))
      }
    }

    for (const a of bp.apis) {
      const hit =
        a.related_ui.includes(field.id) ||
        a.related_db.some((t) => tables.has(t) || [...db].some((d) => d.startsWith(`${t}.`)))
      if (hit) apiIds.add(`${a.method} ${a.path}`)
    }

    return { db, logic, api: apiIds }
  })

  function setActiveField(id: string | null) {
    activeFieldId.value = id
  }
  function setThinking(value: boolean) {
    thinking.value = value
    save('codev.thinking', String(value))
  }
  function setMaxTokensOn(value: boolean) {
    maxTokensOn.value = value
    save('codev.maxTokensOn', String(value))
  }
  function setMaxTokens(value: number) {
    const n = Math.max(64, Math.round(value || 0))
    maxTokens.value = n
    save('codev.maxTokens', String(n))
  }

  async function init() {
    try {
      provider.value = (await api.health()).provider
    } catch {
      provider.value = 'offline'
    }
    await refreshSessions()
    if (sessions.value.length > 0) {
      await openSession(sessions.value[0])
    } else {
      await newSession()
    }
  }

  async function refreshSessions() {
    sessions.value = await api.listSessions()
  }

  async function refreshUsage() {
    if (!current.value) return
    try {
      usage.value = await api.getUsage(current.value.id)
    } catch {
      usage.value = { input: 0, output: 0, total: 0 }
    }
  }

  async function newSession() {
    const s = await api.createSession()
    await refreshSessions()
    await openSession(s)
  }

  async function openSession(s: Session) {
    current.value = s
    activeFieldId.value = null
    messages.value = await api.getMessages(s.id)
    blueprint.value = await api.getBlueprint(s.id)
    softwareStack.value = blueprint.value?.software_stack ?? ''
    await refreshUsage()
  }

  async function send(content: string) {
    const text = content.trim()
    if (!current.value || !text || sending.value) return
    sending.value = true
    const sid = current.value.id

    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      session_id: sid,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    messages.value.push(optimistic)
    streamingMsg.value = { content: '', thinking: '', thinkingOpen: true }
    let collapsed = false

    try {
      await api.streamMessage(
        sid,
        text,
        { think: thinking.value, maxTokens: maxTokensOn.value ? maxTokens.value : undefined },
        (event, data) => {
          const sm = streamingMsg.value
          switch (event) {
            case 'user': {
              const m = JSON.parse(data) as Message
              const idx = messages.value.findIndex((x) => x.id === optimistic.id)
              if (idx >= 0) messages.value.splice(idx, 1, m)
              break
            }
            case 'thinking':
              if (sm) sm.thinking += JSON.parse(data) as string
              break
            case 'content':
              if (sm) {
                // Collapse the thinking section once the real reply starts.
                if (!collapsed && sm.thinking) {
                  sm.thinkingOpen = false
                  collapsed = true
                }
                sm.content += JSON.parse(data) as string
              }
              break
            case 'assistant': {
              const m = JSON.parse(data) as Message
              messages.value.push(m)
              if (sm?.thinking) thinkingById.value[m.id] = sm.thinking
              streamingMsg.value = null
              break
            }
            case 'blueprint':
              blueprint.value = JSON.parse(data) as Blueprint | null
              break
          }
        },
      )
      await refreshSessions()
      // Pick up server-side auto-naming (first blueprint names the session).
      const fresh = sessions.value.find((s) => s.id === sid)
      if (fresh && current.value) current.value.title = fresh.title
      await refreshUsage()
    } catch (e) {
      messages.value.push({
        id: `err-${Date.now()}`,
        session_id: sid,
        role: 'assistant',
        content: `⚠️ Failed to send: ${(e as Error).message}`,
        created_at: new Date().toISOString(),
      })
    } finally {
      sending.value = false
      // Salvage streamed content if the stream ended without an 'assistant' event.
      const sm = streamingMsg.value
      if (sm && sm.content) {
        messages.value.push({
          id: `local-${Date.now()}`,
          session_id: sid,
          role: 'assistant',
          content: sm.content,
          created_at: new Date().toISOString(),
        })
      }
      streamingMsg.value = null
    }
  }

  async function generateMarkdown() {
    if (!current.value || markdownLoading.value) return
    markdownLoading.value = true
    try {
      const res = await api.generateMarkdown(current.value.id, softwareStack.value)
      markdown.value = res.markdown
      markdownPath.value = res.path
      showMarkdown.value = true
    } catch (e) {
      markdown.value = `⚠️ Markdown generation failed: ${(e as Error).message}`
      markdownPath.value = null
      showMarkdown.value = true
    } finally {
      markdownLoading.value = false
    }
  }

  function closeMarkdown() {
    showMarkdown.value = false
  }

  async function renameSession(title: string) {
    const t = title.trim()
    if (!current.value || !t || t === current.value.title) return
    const updated = await api.renameSession(current.value.id, t)
    current.value.title = updated.title
    await refreshSessions()
  }

  return {
    sessions,
    current,
    messages,
    sending,
    provider,
    blueprint,
    thinking,
    maxTokensOn,
    maxTokens,
    markdown,
    markdownPath,
    markdownLoading,
    showMarkdown,
    softwareStack,
    streamingMsg,
    thinkingById,
    activeFieldId,
    scope,
    init,
    refreshSessions,
    newSession,
    openSession,
    send,
    setThinking,
    setMaxTokensOn,
    setMaxTokens,
    setActiveField,
    generateMarkdown,
    closeMarkdown,
    renameSession,
    usage,
    refreshUsage,
  }
})
