<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useSessionStore } from '../stores/session'
import type { Session } from '../../shared/types'

const store = useSessionStore()
const input = ref('')
const listEl = ref<HTMLElement | null>(null)
// Per-completed-message expand state for the thinking box (collapsed default).
const openThinking = ref<Record<string, boolean>>({})

async function submit() {
  const text = input.value
  if (!text.trim() || store.sending) return
  input.value = ''
  await store.send(text)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    void submit()
  }
}

function onSelect(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  const s: Session | undefined = store.sessions.find((x) => x.id === id)
  if (s) void store.openSession(s)
}

function toggleThinking(id: string) {
  openThinking.value[id] = !openThinking.value[id]
}
function toggleStreamThinking() {
  if (store.streamingMsg) store.streamingMsg.thinkingOpen = !store.streamingMsg.thinkingOpen
}

watch(
  () => [store.messages.length, store.streamingMsg?.content, store.streamingMsg?.thinking],
  async () => {
    await nextTick()
    listEl.value?.scrollTo({ top: listEl.value.scrollHeight })
  },
)
</script>

<template>
  <section class="chat">
    <header class="chat__bar">
      <select class="chat__session" :value="store.current?.id ?? ''" @change="onSelect">
        <option v-for="s in store.sessions" :key="s.id" :value="s.id">{{ s.title }}</option>
      </select>
      <button class="btn" @click="store.newSession()">+ New</button>
      <button
        class="btn"
        :disabled="!store.blueprint || store.markdownLoading"
        :title="!store.blueprint ? 'No blueprint yet' : 'Generate & save the Markdown blueprint'"
        @click="store.generateMarkdown()"
      >
        {{ store.markdownLoading ? 'Generating…' : 'Export Markdown' }}
      </button>
    </header>

    <div ref="listEl" class="chat__list">
      <p v-if="store.messages.length === 0 && !store.streamingMsg" class="chat__empty">
        Describe the app you want to build.<br />
        e.g. "I want to build an invoice app"
      </p>

      <div v-for="m in store.messages" :key="m.id" class="msg" :class="`msg--${m.role}`">
        <div class="msg__role">{{ m.role === 'user' ? 'You' : 'FourFive' }}</div>
        <div v-if="store.thinkingById[m.id]" class="think-box">
          <button class="think-box__head" @click="toggleThinking(m.id)">
            💭 Thinking <span class="think-box__chev">{{ openThinking[m.id] ? '▲' : '▼' }}</span>
          </button>
          <div v-if="openThinking[m.id]" class="think-box__body">{{ store.thinkingById[m.id] }}</div>
        </div>
        <div class="msg__body">{{ m.content }}</div>
      </div>

      <div v-if="store.streamingMsg" class="msg msg--assistant">
        <div class="msg__role">FourFive</div>
        <div v-if="store.streamingMsg?.thinking" class="think-box">
          <button class="think-box__head" @click="toggleStreamThinking">
            💭 Thinking{{ store.streamingMsg?.content ? '' : '…' }}
            <span class="think-box__chev">{{ store.streamingMsg?.thinkingOpen ? '▲' : '▼' }}</span>
          </button>
          <div v-if="store.streamingMsg?.thinkingOpen" class="think-box__body">{{ store.streamingMsg?.thinking }}</div>
        </div>
        <div class="msg__body">
          <span v-if="!store.streamingMsg?.content && !store.streamingMsg?.thinking" class="msg__body--typing">…</span>
          <span>{{ store.streamingMsg?.content }}</span><span v-if="store.sending" class="cursor">▍</span>
        </div>
      </div>
    </div>

    <footer class="chat__input">
      <textarea
        v-model="input"
        rows="3"
        placeholder="Type a message (Ctrl / Cmd + Enter to send)"
        @keydown="onKeydown"
      />
      <button class="btn btn--primary" :disabled="store.sending || !input.trim()" @click="submit">
        Send
      </button>
    </footer>
  </section>
</template>
