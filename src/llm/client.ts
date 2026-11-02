// Provider selection. CodeSage supports real LLM backends behind the same LLMProvider interface
// (provider.ts): Anthropic Claude, Groq, and OpenRouter (both OpenAI-compatible). No mocking: every
// path makes genuine HTTPS requests. isLLMConfigured() returns false when no key at all is set, and
// callers must handle that explicitly rather than faking a model response (see pipeline.ts's
// dry-run path).
//
// When more than one Groq/OpenRouter-style key is configured (GROQ_API_KEY, optionally a second
// GROQ_API_KEY_2, optionally OPENROUTER_API_KEY), they're combined into a FallbackProvider so a
// rate/quota limit on the first one automatically falls through to the next, instead of failing
// the whole investigation outright — see fallbackProvider.ts for exactly what "falls through"
// means (only an immediate, no-progress rate-limit; a later-stage failure still degrades normally).
import { AnthropicProvider } from "./anthropicProvider.js";
import { GroqProvider } from "./groqProvider.js";
import { FallbackProvider, type FallbackBackend } from "./fallbackProvider.js";
import type { LLMProvider } from "./provider.js";

// 6 was the original default; observed in practice (real Groq gpt-oss-120b runs against a genuine
// multi-file Node project) to sometimes exhaust its budget without reaching a structured verdict
// on a bug needing more than a couple of file reads — the same investigation succeeded reliably at
// 12. Raised the default accordingly; a few extra tool-call iterations is a cheap trade for a much
// higher first-try success rate instead of degrading to "inconclusive" and needing a manual rerun.
export const DEFAULT_MAX_ITERATIONS = Number(process.env.CODESAGE_MAX_ITERATIONS) || 12;

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-5-20250929",
  // GPT-OSS-120B is Groq-hosted, OpenAI-compatible, and supports real function/tool calling —
  // confirmed against this project's own agentic read_file/search_code loop (see
  // docs/ARCHITECTURE.md). Groq's lineup changes frequently; override with CODESAGE_MODEL if a
  // different Groq model is preferred.
  groq: "openai/gpt-oss-120b",
  // Verified against this account's real OpenRouter /models listing: there is no ":free" variant
  // of gpt-oss (that was a wrong assumption — OpenRouter's actual free tier is a different, smaller
  // curated model set, none of them gpt-oss). "openai/gpt-oss-20b" (no suffix) is real and does
  // exist, at a genuinely tiny cost (~$0.00000003/prompt token, ~$0.00000013/completion token) —
  // used only as a last-resort fallback when both Groq keys above are rate-limited.
  openrouter: "openai/gpt-oss-20b",
} as const;

export type ProviderKind = "anthropic" | "groq";

function resolveProviderKind(): ProviderKind | null {
  const forced = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (forced === "anthropic" || forced === "groq") return forced;

  const hasGroqStyle = Boolean(process.env.GROQ_API_KEY?.trim() || process.env.GROQ_API_KEY_2?.trim() || process.env.OPENROUTER_API_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  // Groq (or an OpenRouter fallback) wins when both are set and no explicit LLM_PROVIDER override
  // is given.
  if (hasGroqStyle) return "groq";
  if (hasAnthropic) return "anthropic";
  return null;
}

export function isLLMConfigured(): boolean {
  return resolveProviderKind() !== null;
}

/** Builds the ordered list of Groq/OpenRouter-style backends from whichever keys are actually
 * configured. The order is deliberate: primary Groq key first (fastest, most capable model),
 * secondary Groq key next (same model, separate quota), OpenRouter's free tier last (a resort, not
 * a first choice — free-tier routing is typically slower/less reliable). */
function buildGroqStyleBackends(): FallbackBackend[] {
  const model = process.env.CODESAGE_MODEL?.trim() || DEFAULT_MODELS.groq;
  const backends: FallbackBackend[] = [];

  const primary = process.env.GROQ_API_KEY?.trim();
  if (primary) backends.push({ label: "Groq (primary key)", apiKey: primary, model, baseURL: GROQ_BASE_URL });

  const secondary = process.env.GROQ_API_KEY_2?.trim();
  if (secondary) backends.push({ label: "Groq (secondary key)", apiKey: secondary, model, baseURL: GROQ_BASE_URL });

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    const openrouterModel = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODELS.openrouter;
    backends.push({ label: "OpenRouter (free tier)", apiKey: openrouterKey, model: openrouterModel, baseURL: OPENROUTER_BASE_URL });
  }

  return backends;
}

let cached: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  const kind = resolveProviderKind();
  if (!kind) {
    throw new Error(
      "No LLM provider configured. Set ANTHROPIC_API_KEY, GROQ_API_KEY, GROQ_API_KEY_2, or OPENROUTER_API_KEY in .env " +
        "(see .env.example), or run with --dry-run to use only the non-LLM stages (repo indexing + keyword search)."
    );
  }
  if (cached && cached.name === kind) return cached;

  if (kind === "groq") {
    const backends = buildGroqStyleBackends();
    cached = backends.length > 1 ? new FallbackProvider(backends) : new GroqProvider(backends[0].apiKey, backends[0].model, backends[0].label);
  } else {
    const model = process.env.CODESAGE_MODEL?.trim() || DEFAULT_MODELS.anthropic;
    cached = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!.trim(), model);
  }
  return cached;
}
