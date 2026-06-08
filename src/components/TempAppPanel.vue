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

    <div class="temp__body" :class="{ 'temp__body--filled': bp }">
      <div v-if="!bp" class="temp__placeholder">
        <p class="temp__ph-title">{{ active }}</p>
        <p class="temp__ph-desc">
          "{{ active }}" will appear here.<br />
          FourFive generates it automatically once the spec takes shape in chat.
        </p>
      </div>
      <template v-else>
        <MockUiView v-if="active === 'Mock UI'" :screens="bp?.mock_ui.screens ?? []" />
        <EntitiesView v-else-if="active === 'ERD'" :entities="bp?.entities ?? []" />
        <LogicView v-else-if="active === 'Logic'" :rules="bp?.business_logic ?? []" />
        <StateView v-else-if="active === 'State'" :transitions="bp?.state_transitions ?? []" />
        <ApiView v-else-if="active === 'API'" :apis="bp?.apis ?? []" />
        <TerminologyView v-else-if="active === 'Terminology'" :terms="bp?.terminology ?? []" />
      </template>
    </div>
  </section>
</template>
