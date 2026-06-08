<script setup lang="ts">
import type { Term } from '../../shared/blueprint'

defineProps<{ terms: Term[] }>()
</script>

<template>
  <div class="view">
    <table class="tbl">
      <thead>
        <tr><th>Term</th><th>Definition</th><th>Aliases</th><th>Status</th><th>Related</th></tr>
      </thead>
      <tbody>
        <tr v-for="t in terms" :key="t.term">
          <td class="tbl__strong">{{ t.term }}</td>
          <td>{{ t.definition }}</td>
          <td><span v-for="a in t.aliases" :key="a" class="chip">{{ a }}</span></td>
          <td><span class="status" :class="`status--${t.status}`">{{ t.status }}</span></td>
          <td><span v-for="o in t.related_objects" :key="o" class="chip chip--ghost">{{ o }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
