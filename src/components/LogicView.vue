<script setup lang="ts">
import type { BusinessRule } from '../../shared/blueprint'
import { useSessionStore } from '../stores/session'

defineProps<{ rules: BusinessRule[] }>()
const store = useSessionStore()
</script>

<template>
  <div class="view">
    <table class="tbl">
      <thead>
        <tr><th>Logic</th><th>Inputs</th><th>Outputs</th><th>Related DB</th><th>Related API</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rules" :key="r.id" :class="{ 'row--scope': store.scope.logic.has(r.id) }">
          <td>
            <div class="tbl__strong">{{ r.name }}</div>
            <div v-if="r.description" class="tbl__sub">{{ r.description }}</div>
          </td>
          <td><span v-for="i in r.inputs" :key="i" class="chip">{{ i }}</span></td>
          <td><span v-for="o in r.outputs" :key="o" class="chip chip--out">{{ o }}</span></td>
          <td><span v-for="d in r.related_db" :key="d" class="chip chip--ghost">{{ d }}</span></td>
          <td><span v-for="a in r.related_api" :key="a" class="chip chip--ghost">{{ a }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
