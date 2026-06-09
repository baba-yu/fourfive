import type { ChatMessage } from '../../shared/types'
import type { Blueprint } from '../../shared/blueprint'
import type { LLMProvider, LLMResult, ChatOptions, StreamHandler } from './provider'
import { buildBlueprintMessages, extractJson } from './blueprint-prompt'

interface AnthropicMessagesResponse {
  model?: string
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

// Calls the Anthropic Messages API directly via fetch (no SDK dependency).
// NOTE: model id / params here are a sane default; validate against the
// `claude-api` skill before relying on this provider in anger.
export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude'
  readonly model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'
  private readonly key = process.env.ANTHROPIC_API_KEY ?? ''

  private async call(
    messages: ChatMessage[],
    maxTokens: number,
  ): Promise<{ text: string; model?: string; usage?: { input: number; output: number } }> {
    if (!this.key) {
      throw new Error('ANTHROPIC_API_KEY is not set (CODEV_LLM_PROVIDER=claude)')
    }
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        system: system || undefined,
        messages: turns,
      }),
    })
    if (!res.ok) {
      throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
    }
    const data = (await res.json()) as AnthropicMessagesResponse
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
    return {
      text,
      model: data.model,
      usage: data.usage
        ? { input: data.usage.input_tokens ?? 0, output: data.usage.output_tokens ?? 0 }
        : undefined,
    }
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<LLMResult> {
    const { text, model, usage } = await this.call(messages, opts.maxTokens ?? 2048)
    return { content: text, model: model ?? this.model, usage }
  }

  async chatStream(
    messages: ChatMessage[],
    opts: ChatOptions,
    onDelta: StreamHandler,
  ): Promise<LLMResult> {
    // No incremental streaming for Claude yet — emit the full reply as one delta.
    const result = await this.chat(messages, opts)
    await onDelta({ content: result.content })
    return result
  }

  async proposeBlueprint(history: ChatMessage[], current: Blueprint | null): Promise<unknown> {
    try {
      const { text } = await this.call(buildBlueprintMessages(history, current), 4096)
      return extractJson(text)
    } catch {
      return null
    }
  }
}
