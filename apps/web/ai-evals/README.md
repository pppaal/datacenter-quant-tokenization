# AI evals (Promptfoo)

Prompt-regression / output-contract evals for the AI underwriting + research
assistant (`lib/services/ai-assistant.ts`), using
[Promptfoo](https://promptfoo.dev) (open source).

## What it checks

Runs the **real system prompts** (`research-summary`, `deal-score`) against sample
inputs and asserts each response:

- is valid JSON (the assistant uses OpenAI `response_format: json_object`),
- honors the **output-shape contract** the parsers enforce
  (`parseResearchSummary` / `parseDealScore` — non-empty `summary` + `bullets[]`;
  or `score` 0-100 + non-empty `reasoning`),
- contains **no retail-offering / return-guarantee language** (the system-prompt rule).

These are the same invariants unit-tested key-free in
`tests/ai-assistant-parse.test.ts`; this harness additionally exercises the **live
model** so a prompt edit that regresses format/groundedness is caught before ship.

## Run

```bash
export OPENAI_API_KEY=sk-...        # required — calls the live model
npm run ai:eval                      # promptfoo eval -c ai-evals/promptfooconfig.yaml
npx promptfoo@latest view            # optional: open the result UI
```

## Why it is NOT a CI gate

CI runs without a model API key (the platform ships deterministic mock data; see
`docs/DATA_KEYS.md`). So this is a **local / keyed-environment** gate, run before
changing a prompt — not a blocking CI job. Add `OPENAI_API_KEY` as a CI secret and
wire `npm run ai:eval` into a workflow if/when you want it gating.

## Extend

Add cases under `tests:` (more snapshot/deal shapes, adversarial inputs), and add
`llm-rubric` assertions for groundedness/tone once a labeled set exists.
