<script setup lang="ts">
import { computed } from 'vue'
import type { Entity } from '../../shared/blueprint'
import { entitiesToMermaidErd } from '../../shared/mermaid'
import { useSessionStore } from '../stores/session'
import MermaidDiagram from './MermaidDiagram.vue'

const props = defineProps<{
  entities: Entity[]
  deps?: { name: string; slug: string; entities: Entity[] }[]
}>()
const store = useSessionStore()

const erd = computed(() => entitiesToMermaidErd(props.entities))
// Tables in the current scope-of-concern (from the focused field's maps_to).
const highlightTables = computed(() => [...store.scope.db].map((d) => d.split('.')[0]))
// One pre-rendered ERD per dependency (read-only; no scope highlighting).
const depErds = computed(() =>
  (props.deps ?? []).map((d) => ({ ...d, erd: entitiesToMermaidErd(d.entities) })),
)
</script>

<template>
  <div class="view">
    <MermaidDiagram v-if="entities.length" :code="erd" :highlight="highlightTables" />
    <div v-for="e in entities" :key="e.name" class="entity">
      <div class="entity__head">
        <span class="entity__name">{{ e.name }}</span>
        <span v-if="e.description" class="entity__desc">{{ e.description }}</span>
      </div>
      <table class="tbl">
        <thead>
          <tr><th>Column</th><th>Type</th><th>Constraints</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="c in e.columns"
            :key="c.name"
            :class="{ 'row--scope': store.scope.db.has(`${e.name}.${c.name}`) }"
          >
            <td class="tbl__strong">{{ c.name }}</td>
            <td class="tbl__mono">{{ c.type }}</td>
            <td>
              <span v-if="c.pk" class="badge2 badge2--pk">PK</span>
              <span v-if="c.fk" class="badge2 badge2--fk">FK → {{ c.fk }}</span>
              <span v-if="c.unique" class="badge2">UNIQUE</span>
              <span v-if="c.nullable" class="badge2 badge2--null">NULL</span>
            </td>
            <td class="tbl__muted">{{ c.description }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <section v-for="d in depErds" :key="d.slug" class="depsec">
      <div class="depsec__head">
        <span class="depsec__name">{{ d.name }}</span>
        <span class="badge2">read-only</span>
        <span class="depsec__ns">namespace: {{ d.slug }}</span>
      </div>
      <MermaidDiagram v-if="d.entities.length" :code="d.erd" :highlight="[]" />
      <div v-for="e in d.entities" :key="`${d.slug}.${e.name}`" class="entity">
        <div class="entity__head">
          <span class="entity__name">{{ d.slug }}.{{ e.name }}</span>
          <span v-if="e.description" class="entity__desc">{{ e.description }}</span>
        </div>
        <table class="tbl">
          <thead>
            <tr><th>Column</th><th>Type</th><th>Constraints</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in e.columns" :key="c.name">
              <td class="tbl__strong">{{ c.name }}</td>
              <td class="tbl__mono">{{ c.type }}</td>
              <td>
                <span v-if="c.pk" class="badge2 badge2--pk">PK</span>
                <span v-if="c.fk" class="badge2 badge2--fk">FK → {{ c.fk }}</span>
                <span v-if="c.unique" class="badge2">UNIQUE</span>
                <span v-if="c.nullable" class="badge2 badge2--null">NULL</span>
              </td>
              <td class="tbl__muted">{{ c.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
