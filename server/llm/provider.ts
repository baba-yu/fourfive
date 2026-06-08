import type { ChatMessage } from '../../shared/types'
import type { Blueprint } from '../../shared/blueprint'
import { MockProvider } from './mock'
import { OllamaProvider } from './ollama'
import { ClaudeProvider } from './claude'

export interface LLMResult {
  content: string
  model: string
  raw?: unknown
}

export interface ChatOptions {
  /** Enable extended "thinking" for capable models (e.g. Ollama qwen3). Default off (faster). */
  think?: boolean
  /** Cap the chat reply length (Ollama num_predict / Claude max_tokens). Omit for the default. */
  maxTokens?: number
}

export interface StreamDelta {
  thinking?: string
  content?: string
}
export type StreamHandler = (delta: StreamDelta) => void | Promise<void>

export interface LLMProvider {
  readonly name: string
  readonly model: string
  /** Human-readable chat reply. */
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResult>
  /** Streaming chat: calls onDelta for each thinking/content chunk; resolves with the full result. */
  chatStream(messages: ChatMessage[], opts: ChatOptions, onDelta: StreamHandler): Promise<LLMResult>
  /**
   * Propose a structured blueprint from the conversation, or null if there
   * isn't enough yet. Returns an UNVALIDATED candidate — the caller validates
   * it against the zod schema before persisting.
   */
  proposeBlueprint(
    history: ChatMessage[],
    current: Blueprint | null,
    opts?: ChatOptions,
  ): Promise<unknown>
}

let cached: LLMProvider | null = null

export function getProvider(): LLMProvider {
  if (cached) return cached
  const which = (process.env.CODEV_LLM_PROVIDER ?? 'mock').toLowerCase()
  switch (which) {
    case 'ollama':
      cached = new OllamaProvider()
      break
    case 'claude':
    case 'anthropic':
      cached = new ClaudeProvider()
      break
    case 'mock':
    default:
      cached = new MockProvider()
      break
  }
  return cached
}
