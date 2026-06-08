import type { ChatMessage } from '../../shared/types'
import type { Blueprint } from '../../shared/blueprint'
import type { LLMProvider, LLMResult, ChatOptions, StreamHandler } from './provider'

// Canned invoice blueprint — the PRD's running example. Returned by the mock
// provider when the conversation mentions invoices, so the right pane populates
// with realistic, schema-valid data and no external LLM is needed.
const INVOICE_BLUEPRINT: Blueprint = {
  app: { name: 'Invoice App', description: 'An app to create and manage customer invoices' },
  mock_ui: {
    screens: [
      {
        id: 'invoice_create',
        name: 'Create Invoice',
        fields: [
          { id: 'customer_name', label: 'Customer Name', type: 'text', maps_to: ['customers.name'], required: true, description: 'Name of the customer being billed' },
          { id: 'issue_date', label: 'Issue Date', type: 'date', maps_to: ['invoices.issue_date'], required: true },
          { id: 'due_date', label: 'Due Date', type: 'date', maps_to: ['invoices.due_date'] },
          { id: 'tax_rate', label: 'Tax Rate', type: 'select', options: ['0.08', '0.10'], maps_to: ['invoices.tax_rate'], description: 'Applicable consumption tax rate' },
          { id: 'item_description', label: 'Item', type: 'text', maps_to: ['invoice_items.description'] },
          { id: 'quantity', label: 'Quantity', type: 'number', maps_to: ['invoice_items.quantity'] },
          { id: 'unit_price', label: 'Unit Price', type: 'number', maps_to: ['invoice_items.unit_price'] },
          { id: 'notes', label: 'Notes', type: 'textarea', maps_to: ['invoices.notes'] },
        ],
      },
    ],
  },
  entities: [
    {
      name: 'customers',
      description: 'The customer being billed',
      columns: [
        { name: 'id', type: 'TEXT', pk: true },
        { name: 'name', type: 'TEXT', nullable: false, description: 'Customer name' },
        { name: 'email', type: 'TEXT', nullable: true },
        { name: 'created_at', type: 'TEXT' },
      ],
    },
    {
      name: 'invoices',
      description: 'Invoice header',
      columns: [
        { name: 'id', type: 'TEXT', pk: true },
        { name: 'customer_id', type: 'TEXT', fk: 'customers.id' },
        { name: 'issue_date', type: 'TEXT' },
        { name: 'due_date', type: 'TEXT', nullable: true },
        { name: 'tax_rate', type: 'REAL' },
        { name: 'tax_amount', type: 'INTEGER' },
        { name: 'total_amount', type: 'INTEGER' },
        { name: 'notes', type: 'TEXT', nullable: true },
      ],
    },
    {
      name: 'invoice_items',
      description: 'Invoice line item',
      columns: [
        { name: 'id', type: 'TEXT', pk: true },
        { name: 'invoice_id', type: 'TEXT', fk: 'invoices.id' },
        { name: 'description', type: 'TEXT' },
        { name: 'quantity', type: 'INTEGER' },
        { name: 'unit_price', type: 'INTEGER' },
        { name: 'line_total', type: 'INTEGER' },
      ],
    },
  ],
  business_logic: [
    { id: 'calc_line_total', name: 'Calculate line subtotal', inputs: ['quantity', 'unit_price'], outputs: ['line_total'], related_db: ['invoice_items.quantity', 'invoice_items.unit_price', 'invoice_items.line_total'], related_api: ['POST /invoices'], description: 'line_total = quantity × unit_price' },
    { id: 'calc_tax', name: 'Calculate tax amount', inputs: ['subtotal', 'tax_rate'], outputs: ['tax_amount'], related_db: ['invoices.tax_rate', 'invoices.tax_amount'], related_api: ['POST /invoices'], description: 'tax_amount = subtotal × tax_rate' },
    { id: 'calc_total', name: 'Calculate total amount', inputs: ['subtotal', 'tax_amount'], outputs: ['total_amount'], related_db: ['invoices.total_amount'], related_api: ['POST /invoices'], description: 'total_amount = subtotal + tax_amount' },
  ],
  terminology: [
    { term: 'Invoice', definition: 'A document requesting payment from a customer', aliases: ['invoice', 'Bill'], related_objects: ['invoices', 'POST /invoices'], status: 'confirmed' },
    { term: 'Line item', definition: 'Each item row on an invoice', aliases: ['line item', 'invoice_item'], related_objects: ['invoice_items'], status: 'confirmed' },
    { term: 'Tax rate', definition: 'The consumption tax rate applied to the billed amount', aliases: ['tax rate'], related_objects: ['invoices.tax_rate'], status: 'tentative' },
  ],
  apis: [
    { method: 'POST', path: '/invoices', summary: 'Create an invoice', related_db: ['invoices', 'invoice_items', 'customers'], related_ui: ['invoice_create'] },
    { method: 'GET', path: '/invoices/:id', summary: 'Get an invoice', related_db: ['invoices', 'invoice_items'], related_ui: [] },
  ],
  open_questions: ['Is tax applied per line item or per invoice?', 'Are customers pre-registered, or entered on the fly?'],
  state_transitions: [
    { subject: 'invoices.status', from: 'draft', to: 'sent', trigger: 'Issue invoice', description: 'Sent to the customer' },
    { subject: 'invoices.status', from: 'sent', to: 'paid', trigger: 'Payment confirmed' },
    { subject: 'invoices.status', from: 'sent', to: 'overdue', trigger: 'Past due date' },
    { subject: 'invoices.status', from: 'overdue', to: 'paid', trigger: 'Payment confirmed' },
  ],
}

