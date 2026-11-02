# CodeSage Architecture

## The 7-step workflow

CodeSage's `runPipeline()` (`src/pipeline.ts`) implements the same seven steps regardless of
whether it's driven by the web UI or the CLI:

1. **Connect repo** — `repo/resolveSource.ts` resolves a local path as-is, or `git clone
   --depth 1`s a git URL into a temp directory. `server/src/jobs.ts` and `src/cli.ts` both call
   this before handing a local path to the pipeline.
2. **Understand codebase** — `repo/indexer.ts` walks the real file tree (respecting `.gitignore`
   via the `ignore` package plus default excludes like `node_modules`/`.git`/`dist`), records real
   file sizes, and runs `repo/symbols.ts` (regex-based static analysis — no LLM involved) to
   extract top-level functions/classes/methods with real line numbers for JS/TS/Python files.
   `repo/stack.ts` detects the project's stack and real test command from `package.json` /
   `pytest.ini` / `pyproject.toml` / `requirements.txt`.
3. **Bug report** — the user supplies natural-language text (web form or `--bug` flag).
4. **Investigation** — `search/grep.ts` extracts keywords from the bug report and greps the
   indexed files (plain Node `fs` + regex, scored and ranked — no shelling out to a `rg` binary).
   `llm/investigate.ts` then runs a genuine multi-turn tool-use loop against whichever
   `LLMProvider` is configured (`llm/client.ts` picks Anthropic Claude or Groq — see "LLM
   providers" below): the model is given the bug report, the stack summary, and the top search
   hits, and must call `read_file` / `search_code` (real fs reads / real greps, implemented in
   `llm/tools.ts` and path-traversal-guarded) to gather `file:line` evidence before it's allowed
   to conclude. It stops after a final JSON verdict or after `CODESAGE_MAX_ITERATIONS` (default
   6) turns.
5. **Proposed fix** — `llm/patch.ts` reads the *actual current bytes* of the files the
   investigation flagged (from the isolated workspace, not from memory) and asks the same
   provider for a concrete unified diff. `patch/apply.ts` applies it for real: first via
   `git apply` inside the workspace's fresh git repo, falling back to the `diff` npm package's
   text-based `applyPatch`
   if `git apply`'s stricter context matching rejects it. Both are real patch engines; a failure
   is reported as `patch-did-not-apply`, never silently skipped.
6. **Test execution** — `workspace/isolate.ts` creates the isolated copy (see below),
   `testRunner/install.ts` ensures dependencies are present, and `testRunner/run.ts` runs the
   project's real test command via `child_process.spawn`, once **before** the patch and once
   **after**, capturing real stdout/stderr/exit codes under a hard timeout.
7. **Final report** — `pipeline.ts`'s `decideVerification()` computes a `VerificationStatus` purely
   from the before/after exit codes (never from an LLM's opinion), and `report/generate.ts` renders
   both a Markdown and a JSON report with problem summary, root cause + evidence, the diff, test
   results, verification status, and an honest limitations section.

## Module map

```
src/
  types.ts                 shared types for the whole pipeline
  pipeline.ts               the single orchestrator (used by both CLI and server)
  cli.ts                    CLI entrypoint (commander + chalk + ora)
  repo/
    indexer.ts               file walk, .gitignore handling, size/line counts
    symbols.ts                regex-based symbol extraction (JS/TS/Python)
    stack.ts                  stack + test-command detection, shared by indexer and pipeline
    resolveSource.ts          local path vs. git-URL resolution (real `git clone`)
  search/
    grep.ts                   keyword extraction + ripgrep-style scored search
  llm/
    provider.ts                provider-agnostic contracts (ToolSpec, AgentLoopParams/Result)
    client.ts                  picks Anthropic or Groq from env (no mocking; throws clearly if neither key is set)
    anthropicProvider.ts        Claude Messages API implementation of LLMProvider
    groqProvider.ts             Groq (OpenAI-compatible Chat Completions) implementation of LLMProvider
    tools.ts                  real read_file / search_code tool implementations
    investigate.ts            the agentic tool-use loop
    patch.ts                  unified-diff patch generation
  workspace/
    isolate.ts                 isolated workspace copy + fresh local git repo
  patch/
    apply.ts                   git-apply primary path, diff-package fallback
  testRunner/
    install.ts                 dependency install (real npm/pip install if needed)
    run.ts                      real subprocess execution, ANSI stripping, pass/fail parsing,
                                 timeout + Windows process-tree kill
  report/
    generate.ts                 Markdown + JSON report rendering

server/
  src/jobs.ts                   in-memory job store; calls runPipeline(), nothing else
  src/index.ts                   Express routes (POST /api/jobs, GET /api/jobs/:id, ...)

web/
  src/App.tsx                    the investigation console shell (sidebar / main pane / effects panel / status bar)
  src/hooks/useInvestigationRuns.ts   persisted run list (localStorage) + job polling
  src/components/console/        LeftSidebar, MainPane, VerdictBlock, RootCausePanel, StageList, EffectsPanel, StatusBar
  src/components/ui/             ported OpenBot primitives + code-block.tsx (real Prism syntax highlighting), tooltip.tsx, toast.tsx
```

## LLM providers

`src/llm/client.ts` auto-detects the provider from environment variables: `GROQ_API_KEY` wins if
both it and `ANTHROPIC_API_KEY` are set, overridable with `LLM_PROVIDER=anthropic|groq`. Both
implementations satisfy the same `LLMProvider` interface (`src/llm/provider.ts`), so
`investigate.ts` and `patch.ts` never import either SDK directly.

**Groq model choice:** `openai/gpt-oss-120b`, queried directly against this account's
`GET /v1/models` (the available set changes) and confirmed via a real `tool_choice: "auto"` call
to actually emit `tool_calls` before being wired in. It completes the full investigate → patch →
test → verify pipeline correctly, but is noticeably less reliable than Claude at unified-diff
*bookkeeping*: across real runs it repeatedly emitted a bare `@@` hunk header with no line-number
ranges, and once a syntactically valid header with miscounted ranges and a wrong start line —
while the actual `+`/`-` edit was semantically correct every time. `patch/apply.ts`'s
`repairHunkHeaders()` now unconditionally recomputes every hunk's header from the body's real
`+`/`-`/context lines and the actual current file content in the workspace, before either `git
apply` or the diff-package fallback runs — this fixed the Groq path and is a strict improvement
for any provider's diff output. See `tests/apply.test.ts`'s "repairs a bare '@@' hunk header..."
case, written directly from a real Groq response.

## Sandboxing limits (read before claiming "it's sandboxed")

CodeSage's isolation guarantee is specific and real, not a general-purpose sandbox claim:

- **What it does guarantee:** the user's original repository is never written to. Every patch
  attempt and every test run happens in a filesystem copy under the OS temp directory
  (`workspace/isolate.ts`), with its own fresh local git repo (used only as a reliable diff/apply
  and diffing engine — `core.autocrlf`/`core.safecrlf` are forced off so patch application is
  byte-deterministic regardless of the host's global git config).
- **What it does *not* guarantee:**
  - **Network isolation.** Test subprocesses run with the same network access as CodeSage itself.
    Dependency installation (`testRunner/install.ts`) explicitly requires real network access
    unless `node_modules`/vendored dependencies were already present in the source repo (in which
    case they're copied into the workspace and no install is needed — this is how the bundled
    demo fixture runs offline).
  - **CPU/memory limits or syscall restrictions.** There's no container, VM, or seccomp profile.
  - **Process-tree isolation beyond what's needed for the timeout.** `testRunner/run.ts` enforces
    a wall-clock timeout per test run and kills the whole process tree on timeout (`taskkill /T`
    on Windows, process-group `SIGKILL` on POSIX) — this is a time limit, not a security boundary.
- `node_modules` is copied onto disk for the isolated workspace (so tests don't need a
  network-dependent reinstall) but is **excluded from the workspace's git tracking** via a
  workspace-local `.gitignore` entry, so a test run's cache writes under `node_modules` never get
  conflated with the actual source-code diff in `git diff --name-only`.

## Verified before/after behavior

While building this project, the full isolate → install → run-tests-before → apply-patch →
run-tests-after chain was first exercised directly against the real `examples/buggy-react-login`
fixture, bypassing only the two LLM API calls (no key was available in that environment):

```
BEFORE patch -> exit: 1   passed: 1  failed: 1   ("Tests  1 failed | 1 passed (2)")
AFTER  patch -> exit: 0   passed: 2  failed: 0   ("Tests  2 passed (2)")
Verification: verified-fixed
```

That was later reconfirmed end-to-end with a real `GROQ_API_KEY` and no manual diff substitution:
Groq's `openai/gpt-oss-120b` investigated the same fixture, correctly identified the stale-closure
root cause with `src/Login.jsx` evidence, proposed a diff, which `patch/apply.ts` applied (via its
hunk-header repair, see "LLM providers" above), and the before/after test run flipped exit 1 → 0
exactly as above — verified live through the browser console, not just the API.

This confirms the real patch-application and real test-execution machinery works end to end
against the bundled fixture; when `ANTHROPIC_API_KEY` is set, the exact same code path runs with
Claude's investigation and patch in place of the manually-supplied diff.
