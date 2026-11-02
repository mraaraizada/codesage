# Productothon 01 — Submission

## Product name
**CodeSage — Intelligent code understanding and debugging**

## Category / problem statement
Challenge 01: AI Software Engineer — build an AI agent that can inspect an existing codebase,
investigate a reported bug, identify the likely root cause, propose a code patch with
explanation, run tests, and report evidence (root cause, affected files, diff, test results,
verification status).

## Problem
Most "AI coding assistants" answer bug reports the way a chatbot answers any question: by
pattern-matching on the prompt and generating plausible-looking code. They don't actually read the
repository they're talking about, don't cite real evidence for their claims, and never check
whether their fix actually works — so "I fixed it" is just a sentence, not a verified fact. That
gap is dangerous precisely where it matters most: debugging, where a wrong but confident answer
costs more time than no answer at all.

## Solution
CodeSage is an evidence-driven, verification-first debugging agent:

- It performs **real static analysis** of the target repository (file walk, `.gitignore`-aware,
  symbol extraction) before any LLM is involved.
- It investigates bugs using a **genuine agentic tool-use loop** — the model must call real
  `read_file` / `search_code` tools against the actual repo and cite `file:line` evidence; it
  cannot hallucinate contents it never read.
- It proposes a **concrete unified diff**, applies it in an **isolated workspace copy** (the
  original repo is never touched), and runs the project's **real test suite before and after** the
  patch.
- It reports a **verification status computed from real test exit codes** —
  `verified-fixed` / `tests-still-failing` / `patch-did-not-apply` / `no-tests-detected` /
  `inconclusive` — never an LLM's self-assessment.
- It ships as a **working browser application** (React + Vite + Tailwind frontend, Express
  backend) with a secondary CLI over the identical pipeline.

## Key features
1. Real repository indexer with `.gitignore` handling and regex-based symbol extraction (JS/TS/Python).
2. Ripgrep-style keyword search (pure Node `fs` + regex) used to seed the investigation with real candidates.
3. Agentic Claude investigation loop with two real tools (`read_file`, `search_code`), path-traversal-guarded, max-iteration-bounded.
4. Concrete unified-diff patch generation, applied via `git apply` with a `diff`-package fallback.
5. Isolated, never-mutates-the-original workspace (fresh local git repo per run).
6. Before/after test execution with real subprocess capture, ANSI-stripped output, pass/fail parsing, timeout + full process-tree kill (a real Windows-specific bug found and fixed while building this).
7. Structured Markdown + JSON engineering report, downloadable from the UI.
8. A working browser UI with a live stage tracker, colorized diff viewer, and before/after test cards — not a static mockup.
9. A deliberately buggy demo fixture (`examples/buggy-react-login`) with a real failing test, verified by hand to flip to passing once CodeSage's fix is applied.
10. Honest, explicit sandboxing-limits disclosure in the UI and docs — no overclaiming "perfect isolation."

## Tech stack
- **Core pipeline / CLI:** Node.js, TypeScript (NodeNext ESM), `@anthropic-ai/sdk`, `commander`, `chalk`, `ora`, `ignore`, `diff`.
- **Backend:** Express, in-memory job store, CORS, dotenv.
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4.
- **Testing:** Vitest (both for CodeSage itself and for the demo fixture's own React tests via `@testing-library/react` + jsdom).
- **Demo fixture:** React, a stale-closure state bug, Vitest + Testing Library.

## Repo link
`<placeholder — fill in with the submitted repository URL>`

## Demo instructions
```bash
cd CodeSage
cp .env.example .env            # set ANTHROPIC_API_KEY for the live LLM run (optional but recommended)
npm install && npm run build
(cd server && npm install)
(cd web && npm install)
(cd examples/buggy-react-login && npm install)

bash scripts/demo.sh            # starts the API server + web UI together
# open http://localhost:5173, click "Load demo (buggy-react-login)", click "Investigate"
```
Non-interactive / no-browser alternative:
```bash
bash scripts/demo-cli.sh
```

## Pitch notes
- Lead with the differentiator, not the model: "most AI coding tools are chatbots with a code
  font; CodeSage is the first one that proves its own fix."
- Show the stage tracker live — the fact that it's genuinely waiting on real subprocess output
  (not a canned animation) is the whole point; let a judge see the "before" test fail on screen,
  then watch the exact same test pass after the patch.
- If no API key is available at demo time, lead with `--dry-run` / the UI's dry-run checkbox to
  show the real indexing + search are not an illusion, then show the pre-recorded
  `docs/ARCHITECTURE.md` "verified before/after" transcript as proof the full loop was already run
  end-to-end against this exact fixture.
- Close on the honesty section: a debugging tool that lies about its own guarantees is worse than
  useless. CodeSage's limitations section is a feature, not a disclaimer.

## Team
`<placeholder — add team member names / roles>`
