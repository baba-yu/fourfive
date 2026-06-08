import type { ChatMessage } from '../../shared/types'
import type { Blueprint } from '../../shared/blueprint'

// Builds the prompt that asks a real LLM (Ollama / Claude) to emit a blueprint
// JSON object matching shared/blueprint.ts. Kept provider-agnostic.

const SCHEMA_HINT = `The JSON shape is:
{
  "app": { "name": string, "description"?: string },
  "mock_ui": { "screens": [ { "id": string, "name": string,
      "fields": [ { "id": string, "label": string,
        "type": "text"|"number"|"select"|"checkbox"|"radio"|"date"|"textarea",
        "maps_to": string[], "description"?: string, "options"?: string[], "required"?: boolean } ] } ] },
  "entities": [ { "name": string, "description"?: string,
      "columns": [ { "name": string, "type": string, "pk"?: boolean, "fk"?: string,
        "nullable"?: boolean, "unique"?: boolean, "description"?: string } ] } ],
  "business_logic": [ { "id": string, "name": string, "inputs": string[], "outputs": string[],
      "related_db": string[], "related_api": string[], "description"?: string } ],
  "terminology": [ { "term": string, "definition": string, "aliases": string[],
      "related_objects": string[], "status": "confirmed"|"tentative" } ],
  "apis": [ { "method": string, "path": string, "summary"?: string,
      "related_db": string[], "related_ui": string[] } ],
  "open_questions": string[],
  "state_transitions": [ { "subject"?: string, "from": string, "to": string, "trigger"?: string, "description"?: string } ]
}
"maps_to" links a UI field to "table.column". Reuse ids so UI/DB/API/logic cross-reference.
"state_transitions" describes status lifecycles (e.g. an invoice: draft -> sent -> paid). Omit if the app has no meaningful states.`

export function buildBlueprintMessages(
  history: ChatMessage[],
  current: Blueprint | null,
): ChatMessage[] {
  const system = [
    "You are codev's design extractor. From the conversation, infer the app being designed and output ONLY a single JSON object — no prose, no code fences.",
    SCHEMA_HINT,
    'If there is not yet enough information to design anything, output exactly: null',
    'Match the language of the conversation for human-facing strings (labels, definitions).',
  ].join('\n\n')

  const convo = history.map((m) => `${m.role}: ${m.content}`).join('\n')
  const currentStr = current
    ? `\n\nCurrent blueprint (refine it; keep prior detail unless contradicted):\n${JSON.stringify(current)}`
    : ''

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Conversation:\n${convo}${currentStr}\n\nReturn the blueprint JSON now (or null).` },
  ]
}

// Tolerant JSON extraction from a model's text response.
export function extractJson(text: string): unknown {
  const t = text.trim()
  if (t === 'null' || t === '') return null
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : t
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}
