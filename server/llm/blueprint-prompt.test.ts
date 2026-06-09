import { describe, expect, it } from 'vitest'
import { buildDependencyContext } from './blueprint-prompt'
import type { Blueprint } from '../../shared/blueprint'

const BP: Blueprint = {
  app: { name: 'Inventory' },
  mock_ui: { screens: [] },
  entities: [{ name: 'products', columns: [{ name: 'id', type: 'TEXT', pk: true }] }],
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
      { name: 'Inventory', slug: 'inventory', pinned_version: 3, blueprint: BP },
    ])
    expect(msg?.role).toBe('system')
    expect(msg?.content).toContain('Inventory')
    expect(msg?.content).toContain('inventory')
    expect(msg?.content).toContain('v3')
    expect(msg?.content).toContain('READ-ONLY')
    expect(msg?.content).toContain('"products"')
    expect(msg?.content).toContain('never redefine')
  })
})
