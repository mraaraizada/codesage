// Generic OpenAI-compatible Chat Completions backend (Groq, OpenRouter, or any other provider
// that speaks the same wire format). Extracted from what was originally Groq-specific logic so the
// exact same agentic read_file/search_code loop can run against multiple interchangeable backends
// — see fallbackProvider.ts, which is what actually picks between several of these when one hits a
// rate limit.
import OpenAI from "openai";
import type { AgentLoopParams, AgentLoopResult, CompletionParams, ToolSpec } from "./provider.js";

function toOpenAITools(tools: ToolSpec[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: t.parameters.properties,
        required: t.parameters.required ?? [],
      },
    },
  }));
}

export class OpenAICompatibleProvider {
  readonly model: string;
  readonly label: string;
  private client: OpenAI;

  constructor(apiKey: string, model: string, baseURL: string, label: string) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
    this.label = label;
  }

  async runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
    const { system, userMessage, tools, maxIterations, executeTool, onIteration } = params;
    const openaiTools = toOpenAITools(tools);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ];
    const toolCallLog: AgentLoopResult["toolCallLog"] = [];
    let lastText = "";
    let iterationsUsed = 0;
    let stoppedReason: AgentLoopResult["stoppedReason"] = "max-iterations";
    let providerErrorWasRateLimit = false;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      iterationsUsed = iteration;
      onIteration?.(iteration, `calling ${this.label} (${this.model})`);

      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: 4096,
          messages,
          tools: openaiTools,
          tool_choice: "auto",
        });
      } catch (err) {
        // Two distinct, real failure modes land here, and the message must not conflate them:
        // (1) gpt-oss models (Harmony format) occasionally hallucinate a call to one of their own
        //     built-in reasoning-channel tools (observed: "exec") that was never declared in
        //     `tools` above — the API rejects the whole completion with a 400 ("Tool call
        //     validation failed...") in that case.
        // (2) a genuine account-level 429 rate/quota limit (daily token cap, requests-per-minute,
        //     etc.) — nothing to do with tool-calling at all, and mislabeling it as a tool-call
        //     problem sends the user chasing the wrong fix. `isRateLimitError` (below) is what lets
        //     fallbackProvider.ts decide whether switching to a different backend is even worth
        //     trying. Either way there is no assistant message to recover from, only the error —
        //     end the loop gracefully with whatever real evidence/text was already gathered, rather
        //     than crashing the whole pipeline.
        const message = err instanceof Error ? err.message : String(err);
        const rateLimited = isRateLimitError(err);
        providerErrorWasRateLimit = rateLimited;
        const label = rateLimited ? `${this.label} rate/quota limit reached` : `${this.label} rejected the request (possibly an undeclared tool call)`;
        onIteration?.(iteration, `${label}: ${message}`);
        stoppedReason = "provider-error";
        break;
      }

      const message = response.choices[0]?.message;
      if (!message) {
        stoppedReason = "provider-error";
        break;
      }

      // gpt-oss's Harmony format returns chain-of-thought in a separate `reasoning` field (not
      // part of the OpenAI type) alongside `content` — neither is the structured verdict unless
      // there are no further tool calls, handled below.
      if (typeof message.content === "string" && message.content.trim()) {
        lastText = message.content;
      }

      messages.push(message as OpenAI.Chat.Completions.ChatCompletionMessageParam);

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        stoppedReason = "concluded";
        break;
      }

      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          input = {};
        }
        onIteration?.(iteration, `tool: ${tc.function.name}(${tc.function.arguments.slice(0, 80)})`);
        const { content, log } = executeTool(tc.function.name, input);
        toolCallLog.push(log);
        messages.push({ role: "tool", tool_call_id: tc.id, content });
      }
    }

    return { finalText: lastText, toolCallLog, iterationsUsed, stoppedReason, providerErrorWasRateLimit };
  }

  async complete(params: CompletionParams): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.userMessage },
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  }
}

/** True for a genuine rate/quota-limit rejection (HTTP 429, or a message that says so) — as
 * opposed to a 400 tool-call-validation failure, which is a different problem that switching
 * backends can't fix. Exported so fallbackProvider.ts can decide whether trying the next
 * configured backend is actually worth it. */
export function isRateLimitError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /\b429\b/.test(message) || /rate.?limit/i.test(message) || /quota/i.test(message);
}
