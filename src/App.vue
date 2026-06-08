<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSessionStore } from './stores/session'
import ChatPanel from './components/ChatPanel.vue'
import TempAppPanel from './components/TempAppPanel.vue'
import MarkdownModal from './components/MarkdownModal.vue'

const store = useSessionStore()
const isRealLlm = computed(() => store.provider === 'ollama' || store.provider === 'claude')

function onMaxTokens(e: Event) {
  store.setMaxTokens(Number((e.target as HTMLInputElement).value))
}

onMounted(() => store.init())
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">FourFive</div>
      <div class="topbar__meta">
        <button
          v-if="store.provider === 'ollama'"
          class="think"
          :class="{ 'think--on': store.thinking }"
          :title="
            store.thinking
              ? 'Thinking on: higher quality but slower (generates reasoning)'
              : 'Thinking off: faster (skips reasoning)'
          "
          @click="store.setThinking(!store.thinking)"
        >
          <span class="think__dot" />
          Thinking {{ store.thinking ? 'ON' : 'OFF' }}
        </button>
        <div v-if="isRealLlm" class="numctl" :class="{ 'numctl--on': store.maxTokensOn }">
          <button
            class="numctl__toggle"
            :title="store.maxTokensOn ? 'Output token cap on' : 'Output token cap off (model default)'"
            @click="store.setMaxTokensOn(!store.maxTokensOn)"
          >
            Token cap {{ store.maxTokensOn ? 'ON' : 'OFF' }}
          </button>
          <input
            v-if="store.maxTokensOn"
            class="numctl__input"
            type="number"
            min="64"
            step="64"
            :value="store.maxTokens"
            @change="onMaxTokens"
          />
        </div>
        <span class="badge">LLM: {{ store.provider }}</span>
      </div>
    </header>
    <main class="panes">
      <ChatPanel class="panes__left" />
      <TempAppPanel class="panes__right" />
    </main>
    <MarkdownModal />
  </div>
</template>