// Matches invoice-shaped prompts in English or Japanese, so the offline demo
// triggers regardless of the language the user types in.
const INVOICE_RE = /invoice|bill|請求|インボイス/i

// Offline default provider. chat() returns canned guidance; proposeBlueprint()
// returns the invoice blueprint once the conversation looks invoice-shaped.
export class MockProvider implements LLMProvider {
  readonly name = 'mock'
  readonly model = 'mock-1'

  async chat(messages: ChatMessage[]): Promise<LLMResult> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const text = (lastUser?.content ?? '').trim()
    const looksInvoice = INVOICE_RE.test(messages.map((m) => m.content).join(' '))
    const lines = [
      'This is a mock LLM response (for offline testing with no external connection).',
      '',
      `Received requirement: "${text.slice(0, 200)}${text.length > 200 ? '…' : ''}"`,
    ]
    if (looksInvoice) {
      lines.push('', 'Generated design data for an invoice app. Check the tabs in the right pane (Mock UI / ERD / Logic / API / Terminology).')
    } else {
      lines.push('', 'Tip: write something like "I want to build an invoice app" and the mock will generate a full set of design data.')
    }
    lines.push('', 'To switch to a real LLM, set CODEV_LLM_PROVIDER to ollama / claude in .env.')
    return { content: lines.join('\n'), model: this.model }
  }

  async chatStream(
    messages: ChatMessage[],
    opts: ChatOptions,
    onDelta: StreamHandler,
  ): Promise<LLMResult> {
    const result = await this.chat(messages)
    if (opts.think) {
      const t =
        '(thinking) Reviewing the requirements. For an invoice app, it looks like we need customers / invoices / invoice_items and tax calculation.'
      for (const part of t.match(/.{1,10}/gs) ?? [t]) await onDelta({ thinking: part })
    }
    for (const part of result.content.match(/.{1,14}/gs) ?? [result.content]) {
      await onDelta({ content: part })
    }
    return result
  }

  async proposeBlueprint(history: ChatMessage[]): Promise<unknown> {
    const text = history.map((m) => m.content).join(' ')
    if (INVOICE_RE.test(text)) return INVOICE_BLUEPRINT
    return null
  }
}
