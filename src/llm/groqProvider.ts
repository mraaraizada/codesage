// Groq implementation of the provider-agnostic LLMProvider interface (provider.ts). Groq hosts
// fast open-weight models with real function/tool calling support — this drives the exact same
// multi-turn read_file/search_code loop as the Anthropic provider, just over OpenAI's tool-calling
// wire format instead of Anthropic's. The actual request/loop logic now lives in
// openaiCompatibleProvider.ts (shared with OpenRouter and any other OpenAI-compatible backend);
// this class just fixes Groq's base URL and satisfies the LLMProvider interface's `name` field.
import { OpenAICompatibleProvider } from "./openaiCompatibleProvider.js";
import type { AgentLoopParams, AgentLoopResult, CompletionParams, LLMProvider } from "./provider.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export class GroqProvider implements LLMProvider {
  readonly name = "groq" as const;
  readonly model: string;
  private impl: OpenAICompatibleProvider;

  constructor(apiKey: string, model: string, label = "Groq") {
    this.impl = new OpenAICompatibleProvider(apiKey, model, GROQ_BASE_URL, label);
    this.model = model;
  }

  runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
    return this.impl.runAgentLoop(params);
  }

  async complete(params: CompletionParams): Promise<string> {
    try {
      return await this.impl.complete(params);
    } catch (err) {
      // openaiCompatibleProvider.ts's complete() throws raw so FallbackProvider can decide whether
      // to retry with a different backend; a single-backend GroqProvider has no one to fall back
      // to, so it degrades the same soft way it always has — an inline error string the caller
      // (patch.ts) already handles as an empty/unparseable patch, rather than an uncaught exception
      // propagating up through the pipeline.
      const message = err instanceof Error ? err.message : String(err);
      return `(Groq request failed: ${message})`;
    }
  }
}
