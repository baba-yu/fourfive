<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { renderMermaid } from '../lib/mermaid'

const props = defineProps<{ code: string; highlight?: string[] }>()
const svg = ref('')
const error = ref('')
const loading = ref(false)
const host = ref<HTMLElement | null>(null)

async function render() {
  error.value = ''
  if (!props.code.trim()) {
    svg.value = ''
    return
  }
  loading.value = true
  try {
    svg.value = await renderMermaid(props.code)
    await nextTick()
    applyHighlight()
  } catch (e) {
    error.value = (e as Error)?.message ?? 'render error'
    svg.value = ''
  } finally {
    loading.value = false
  }
}

// Highlight scoped ER entities in the rendered SVG. mermaid v11 renders each
// entity as a `g.node` (name in `.name`, box outline in `.outer-path`). We set
// inline styles (which beat mermaid's class CSS). No-ops gracefully if the
// structure differs — the detail tables still light up.
function applyHighlight() {
  const el = host.value
  if (!el) return
  const names = new Set(props.highlight ?? [])
  el.querySelectorAll<SVGGElement>('g.node').forEach((node) => {
    const name = (node.querySelector('.name')?.textContent ?? '').trim()
    const on = names.has(name)
    node.style.filter = on ? 'drop-shadow(0 0 7px rgba(91, 140, 255, 0.85))' : ''
    node.querySelectorAll<SVGPathElement>('.outer-path path').forEach((p) => {
      p.style.stroke = on ? 'var(--accent)' : ''
      p.style.strokeWidth = on ? '2px' : ''
    })
  })
}

onMounted(render)
watch(() => props.code, render)
watch(() => props.highlight, applyHighlight)
</script>

<template>
  <div class="mermaid-wrap">
    <div v-if="error" class="mermaid-err">ERD render error: {{ error }}</div>
    <div v-else-if="loading && !svg" class="mermaid-loading">Rendering ERD…</div>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else ref="host" class="mermaid-svg" v-html="svg" />
  </div>
</template>
