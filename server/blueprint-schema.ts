import { z } from 'zod'
import type { Blueprint } from '../shared/blueprint'

// zod schema mirroring shared/blueprint.ts. LLM output is untrusted, so every
// proposed blueprint is parsed through this before persistence.

const fieldType = z.enum(['text', 'number', 'select', 'checkbox', 'radio', 'date', 'textarea'])

const mockUiField = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: fieldType,
  maps_to: z.array(z.string()).default([]),
  description: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
})

const mockUiScreen = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fields: z.array(mockUiField).default([]),
})

const entityColumn = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  pk: z.boolean().optional(),
  fk: z.string().optional(),
  nullable: z.boolean().optional(),
  unique: z.boolean().optional(),
  description: z.string().optional(),
})

const entity = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  columns: z.array(entityColumn).default([]),
})

const businessRule = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  related_db: z.array(z.string()).default([]),
  related_api: z.array(z.string()).default([]),
  description: z.string().optional(),
})

const term = z.object({
  term: z.string().min(1),
  definition: z.string().default(''),
  aliases: z.array(z.string()).default([]),
  related_objects: z.array(z.string()).default([]),
  status: z.enum(['confirmed', 'tentative']).default('tentative'),
})

const apiEndpoint = z.object({
  method: z.string().min(1),
  path: z.string().min(1),
  summary: z.string().optional(),
  related_db: z.array(z.string()).default([]),
  related_ui: z.array(z.string()).default([]),
})

const stateTransition = z.object({
  subject: z.string().optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  trigger: z.string().optional(),
  description: z.string().optional(),
})

export const blueprintSchema = z.object({
  app: z.object({ name: z.string().min(1), description: z.string().optional() }),
  mock_ui: z.object({ screens: z.array(mockUiScreen).default([]) }).default({ screens: [] }),
  entities: z.array(entity).default([]),
  business_logic: z.array(businessRule).default([]),
  terminology: z.array(term).default([]),
  apis: z.array(apiEndpoint).default([]),
  open_questions: z.array(z.string()).default([]),
  state_transitions: z.array(stateTransition).default([]),
  software_stack: z.string().optional(),
})

export function validateBlueprint(data: unknown) {
  return blueprintSchema.safeParse(data)
}

// Compile-time only: ensures the validated output stays assignable to the
// shared Blueprint type (no runtime cost). Fails typecheck if the two drift.
export type ValidatedBlueprint = z.infer<typeof blueprintSchema>
const _assignable: Blueprint = {} as ValidatedBlueprint
void _assignable
