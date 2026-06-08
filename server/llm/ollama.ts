import type { ChatMessage } from '../../shared/types'
import type { Blueprint } from '../../shared/blueprint'
import type { LLMProvider, LLMResult, ChatOptions, StreamHandler } from './provider'
import { buildBlueprintMessages, extractJson } from './blueprint-prompt'

interface OllamaChatResponse {
  message?: { content?: string; thinking?: string }
}

// Talks to a local Ollama daemon (default http://localhost:11434).
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama'
  readonly model = process.env.OLLAMA_MODEL ?? 'llama3.1'
  private readonly base = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

  private body(messages: ChatMessage[], json: boolean, opts: ChatOptions, stream: boolean) {
    return {
      model: this.model,
      messages,
      stream,
      think: opts.think ?? false,
      ...(json ? { format: 'json' } : {}),
      ...(opts.maxTokens ? { options: { num_predict: opts.maxTokens } } : {}),
    }
  }

  private async call(messages: ChatMessage[], json: boolean, opts: ChatOptions): Promise<string> {
    const res = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // proposeBlueprint passes no maxTokens — never cap JSON output.
      body: JSON.stringify(this.body(messages, json, json ? { ...opts, maxTokens: undefined } : opts, false)),
    })
    if (!res.ok) {
      throw new Error(`Ollama error ${res.status}: ${await res.text()}`)
    }
    const data = (await res.json()) as OllamaChatResponse
    return data.message?.content ?? ''
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<LLMResult> {
    const content = await this.call(messages, false, opts)
    return { content, model: this.model }
  }

  async chatStream(
    messages: ChatMessage[],
    opts: ChatOptions,
    onDelta: StreamHandler,
  ): Promise<LLMResult> {
    const res = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.body(messages, false, opts, true)),
    })
    if (!res.ok || !res.body) {
      throw new Error(`Ollama error ${res.status}: ${await res.text().catch(() => '')}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let content = ''

    // Ollama streams newline-delimited JSON objects.
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        let obj: OllamaChatResponse
        try {
          obj = JSON.parse(line) as OllamaChatResponse
        } catch {
          continue
        }
        const think = obj.message?.thinking
        const text = obj.message?.content
        if (think) await onDelta({ thinking: think })
        if (text) {
          content += text
          await onDelta({ content: text })
        }
      }
    }
    return { content, model: this.model }
  }

  async proposeBlueprint(
    history: ChatMessage[],
    current: Blueprint | null,
    opts: ChatOptions = {},
  ): Promise<unknown> {
    try {
      const content = await this.call(buildBlueprintMessages(history, current), true, opts)
      return extractJson(content)
    } catch {
      return null
    }
  }
}
