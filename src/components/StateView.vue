<script setup lang="ts">
import { computed } from 'vue'
import type { StateTransition } from '../../shared/blueprint'
import { transitionsToMermaidState } from '../../shared/mermaid'
import MermaidDiagram from './MermaidDiagram.vue'

const props = defineProps<{ transitions: StateTransition[] }>()
const diagram = computed(() => transitionsToMermaidState(props.transitions))
</script>

<template>
  <div class="view">
    <template v-if="transitions.length">
      <MermaidDiagram :code="diagram" />
      <table class="tbl">
        <thead>
          <tr><th>Subject</th><th>from</th><th>to</th><th>Trigger</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr v-for="(t, i) in transitions" :key="i">
            <td class="tbl__mono">{{ t.subject }}</td>
            <td class="tbl__strong">{{ t.from }}</td>
            <td class="tbl__strong">{{ t.to }}</td>
            <td>{{ t.trigger }}</td>
            <td class="tbl__muted">{{ t.description }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <p v-else class="view__note">This app has no state transitions defined.</p>
  </div>
</template>
