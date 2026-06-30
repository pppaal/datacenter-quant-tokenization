import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import nextPlugin from '@next/eslint-plugin-next';
import prettierConfig from 'eslint-config-prettier';

/**
 * Minimal ESLint flat config for apps/web.
 *
 * Goals:
 *   1. catch dead/typo'd identifiers (no-unused-vars, no-undef via TS)
 *   2. catch obvious correctness bugs (no-floating-promises, no-misused-promises)
 *   3. surface implicit `any` regressions
 *   4. stay quiet on stylistic issues (Prettier owns formatting)
 *
 * Add stricter rules incrementally. The `legacy/`, `build/`, and Prisma
 * generated directories are ignored to keep the initial signal high.
 */
export default [
  {
    ignores: [
      'build/**',
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'prisma/migrations/**',
      'tsconfig.typecheck.tsbuildinfo'
    ]
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      '@next/next': nextPlugin
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...prettierConfig.rules,
      // no-explicit-any ratchet. The codebase uses `as any` / `as unknown as X`
      // defensively for Prisma input casts, so a global `error` would block CI on
      // pre-existing debt. Instead this is a *warn* (visible in `lint` output,
      // does NOT fail the zero-ERROR CI gate) so NO NEW unflagged `any` slips in
      // unnoticed, while a scoped `error`-level override below hard-blocks new
      // `any` in already-clean directories (`lib/blockchain/**`). Tighten the
      // scoped allowlist outward (or flip the global to `error`) as directories
      // are cleaned — that is the ratchet. See CLAUDE.md "no-explicit-any".
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
      // Empty error blocks are intentional for fire-and-forget paths.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Allow `_var` and intentionally-discarded args.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      // The Next.js generated middleware export is OK as a side-effect import.
      '@next/next/no-html-link-for-pages': 'off'
    }
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'prisma/seed.ts'],
    rules: {
      // Scripts and tests routinely log; relax rules that fight that.
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  // ---------------------------------------------------------------------------
  // no-explicit-any ratchet — clean-subset hard gate.
  //
  // `@typescript-eslint/no-explicit-any` is a global `warn` (above) because the
  // wider codebase still carries defensive `as any` Prisma casts. This block
  // promotes it to `error` for the highest-consequence trees, each verified
  // `any`-free today:
  //   - `lib/blockchain/**` — the on-chain registry / ERC-3643 tokenization stack.
  //   - `lib/security/**`   — the auth / edge-protection / admin-API gate. Its
  //     one justified `any` (the Next.js route-context validator in
  //     with-admin-api.ts) is suppressed inline, so any NEW `any` here fails CI.
  // Extend this `files` glob to additional already-clean directories as the
  // ratchet tightens.
  // ---------------------------------------------------------------------------
  {
    files: ['lib/blockchain/**/*.ts', 'lib/security/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  // ---------------------------------------------------------------------------
  // env() adoption ratchet (CLAUDE.md "Env" convention).
  //
  // Ban raw `process.env` access inside `lib/**` so new service/security/
  // blockchain/observability code is forced through the typed, zod-validated
  // `env()` loader (`lib/env.ts`). The ban is intentionally scoped to `lib/**`
  // only — it does NOT cover:
  //   - `lib/env.ts` itself (the loader has to read `process.env`),
  //   - `app/**` route handlers, `middleware.ts`, `instrumentation*.ts`
  //     (Edge/instrumentation runtimes where `env()` may not be importable),
  //   - `scripts/**` and `tests/**` (build/CI tooling + test env injection).
  // Those are simply never matched by the `files: ['lib/**/*.ts']` selector
  // below, so they stay free of the rule.
  {
    files: ['lib/**/*.ts'],
    ignores: ['lib/env.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
          message:
            "Read environment variables via env() from '@/lib/env' instead of process.env. " +
            'Add the key to the zod schema in lib/env.ts if it is missing.'
        },
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']:not(MemberExpression > MemberExpression)",
          message:
            "Read environment variables via env() from '@/lib/env' instead of process.env. " +
            'Add the key to the zod schema in lib/env.ts if it is missing.'
        }
      ]
    }
  },
  // Tolerated-existing allowlist: lib files that still read raw `process.env`
  // and were NOT migrated to env(). Each remaining entry is left as-is because
  // it either (a) reads bespoke per-source domain keys not worth schematizing
  // yet (data connectors / source adapters), (b) uses a `process.env` injection
  // seam as a default parameter for test fakes — e.g.
  // `getSanctionsProvider(env = process.env)`, `getAdminAuthConfig`,
  // `getAdminSsoConfig`, `getDocumentUploadPolicy`, the currency/ops-alerts/
  // ops-worker/audit/readiness helpers — flipping these to env() would break the
  // tests that inject a fake env, (c) does dynamic `process.env[name]` access the
  // loader can't model (e.g. `lib/ai/models.ts`, `lib/services/sources.ts`),
  // (d) passes the whole `process.env` to a child process
  // (`lib/services/python-valuation.ts`), or (e) runs in a context where coupling
  // to the full-schema `env()` parse is undesirable (logger, edge-protection,
  // prisma bootstrap). NEW raw `process.env` in any OTHER `lib/**` file still
  // fails CI via the rule above; trimming this list as files migrate is the
  // ratchet.
  //
  // Migrated to env() in the conventions burn-down (removed from this list):
  //   lib/blockchain/config.ts, lib/security/rate-limit.ts,
  //   lib/storage/local.ts, lib/services/onchain/ipfs.ts,
  //   lib/services/kyc/registry.ts, lib/services/valuation-runner.ts,
  //   lib/services/source-refresh.ts, lib/services/macro/data-providers.ts,
  //   lib/services/research/research-tools.ts,
  //   lib/services/dc-intel/{openaq,overpass-poi,peeringdb,thinkhazard}.ts,
  //   lib/services/quarterly-report/connectors/{dart,dart-financials,ecos,
  //   molit-transactions}.ts.
  {
    files: [
      'lib/ai/models.ts',
      'lib/blockchain/mock-mode.ts',
      'lib/db/prisma.ts',
      'lib/finance/currency.ts',
      'lib/ingest/korea-kosis-adapter.ts',
      'lib/ingest/korea-reb-adapter.ts',
      'lib/observability/logger.ts',
      'lib/runtime-env.ts',
      'lib/security/admin-auth.ts',
      'lib/security/admin-identity.ts',
      'lib/security/admin-scim.ts',
      'lib/security/admin-session.ts',
      'lib/security/admin-sso.ts',
      'lib/security/investor-token.ts',
      'lib/security/edge-protection.ts',
      'lib/security/upload-policy.ts',
      'lib/services/aml/screening.ts',
      'lib/services/audit.ts',
      'lib/services/geocode/kakao-geocode.ts',
      'lib/services/geocode/osm-geocode.ts',
      'lib/services/ops-alerts.ts',
      'lib/services/ops-queue.ts',
      'lib/services/ops-worker.ts',
      'lib/services/public-data/live/kepco-grid.ts',
      'lib/services/public-data/live/kosis-macro.ts',
      'lib/services/public-data/live/molit-building.ts',
      'lib/services/public-data/live/rone-rent.ts',
      'lib/services/public-data/live/rtms.ts',
      'lib/services/public-data/live/vworld-land-price.ts',
      'lib/services/public-data/live/vworld-use-zone.ts',
      'lib/services/public-data/registry.ts',
      'lib/services/python-valuation.ts',
      'lib/services/readiness.ts',
      'lib/services/sources.ts',
      'lib/sources/adapters/building.ts',
      'lib/sources/adapters/climate.ts',
      'lib/sources/adapters/cross-market.ts',
      'lib/sources/adapters/dbnomics.ts',
      'lib/sources/adapters/energy.ts',
      'lib/sources/adapters/fx.ts',
      'lib/sources/adapters/geospatial.ts',
      'lib/sources/adapters/hrfco-flood.ts',
      'lib/sources/adapters/kepco-dg-interconnect.ts',
      'lib/sources/adapters/kofia-bond-yields.ts',
      'lib/sources/adapters/korea-public.ts',
      'lib/sources/adapters/kpx-smp.ts',
      'lib/sources/adapters/macro.ts',
      'lib/sources/adapters/market.ts',
      'lib/sources/adapters/power-grid.ts',
      'lib/sources/adapters/world-bank.ts',
      'lib/sources/http.ts'
    ],
    rules: {
      'no-restricted-syntax': 'off'
    }
  }
];
