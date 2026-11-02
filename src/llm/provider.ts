// Provider-agnostic contracts for the LLM reasoning steps. `investigate.ts` and `patch.ts` code
// against this interface only — they never import `@anthropic-ai/sdk` or `openai` directly, so
// either Claude (Anthropic Messages API) or Groq (OpenAI-compatible Chat Completions API, used
// for its fast open-weight tool-calling models) can drive the exact same agentic tool-use loop.
import type { ToolCallLogEntry } from "../types.js";

/** A tool definition in plain JSON-Schema form — each provider adapter maps this into its own
 * wire format (Anthropic's `input_schema`, OpenAI's `function.parameters`). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentLoopParams {
  system: string;
  userMessage: string;
  tools: ToolSpec[];
  maxIterations: number;
  executeTool: (name: string, input: Record<string, unknown>) => { content: string; log: ToolCallLogEntry };
  onIteration?: (n: number, note: string) => void;
}

export interface AgentLoopResult {
  finalText: string;
  toolCallLog: ToolCallLogEntry[];
  iterationsUsed: number;
  /** Why the loop actually stopped — lets investigate.ts give an honest, specific reason instead
   * of one generic "did not return a structured verdict" message for every failure shape:
   * - "concluded": the model stopped calling tools on its own (the normal, intended path).
   * - "max-iterations": the budget ran out while the model was still calling tools — it may have
   *   been close to a real answer, or stuck in a loop; raising the budget is the right lever.
   * - "provider-error": the API itself rejected a request mid-loop (e.g. a hallucinated tool call
   *   Groq's gpt-oss models occasionally emit) — see groqProvider.ts's try/catch.
   */
  stoppedReason: "concluded" | "max-iterations" | "provider-error";
  /** Only meaningful when `stoppedReason === "provider-error"`: true for a genuine rate/quota
   * rejection (HTTP 429, daily token cap, etc.), false for something else (e.g. a 400 from a
   * hallucinated tool call). fallbackProvider.ts uses this to decide whether switching to a
   * different backend is actually worth trying — only a rate limit is something a different
   * backend's own separate quota can route around. */
  providerErrorWasRateLimit?: boolean;
}

export interface CompletionParams {
  system: string;
  userMessage: string;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: "anthropic" | "groq";
  readonly model: string;
  /** Runs a genuine multi-turn tool-use loop: the model is given `tools` and must call them
   * (executed for real via `executeTool`) across up to `maxIterations` turns before it may answer
   * with plain text. */
  runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult>;
  /** A single-shot completion with no tools — used for patch generation, where the model already
   * has everything it needs in the prompt. */
  complete(params: CompletionParams): Promise<string>;
}
