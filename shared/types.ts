// Types shared between the Vue frontend and the Hono server.

import type { Blueprint } from './blueprint'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface Session {
  id: string
  app_id: string | null
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  session_id: string
  role: ChatRole
  content: string
  created_at: string
}

export interface TemporaryApp {
  id: string
  name: string
  slug: string
  description: string | null
  current_version: number
  workspace_path: string
  created_at: string
  updated_at: string
}

// --- API DTOs ---

export interface HealthResponse {
  ok: boolean
  provider: string
  model: string
  version: string
}

export interface CreateSessionBody {
  title?: string
}

export interface SendMessageBody {
  content: string
  think?: boolean
  maxTokens?: number
}

export interface SendMessageResponse {
  userMessage: Message
  assistantMessage: Message
  blueprint: Blueprint | null
}
