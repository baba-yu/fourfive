<script setup lang="ts">
import { useSessionStore } from '../stores/session'

const store = useSessionStore()

async function copy() {
  if (store.markdown) {
    try {
      await navigator.clipboard.writeText(store.markdown)
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  }
}

function download() {
  if (!store.markdown) return
  const blob = new Blob([store.markdown], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(store.current?.title ?? 'blueprint').replace(/\s+/g, '_')}.md`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div v-if="store.showMarkdown" class="modal" @click.self="store.closeMarkdown()">
    <div class="modal__box">
      <header class="modal__bar">
        <span class="modal__title">Markdown Blueprint</span>
        <div class="modal__actions">
          <button class="btn" @click="copy">Copy</button>
          <button class="btn" @click="download">Download .md</button>
          <button class="btn" @click="store.closeMarkdown()">Close</button>
        </div>
      </header>
      <p v-if="store.markdownPath" class="modal__path">Saved to: {{ store.markdownPath }}</p>
      <div class="modal__stack">
        <label class="modal__stack-label">Software Stack (optional — reflected in §10)</label>
        <textarea
          v-model="store.softwareStack"
          class="modal__stack-input"
          rows="3"
          placeholder="e.g. Frontend: Vue 3 + TS / Backend: Django / DB: PostgreSQL"
        />
        <button class="btn" :disabled="store.markdownLoading" @click="store.generateMarkdown()">
          {{ store.markdownLoading ? 'Regenerating…' : 'Apply stack & regenerate' }}
        </button>
      </div>
      <pre class="modal__md">{{ store.markdown }}</pre>
    </div>
  </div>
</template>
