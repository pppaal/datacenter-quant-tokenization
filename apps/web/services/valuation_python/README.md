# valuation_python

Python valuation engine for Korea data center underwriting inside `apps/web`.

## Purpose

- Run the quantitative underwriting model in Python
- Keep UI, API routes, persistence, and memo generation in the Next.js app
- Return JSON only; do not own product routing or persistence

## Invocation

The web app calls [`engine.py`](/c:/Users/pjyrh/OneDrive/Desktop/datacenter-quant-tokenization/apps/web/services/valuation_python/engine.py) via stdin/stdout.

Input: normalized JSON underwriting payload

Output: JSON valuation analysis with:

- `baseCaseValueKrw`
- `confidenceScore`
- `keyRisks`
- `ddChecklist`
- `assumptions`
- `scenarios`

## Runtime

- Default mode in the app is `auto`
- If Python is available, the web app can use this engine
- If Python is unavailable or errors, the TypeScript engine remains as fallback
