<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import MockUiView from './MockUiView.vue'
import EntitiesView from './EntitiesView.vue'
import LogicView from './LogicView.vue'
import StateView from './StateView.vue'
import ApiView from './ApiView.vue'
import TerminologyView from './TerminologyView.vue'

const store = useSessionStore()
const tabs = ['Mock UI', 'ERD', 'Logic', 'State', 'API', 'Terminology'] as const
type Tab = (typeof tabs)[number]
const active = ref<Tab>('Mock UI')
const bp = computed(() => store.blueprint)
// Read-only slices of each dependency's pinned blueprint for the merged views.
const depEntities = computed(() =>
  store.dependencies
    .filter((d) => d.blueprint)
    .map((d) => ({ name: d.name, slug: d.slug, entities: d.blueprint!.entities })),
)
const depApis = computed(() =>
  store.dependencies
    .filter((d) => d.blueprint)
    .map((d) => ({ name: d.name, slug: d.slug, apis: d.blueprint!.apis })),
)
// A compose session has dependencies before its first own blueprint — still show content.
const hasContent = computed(() => !!bp.value || store.dependencies.length > 0)
</script>

<template>
  <section class="temp">
    <header class="temp__bar">
      <span class="temp__title">
        Temp app<template v-if="bp">: {{ bp.app.name }}</template>
      </span>
      <nav class="temp__tabs">
        <button
          v-for="t in tabs"
          :key="t"
          class="temp__tab"
          :class="{ 'temp__tab--active': active === t }"
          @click="active = t"
        >
          {{ t }}
        </button>
      </nav>
    </header>

    <div v-if="store.dependencies.length" class="temp__deps">
      <span class="temp__deps-label">Depends on:</span>
      <span v-for="d in store.dependencies" :key="d.app_id" class="dep-chip">
        {{ d.name }} v{{ d.pinned_version }}
        <button
          v-if="d.current_version > d.pinned_version"
          class="dep-chip__bump"
          :title="`Update pin from v${d.pinned_version} to v${d.current_version}`"
          @click="store.bumpDependency(d)"
        >
          → v{{ d.current_version }} available
        </button>
      </span>
    </div>

    <div class="temp__body" :class="{ 'temp__body--filled': hasContent }">
      <div v-if="!hasContent" class="temp__placeholder">
        <p class="temp__ph-title">{{ active }}</p>
        <p class="temp__ph-desc">
          "{{ active }}" will appear here.<br />
          FourFive generates it automatically once the spec takes shape in chat.
        </p>
      </div>
      <template v-else>
        <MockUiView v-if="active === 'Mock UI'" :screens="bp?.mock_ui.screens ?? []" />
        <EntitiesView v-else-if="active === 'ERD'" :entities="bp?.entities ?? []" :deps="depEntities" />
        <LogicView v-else-if="active === 'Logic'" :rules="bp?.business_logic ?? []" />
        <StateView v-else-if="active === 'State'" :transitions="bp?.state_transitions ?? []" />
        <ApiView v-else-if="active === 'API'" :apis="bp?.apis ?? []" :deps="depApis" />
        <TerminologyView v-else-if="active === 'Terminology'" :terms="bp?.terminology ?? []" />
      </template>
    </div>
  </section>
</template>
