// The structured design artifact codev builds up from the chat. Plain types
// shared by frontend and server; the server validates incoming data against a
// matching zod schema (server/blueprint-schema.ts) before trusting it.

export type FieldType =
  | 'text'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'textarea'

export interface MockUiField {
  id: string
  label: string
  type: FieldType
  maps_to: string[] // e.g. ["invoices.customer_id"]
  description?: string
  options?: string[] // for select / radio
  required?: boolean
}

export interface MockUiScreen {
  id: string
  name: string
  fields: MockUiField[]
}

export interface EntityColumn {
  name: string
  type: string
  pk?: boolean
  fk?: string // "customers.id"
  nullable?: boolean
  unique?: boolean
  description?: string
}

export interface Entity {
  name: string
  description?: string
  columns: EntityColumn[]
}

export interface BusinessRule {
  id: string
  name: string
  inputs: string[]
  outputs: string[]
  related_db: string[]
  related_api: string[]
  description?: string
}

export interface Term {
  term: string
  definition: string
  aliases: string[]
  related_objects: string[]
  status: 'confirmed' | 'tentative'
}

export interface ApiEndpoint {
  method: string
  path: string
  summary?: string
  related_db: string[]
  related_ui: string[]
}

export interface StateTransition {
  subject?: string // e.g. "invoices.status"
  from: string
  to: string
  trigger?: string
  description?: string
}

export interface Blueprint {
  app: { name: string; description?: string }
  mock_ui: { screens: MockUiScreen[] }
  entities: Entity[]
  business_logic: BusinessRule[]
  terminology: Term[]
  apis: ApiEndpoint[]
  open_questions: string[]
  state_transitions: StateTransition[]
  // User-specified (not LLM-generated); preserved across blueprint updates.
  software_stack?: string
}
