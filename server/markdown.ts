import type { Blueprint } from '../shared/blueprint'
import { entitiesToMermaidErd, transitionsToMermaidState } from '../shared/mermaid'

// Render a Blueprint as a Markdown design doc following the PRD §18 template.

function cell(s: string | undefined): string {
  return (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function renderBlueprintMarkdown(bp: Blueprint): string {
  const out: string[] = []
  const p = (s = '') => out.push(s)

  p(`# App Blueprint: ${bp.app.name}`)
  p()
  p('## 1. Overview')
  p(bp.app.description?.trim() || '_(no description)_')
  p()

  p('## 2. User Experience')
  if (bp.mock_ui.screens.length) {
    for (const s of bp.mock_ui.screens) {
      p(`- **${s.name}** — ${s.fields.map((f) => f.label).join(' / ')}`)
    }
  } else p('_(none)_')
  p()

  p('## 3. Terminology')
  if (bp.terminology.length) {
    p('| Term | Definition | Aliases | Status |')
    p('| --- | --- | --- | --- |')
    for (const t of bp.terminology) {
      p(`| ${cell(t.term)} | ${cell(t.definition)} | ${cell(t.aliases.join(', '))} | ${t.status} |`)
    }
  } else p('_(none)_')
  p()

  p('## 4. Business Logic')
  if (bp.business_logic.length) {
    p('| Logic | Inputs | Outputs | Related DB | Related API |')
    p('| --- | --- | --- | --- | --- |')
    for (const r of bp.business_logic) {
      p(
        `| ${cell(r.name)} | ${cell(r.inputs.join(', '))} | ${cell(r.outputs.join(', '))} | ${cell(r.related_db.join(', '))} | ${cell(r.related_api.join(', '))} |`,
      )
    }
  } else p('_(none)_')
  p()

  p('## 5. Data Model')
  for (const e of bp.entities) {
    p(`### ${e.name}${e.description ? ` — ${e.description}` : ''}`)
    p('| Column | Type | Constraints | Description |')
    p('| --- | --- | --- | --- |')
    for (const c of e.columns) {
      const flags = [
        c.pk ? 'PK' : '',
        c.fk ? `FK→${c.fk}` : '',
        c.unique ? 'UNIQUE' : '',
        c.nullable ? 'NULL' : '',
      ]
        .filter(Boolean)
        .join(', ')
      p(`| ${cell(c.name)} | ${cell(c.type)} | ${cell(flags)} | ${cell(c.description)} |`)
    }
    p()
  }

  p('## 6. ERD')
  p('```mermaid')
  p(entitiesToMermaidErd(bp.entities))
  p('```')
  p()

  p('## 7. API Design')
  if (bp.apis.length) {
    for (const a of bp.apis) {
      p(`### ${a.method} ${a.path}`)
      if (a.summary) p(a.summary)
      if (a.related_db.length) p(`- Related DB: ${a.related_db.join(', ')}`)
      if (a.related_ui.length) p(`- Related UI: ${a.related_ui.join(', ')}`)
      p()
    }
  } else {
    p('_(none)_')
    p()
  }

  p('## 8. Validation Rules')
  const required = bp.mock_ui.screens.flatMap((s) => s.fields).filter((f) => f.required)
  if (required.length) {
    for (const f of required) p(`- \`${f.id}\` (${f.label}) is required`)
  } else p('_(none specified)_')
  p()

  p('## 9. State Transitions')
  const transitions = bp.state_transitions ?? []
  if (transitions.length) {
    p('```mermaid')
    p(transitionsToMermaidState(transitions))
    p('```')
    p()
    p('| Subject | from | to | Trigger | Description |')
    p('| --- | --- | --- | --- | --- |')
    for (const t of transitions) {
      p(`| ${cell(t.subject)} | ${cell(t.from)} | ${cell(t.to)} | ${cell(t.trigger)} | ${cell(t.description)} |`)
    }
  } else {
    p('_(none defined)_')
  }
  p()

  p('## 10. Software Stack')
  if (bp.software_stack?.trim()) {
    p(bp.software_stack.trim())
  } else {
    p('_(none specified)_')
  }
  p()
  p('## 11. Implementation Notes')
  p('_(none)_')
  p()

  p('## 12. Open Questions')
  if (bp.open_questions.length) {
    for (const q of bp.open_questions) p(`- ${q}`)
  } else p('_(none)_')
  p()

  return out.join('\n')
}
