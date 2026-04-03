# AGENTS

## Active App Root

- `apps/web` is the only active product root.

## Install / Build / Test

```bash
cd apps/web
npm install
npm run prisma:generate
npm run typecheck
npm test
npm run build
npm run e2e
```

## Guardrails

- Do not touch legacy apps under `legacy/`.
- Preserve the institutional Korean real-estate investment-firm positioning.
- Keep the blockchain design registry-only: anchor ids, hashes, and packet metadata only.
- Do not add retail token sale flows, wallet onboarding, consumer trading UX, or investment advice.

## Definition Of Done

- Evidence capture, review, valuation, reports, deal execution, portfolio ops, and capital shell flows work inside `apps/web`.
- New normalized evidence is review-gated before promotion into curated feature snapshots.
- Valuation/report/readiness outputs stay offchain and use approved evidence first.
- Tests, typecheck, and build pass before closing work.
- Browser smoke coverage should pass when a seeded local database is available.
