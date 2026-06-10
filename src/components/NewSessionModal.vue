<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSessionStore } from '../stores/session'
import { api } from '../api/client'
import type { AppListItem } from '../../shared/types'

const store = useSessionStore()
const mode = ref<'choose' | 'compose'>('choose')
const apps = ref<AppListItem[]>([])
const selected = ref<Set<string>>(new Set())
const name = ref('')
const creating = ref(false)
const error = ref('')

// Reset and (re)load the app list every time the modal opens.
watch(
  () => store.showNewSessionModal,
  async (open) => {
    if (!open) return
    mode.value = 'choose'
    selected.value = new Set()
    name.value = ''
    error.value = ''
    apps.value = await api.listApps().catch(() => [])
  },
)

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function createNew() {
  if (creating.value) return
  creating.value = true
  error.value = ''
  try {
    await store.newSession()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    creating.value = false
  }
}

async function confirmCompose() {
  if (!name.value.trim() || selected.value.size === 0 || creating.value) return
  creating.value = true
  error.value = ''
  try {
    await store.composeSession(name.value.trim(), [...selected.value])
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div v-if="store.showNewSessionModal" class="modal" @click.self="store.showNewSessionModal = false">
    <div class="modal__box modal__box--narrow">
      <header class="modal__bar">
        <span class="modal__title">New session</span>
        <div class="modal__actions">
          <button class="btn" @click="store.showNewSessionModal = false">Close</button>
        </div>
      </header>

      <div v-if="mode === 'choose'" class="newsess">
        <button class="newsess__choice" :disabled="creating" @click="createNew">
          <strong>Create a new app</strong>
          <span>Start from an empty session; the app takes shape as you chat.</span>
        </button>
        <button
          class="newsess__choice"
          :disabled="apps.length === 0 || creating"
          :title="apps.length === 0 ? 'No existing apps with a saved blueprint yet' : undefined"
          @click="mode = 'compose'"
        >
          <strong>Compose existing apps</strong>
          <span>Build a new app on top of existing ones (read-only, version-pinned dependencies).</span>
        </button>
        <p v-if="error" class="newsess__error">⚠️ {{ error }}</p>
      </div>

      <div v-else class="newsess">
        <label class="newsess__label">New app name</label>
        <input v-model="name" class="newsess__name" placeholder="e.g. Order & Inventory portal" @keydown.enter="confirmCompose" />
        <label class="newsess__label">Dependencies</label>
        <ul class="newsess__apps">
          <li v-for="a in apps" :key="a.id">
            <label class="newsess__app">
              <input type="checkbox" :checked="selected.has(a.id)" @change="toggle(a.id)" />
              <span class="newsess__app-name">{{ a.name }}</span>
              <span class="newsess__app-meta">v{{ a.current_version }} · {{ a.updated_at.slice(0, 10) }}</span>
            </label>
          </li>
        </ul>
        <p v-if="error" class="newsess__error">⚠️ {{ error }}</p>
        <footer class="newsess__foot">
          <button class="btn" @click="mode = 'choose'">Back</button>
          <button
            class="btn btn--primary"
            :disabled="!name.trim() || selected.size === 0 || creating"
            @click="confirmCompose"
          >
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>
