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
      // The codebase uses `as any` / `as unknown as X` defensively for Prisma
      // input casts; tighten progressively once the typed input builders
      // mentioned in CLAUDE.md land.
      '@typescript-eslint/no-explicit-any': 'off',
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
  // and were NOT migrated in the conventions-adoption pass. Each is left as-is
  // because it either (a) reads dozens of bespoke domain keys not worth adding
  // to the schema yet (data connectors / source adapters), (b) uses a
  // `process.env` injection seam as a default parameter for test fakes
  // (e.g. `getSanctionsProvider(env = process.env)`), (c) does dynamic
  // `process.env[name]` access the loader can't model, or (d) runs in a context
  // where coupling to the full-schema `env()` parse is undesirable (logger,
  // edge-protection, prisma bootstrap). NEW raw `process.env` in any OTHER
  // `lib/**` file still fails CI via the rule above; trimming this list as
  // files migrate is the ratchet.
  {
    files: [
      'lib/ai/models.ts',
      'lib/blockchain/config.ts',
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
      'lib/security/edge-protection.ts',
      'lib/security/rate-limit.ts',
      'lib/security/upload-policy.ts',
      'lib/services/aml/screening.ts',
      'lib/services/audit.ts',
      'lib/services/dc-intel/openaq.ts',
      'lib/services/dc-intel/overpass-poi.ts',
      'lib/services/dc-intel/peeringdb.ts',
      'lib/services/dc-intel/thinkhazard.ts',
      'lib/services/geocode/kakao-geocode.ts',
      'lib/services/geocode/osm-geocode.ts',
      'lib/services/kyc/registry.ts',
      'lib/services/macro/data-providers.ts',
      'lib/services/onchain/ipfs.ts',
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
      'lib/services/quarterly-report/connectors/dart-financials.ts',
      'lib/services/quarterly-report/connectors/dart.ts',
      'lib/services/quarterly-report/connectors/ecos.ts',
      'lib/services/quarterly-report/connectors/molit-transactions.ts',
      'lib/services/readiness.ts',
      'lib/services/research/research-tools.ts',
      'lib/services/source-refresh.ts',
      'lib/services/sources.ts',
      'lib/services/valuation-runner.ts',
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
      'lib/sources/http.ts',
      'lib/storage/local.ts'
    ],
    rules: {
      'no-restricted-syntax': 'off'
    }
  }
];
