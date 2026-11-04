// Settings: the one real, useful action here is updating a Groq/OpenRouter/Anthropic API key —
// writes it to the project's .env file via POST /api/settings/api-key (server/src/index.ts), which
// also resets the server's cached provider so the new key takes effect immediately, no restart
// needed. Shows which keys are already configured (masked) so the user knows what they're
// overwriting, and nothing else.
import { useEffect, useState } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { apiUrl } from "@/lib/apiBase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface ProviderStatus {
  label: string;
  configured: boolean;
  active: boolean;
  model: string | null;
  maskedKey: string | null;
}

const ENV_VAR_OPTIONS: { envVar: string; label: string }[] = [
  { envVar: "GROQ_API_KEY", label: "Groq (primary key)" },
  { envVar: "GROQ_API_KEY_2", label: "Groq (secondary key)" },
  { envVar: "OPENROUTER_API_KEY", label: "OpenRouter (fallback)" },
  { envVar: "ANTHROPIC_API_KEY", label: "Anthropic Claude" },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [providers, setProviders] = useState<ProviderStatus[] | null>(null);
  const [envVar, setEnvVar] = useState(ENV_VAR_OPTIONS[0].envVar);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  function loadProviders() {
    fetch(apiUrl("/api/settings"))
      .then((res) => res.json())
      .then((body) => setProviders(body.providers ?? null))
      .catch(() => setProviders(null));
  }

  useEffect(() => {
    loadProviders();
  }, []);

  async function handleSave() {
    if (!apiKey.trim()) {
      setMessage({ text: "Enter an API key first.", isError: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl("/api/settings/api-key"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envVar, apiKey: apiKey.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to update key.");
      setMessage({ text: "Key updated and applied — no restart needed.", isError: false });
      setApiKey("");
      setProviders(body.providers ?? null);
    } catch (err) {
      setMessage({ text: (err as Error).message, isError: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold">Settings</span>
          <button type="button" onClick={onClose} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <IconX className="size-4" stroke={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Update API key</p>

          <div className="mt-3 flex flex-col gap-2">
            {(providers ?? ENV_VAR_OPTIONS.map((o) => ({ label: o.label, configured: false, active: false, model: null, maskedKey: null }))).map((p) => (
              <div key={p.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                {p.configured ? <IconCheck className="size-3.5 shrink-0 text-success" stroke={2} /> : <IconX className="size-3.5 shrink-0 text-muted-foreground/40" stroke={2} />}
                <span>{p.label}</span>
                {p.configured && <span className="font-mono">…{p.maskedKey?.slice(-4)}</span>}
                {p.active && <span className="text-brand">(in use)</span>}
              </div>
            ))}
          </div>

          <FieldGroup className="mt-5">
            <Field>
              <FieldLabel htmlFor="settings-env-var">Which key</FieldLabel>
              <select
                id="settings-env-var"
                value={envVar}
                onChange={(e) => setEnvVar(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {ENV_VAR_OPTIONS.map((o) => (
                  <option key={o.envVar} value={o.envVar}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-api-key">New API key value</FieldLabel>
              <Input
                id="settings-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste the new key here"
                className="font-mono text-sm"
                autoComplete="off"
              />
            </Field>
          </FieldGroup>

          {message && <p className={cn("mt-3 text-sm", message.isError ? "text-destructive" : "text-success")}>{message.text}</p>}

          <Button type="button" variant="brand" className="mt-4 w-full justify-center" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save key"}
          </Button>
        </div>
      </div>
    </div>
  );
}
