<script setup lang="ts">
import type { ApiEndpoint } from '../../shared/blueprint'
import { useSessionStore } from '../stores/session'

defineProps<{ apis: ApiEndpoint[] }>()
const store = useSessionStore()
</script>

<template>
  <div class="view">
    <div
      v-for="(a, i) in apis"
      :key="`${a.method}-${a.path}-${i}`"
      class="api"
      :class="{ 'api--scope': store.scope.api.has(`${a.method} ${a.path}`) }"
    >
      <div class="api__line">
        <span class="api__method" :class="`api__method--${a.method.toLowerCase()}`">{{ a.method }}</span>
        <span class="api__path">{{ a.path }}</span>
      </div>
      <p v-if="a.summary" class="api__summary">{{ a.summary }}</p>
      <div v-if="a.related_db.length || a.related_ui.length" class="api__rel">
        <span v-for="d in a.related_db" :key="d" class="chip chip--ghost">{{ d }}</span>
        <span v-for="u in a.related_ui" :key="u" class="chip">{{ u }}</span>
      </div>
    </div>
  </div>
</template>
