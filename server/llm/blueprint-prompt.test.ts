import { describe, expect, it } from 'vitest'
import { buildDependencyContext, buildBlueprintMessages } from './blueprint-prompt'
import type { Blueprint } from '../../shared/blueprint'

const BP: Blueprint = {
  app: { name: 'Warehouse Tracker' },
  mock_ui: { screens: [] },
  entities: [{ name: 'products', columns: [{ name: 'id', type: 'TEXT', pk: true }] }],
  business_logic: [],
  terminology: [],
  apis: [],
  open_questions: [],
  state_transitions: [],
}

const BP2: Blueprint = {
  app: { name: 'Shipping' },
  mock_ui: { screens: [] },
  entities: [{ name: 'shipments', columns: [{ name: 'id', type: 'TEXT', pk: true }] }],
  business_logic: [],
  terminology: [],
  apis: [],
  open_questions: [],
  state_transitions: [],
}

describe('buildDependencyContext', () => {
  it('returns null when there are no dependencies with blueprints', () => {
    expect(buildDependencyContext([])).toBeNull()
    expect(
      buildDependencyContext([{ name: 'X', slug: 'x', pinned_version: 1, blueprint: null }]),
    ).toBeNull()
  })

  it('builds a system message with namespacing rules and the dependency JSON', () => {
    const msg = buildDependencyContext([
      { name: 'Warehouse Tracker', slug: 'warehouse', pinned_version: 3, blueprint: BP },
    ])
    expect(msg?.role).toBe('system')
    expect(msg?.content).toContain('Warehouse Tracker')
    expect(msg?.content).toContain('warehouse')
    expect(msg?.content).toContain('v3')
    expect(msg?.content).toContain('READ-ONLY')
    expect(msg?.content).toContain('"products"')
    expect(msg?.content).toContain('never redefine')
  })

  it('includes both section headings when there are two dependencies', () => {
    const msg = buildDependencyContext([
      { name: 'Warehouse Tracker', slug: 'warehouse', pinned_version: 3, blueprint: BP },
      { name: 'Shipping', slug: 'shipping', pinned_version: 1, blueprint: BP2 },
    ])
    expect(msg?.content).toContain('(namespace: warehouse, pinned v3)')
    expect(msg?.content).toContain('(namespace: shipping, pinned v1)')
  })
})

describe('buildBlueprintMessages', () => {
  it('hoists system-role history entries into the system prompt instead of the transcript', () => {
    const history = [
      { role: 'system' as const, content: 'DEP-CONTEXT-MARKER' },
      { role: 'user' as const, content: 'hello' },
    ]
    const msgs = buildBlueprintMessages(history, null)

    expect(msgs).toHaveLength(2)

    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('DEP-CONTEXT-MARKER')

    expect(msgs[1].role).toBe('user')
    expect(msgs[1].content).not.toContain('DEP-CONTEXT-MARKER')
    expect(msgs[1].content).not.toContain('system:')
    expect(msgs[1].content).toContain('user: hello')
  })
})
