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
```

## Guardrails

- Do not touch legacy apps under `legacy/`.
- Preserve the institutional Korean data-center underwriting positioning.
- Keep the blockchain design registry-only: anchor ids, hashes, and packet metadata only.
- Do not add retail token sale flows, wallet onboarding, consumer trading UX, or investment advice.

## Definition Of Done

- Evidence capture, review, valuation, reports, and readiness flows work inside `apps/web`.
- New normalized evidence is review-gated before promotion into curated feature snapshots.
- Valuation/report/readiness outputs stay offchain and use approved evidence first.
- Tests, typecheck, and build pass before closing work.
