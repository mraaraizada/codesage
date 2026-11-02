// Anthropic Claude implementation of the provider-agnostic LLMProvider interface (provider.ts).
import Anthropic from "@anthropic-ai/sdk";
import type { AgentLoopParams, AgentLoopResult, CompletionParams, LLMProvider, ToolSpec } from "./provider.js";

function toAnthropicTools(tools: ToolSpec[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object",
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  }));
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;
  readonly model: string;
  private client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async runAgentLoop(params: AgentLoopParams): Promise<AgentLoopResult> {
    const { system, userMessage, tools, maxIterations, executeTool, onIteration } = params;
    const anthropicTools = toAnthropicTools(tools);
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
    const toolCallLog = [];
    let lastText = "";
    let iterationsUsed = 0;
    let stoppedReason: AgentLoopResult["stoppedReason"] = "max-iterations";

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      iterationsUsed = iteration;
      onIteration?.(iteration, `calling Claude (${this.model})`);
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system,
        tools: anthropicTools,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      lastText = textBlocks.map((b) => b.text).join("\n") || lastText;

      if (toolUses.length === 0) {
        stoppedReason = "concluded";
        break;
      }

      const toolResultContent: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        onIteration?.(iteration, `tool: ${tu.name}(${JSON.stringify(tu.input).slice(0, 80)})`);
        const { content, log } = executeTool(tu.name, tu.input as Record<string, unknown>);
        toolCallLog.push(log);
        toolResultContent.push({ type: "tool_result", tool_use_id: tu.id, content });
      }
      messages.push({ role: "user", content: toolResultContent });
    }

    return { finalText: lastText, toolCallLog, iterationsUsed, stoppedReason };
  }

  async complete(params: CompletionParams): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      messages: [{ role: "user", content: params.userMessage }],
    });
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
}
