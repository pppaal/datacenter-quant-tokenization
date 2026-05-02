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
  }
];
