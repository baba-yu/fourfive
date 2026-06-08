<script setup lang="ts">
import { reactive } from 'vue'
import type { MockUiScreen } from '../../shared/blueprint'
import { useSessionStore } from '../stores/session'

const props = defineProps<{ screens: MockUiScreen[] }>()
const store = useSessionStore()

// Local-only form state, keyed by field id. Lets the user exercise the mock
// inputs. Typed loosely because a single map holds values of every field type.
const form = reactive<Record<string, any>>({})
</script>

<template>
  <div class="view">
    <p class="view__note">Hover over an input to highlight the related DB / Logic / API in the other tabs (scope of concern).</p>
    <div v-for="screen in props.screens" :key="screen.id" class="view__screen">
      <h3 class="view__h">{{ screen.name }}</h3>
      <div
        v-for="f in screen.fields"
        :key="f.id"
        class="field"
        :class="{ 'field--active': store.activeFieldId === f.id }"
        @mouseenter="store.setActiveField(f.id)"
        @focusin="store.setActiveField(f.id)"
      >
        <label v-if="f.type !== 'checkbox'" class="field__label">
          {{ f.label }}<span v-if="f.required" class="field__req">*</span>
        </label>

        <input v-if="f.type === 'text'" v-model="form[f.id]" type="text" class="field__input" />
        <input v-else-if="f.type === 'number'" v-model="form[f.id]" type="number" class="field__input" />
        <input v-else-if="f.type === 'date'" v-model="form[f.id]" type="date" class="field__input" />
        <textarea v-else-if="f.type === 'textarea'" v-model="form[f.id]" rows="2" class="field__input" />
        <select v-else-if="f.type === 'select'" v-model="form[f.id]" class="field__input">
          <option value="">—</option>
          <option v-for="o in f.options ?? []" :key="o" :value="o">{{ o }}</option>
        </select>
        <label v-else-if="f.type === 'checkbox'" class="field__check">
          <input v-model="form[f.id]" type="checkbox" /> {{ f.label }}
        </label>
        <div v-else-if="f.type === 'radio'" class="field__radios">
          <label v-for="o in f.options ?? []" :key="o">
            <input v-model="form[f.id]" type="radio" :value="o" /> {{ o }}
          </label>
        </div>

        <p v-if="f.description" class="field__desc">{{ f.description }}</p>
        <div v-if="f.maps_to.length" class="field__maps">
          <span class="field__maps-label">→</span>
          <span v-for="m in f.maps_to" :key="m" class="chip chip--ghost">{{ m }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
