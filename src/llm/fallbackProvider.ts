// Tries several OpenAI-compatible backends in order (e.g. a primary Groq key, a secondary Groq
// key, an OpenRouter free-tier key) so a rate/quota limit on one doesn't stop an investigation —
// it automatically falls through to the next configured backend instead. All backends must speak
// the same OpenAI-compatible wire format (true for Groq and OpenRouter).
//
// Falls through to the next backend on ANY genuine rate/quota rejection (`providerErrorWasRateLimit`),
// not only an immediate one — observed in practice that a shared-quota key can run out mid-
// investigation just as often as at the very start (a daily token cap doesn't care which call
// crosses the line). This re-runs the investigation from scratch on the next backend rather than
// splicing partial tool-call history across models — real tool calls already made are redone
// (a modest cost in iterations/tokens), but the result is a complete, honest investigation instead
// of a partial one that silently continues on a different model mid-conversation. A provider error
// that is NOT a rate limit (e.g. a hallucinated tool call) is not retried on another backend — that
// failure mode isn't quota-related, so switching backends wouldn't fix it.
import type { AgentLoopParams, AgentLoopResult, CompletionParams, LLMProvider } from "./provider.js";
import { OpenAICompatibleProvider, isRateLimitError } from "./openaiCompatibleProvider.js";

export interface FallbackBackend {
  label: string;
  apiKey: string;
  model: string;
  baseURL: string;
}

export class FallbackProvider implements LLMProvider {
  readonly name = "groq" as const; // all current fallback backends speak the Groq-style wire format
  readonly model: string;
  private backends: OpenAICompatibleProvider[];
  private labels: string[];

  constructor(backends: FallbackBackend[]) {
    if (backends.length === 0) throw new Error("FallbackProvider requires at least one backend.");
    this.backends = backends.map((b) => new OpenAICompatibleProvider(b.apiKey, b.model, b.baseURL, b.label));
    this.labels = backends.map((b) => b.label);
    this.model = backends[0].model;
  }

  async runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
    let lastResult: AgentLoopResult | null = null;

    for (let i = 0; i < this.backends.length; i++) {
      const backend = this.backends[i];
      const isLast = i === this.backends.length - 1;
      params.onIteration?.(0, `using backend: ${this.labels[i]}`);

      const result = await backend.runAgentLoop(params);
      lastResult = result;

      // Fall through to the next backend for any genuine rate/quota error, at any point in the
      // loop — see the module comment for why re-running from scratch is the chosen tradeoff.
      const shouldFallBack = result.stoppedReason === "provider-error" && result.providerErrorWasRateLimit === true;
      if (!shouldFallBack || isLast) return result;

      params.onIteration?.(0, `${this.labels[i]} appears rate-limited; falling back to ${this.labels[i + 1]}...`);
    }

    // Unreachable given the loop above always returns on the last backend, but keeps TS satisfied.
    return lastResult!;
  }

  async complete(params: CompletionParams): Promise<string> {
    let lastErr: unknown = null;
    for (let i = 0; i < this.backends.length; i++) {
      try {
        return await this.backends[i].complete(params);
      } catch (err) {
        lastErr = err;
        if (!isRateLimitError(err) || i === this.backends.length - 1) {
          const message = err instanceof Error ? err.message : String(err);
          return `(${this.labels[i]} request failed: ${message})`;
        }
        // rate-limited and another backend is available — try it
      }
    }
    const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
    return `(All configured LLM backends failed: ${message})`;
  }
}
