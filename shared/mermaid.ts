import type { Entity, StateTransition } from './blueprint'

// Build a Mermaid `erDiagram` source from blueprint entities. Used by both the
// Markdown export (server) and the ERD tab (frontend). Relationships are
// inferred from columns that declare a foreign key (fk: "table.column").

function token(s: string): string {
  // Mermaid identifiers must be alnum/underscore.
  return s.replace(/[^A-Za-z0-9_]/g, '_') || 'x'
}

export function entitiesToMermaidErd(entities: Entity[]): string {
  if (!entities.length) return 'erDiagram\n  %% (no entities yet)'

  const names = new Set(entities.map((e) => e.name))
  const lines: string[] = ['erDiagram']

  for (const e of entities) {
    lines.push(`  ${token(e.name)} {`)
    for (const c of e.columns) {
      const key = c.pk ? ' PK' : c.fk ? ' FK' : ''
      lines.push(`    ${token(c.type)} ${token(c.name)}${key}`)
    }
    lines.push('  }')
  }

  const seen = new Set<string>()
  for (const e of entities) {
    for (const c of e.columns) {
      if (!c.fk) continue
      const parent = c.fk.split('.')[0]
      if (!parent || !names.has(parent)) continue
      const rel = `${parent}->${e.name}`
      if (seen.has(rel)) continue
      seen.add(rel)
      // parent ||--o{ child : "<fk column>"
      lines.push(`  ${token(parent)} ||--o{ ${token(e.name)} : "${c.name.replace(/"/g, '')}"`)
    }
  }

  return lines.join('\n')
}

// Build a Mermaid `stateDiagram-v2` source from state transitions. States that
// are never a transition target get an initial `[*] -->` marker.
export function transitionsToMermaidState(transitions: StateTransition[]): string {
  if (!transitions.length) return 'stateDiagram-v2\n  %% (no transitions yet)'

  const lines: string[] = ['stateDiagram-v2']
  const targets = new Set(transitions.map((t) => t.to))
  const starts = new Set(transitions.map((t) => t.from).filter((f) => !targets.has(f)))

  for (const s of starts) lines.push(`  [*] --> ${token(s)}`)
  for (const t of transitions) {
    const label = t.trigger ? ` : ${t.trigger.replace(/\n/g, ' ')}` : ''
    lines.push(`  ${token(t.from)} --> ${token(t.to)}${label}`)
  }

  return lines.join('\n')
}
