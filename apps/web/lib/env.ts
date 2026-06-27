/**
 * Typed environment loader. Single source of truth for every env var the
 * Next.js layer reads at runtime, validated against a zod schema on first
 * access. Use this instead of `process.env.X?.trim()` so:
 *
 *   - typos surface as TypeScript errors at the call site, not runtime
 *   - default values live in one place and are easy to audit
 *   - production hard-fails on missing required vars (alongside the
 *     dedicated `prod:preflight` script)
 *
 * Migration policy: new code should import from `@/lib/env`. Existing
 * `process.env.*` reads can migrate incrementally.
 */
import { z } from 'zod';

const trueish = ['1', 'true', 'yes', 'on'];

const optionalString = z.preprocess((value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().optional());

const optionalBool = z
  .string()
  .optional()
  .transform((v) => (v ? trueish.includes(v.trim().toLowerCase()) : false));

const optionalNumber = (label: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be a number, got "${v}".`
        });
        return z.NEVER;
      }
      return n;
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database / app
  DATABASE_URL: optionalString,
  APP_BASE_URL: optionalString,

  // Admin auth — sessions
  ADMIN_SESSION_SECRET: optionalString,
  ADMIN_SESSION_TTL_HOURS: optionalNumber('ADMIN_SESSION_TTL_HOURS'),
  ADMIN_ALLOW_UNBOUND_BROWSER_SESSION: optionalBool,

  // Ops cron / queue
  OPS_CRON_TOKEN: optionalString,
  OPS_ALERT_FAILURE_STREAK: optionalNumber('OPS_ALERT_FAILURE_STREAK'),
  OPS_ALERT_STALE_HOURS: optionalNumber('OPS_ALERT_STALE_HOURS'),
  OPS_ALERT_DEDUP_WINDOW_MINUTES: optionalNumber('OPS_ALERT_DEDUP_WINDOW_MINUTES'),
  OPS_ALERT_WEBHOOK_URL: optionalString,
  OPS_ALERT_FALLBACK_WEBHOOK_URL: optionalString,
  OPS_ALERT_PAGER_WEBHOOK_URL: optionalString,
  OPS_ALERT_NOTIFY_ON_RECOVERY: optionalBool,

  // Document storage
  DOCUMENT_STORAGE_DIR: optionalString,
  DOCUMENT_STORAGE_BUCKET: optionalString,
  DOCUMENT_STORAGE_REGION: optionalString,
  DOCUMENT_STORAGE_ENDPOINT: optionalString,
  DOCUMENT_STORAGE_ACCESS_KEY_ID: optionalString,
  DOCUMENT_STORAGE_SECRET_ACCESS_KEY: optionalString,
  DOCUMENT_STORAGE_PREFIX: optionalString,
  DOCUMENT_STORAGE_FORCE_PATH_STYLE: optionalBool,

  // Blockchain
  BLOCKCHAIN_MOCK_MODE: optionalBool,
  BLOCKCHAIN_CHAIN_ID: optionalNumber('BLOCKCHAIN_CHAIN_ID'),
  BLOCKCHAIN_CHAIN_NAME: optionalString,
  BLOCKCHAIN_RPC_URL: optionalString,
  BLOCKCHAIN_REGISTRY_ADDRESS: optionalString,
  BLOCKCHAIN_PRIVATE_KEY: optionalString,
  BLOCKCHAIN_METADATA_BASE_URL: optionalString,

  // Edge protection
  ADMIN_IP_ALLOWLIST: optionalString,
  OPS_IP_ALLOWLIST: optionalString,
  // Number of trusted reverse-proxy hops in front of the app. Bounds how far
  // into `x-forwarded-for` we trust when resolving the client IP (the Nth-from-
  // the-right entry). Default 1 = Vercel's single edge proxy. Read directly from
  // process.env in the Edge runtime (`edge-protection.ts`); listed here for
  // typing/documentation.
  TRUSTED_PROXY_HOP_COUNT: optionalNumber('TRUSTED_PROXY_HOP_COUNT'),
  ADMIN_API_RATE_WINDOW_MS: optionalNumber('ADMIN_API_RATE_WINDOW_MS'),
  ADMIN_API_RATE_MAX: optionalNumber('ADMIN_API_RATE_MAX'),
  OPS_API_RATE_WINDOW_MS: optionalNumber('OPS_API_RATE_WINDOW_MS'),
  OPS_API_RATE_MAX: optionalNumber('OPS_API_RATE_MAX'),
  PUBLIC_API_RATE_WINDOW_MS: optionalNumber('PUBLIC_API_RATE_WINDOW_MS'),
  PUBLIC_API_RATE_MAX: optionalNumber('PUBLIC_API_RATE_MAX'),

  // Distributed rate limiter
  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  // Observability
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  ERROR_REPORT_WEBHOOK_URL: optionalString,
  SENTRY_DSN: optionalString,
  SENTRY_ENVIRONMENT: optionalString,
  SENTRY_TRACES_SAMPLE_RATE: optionalString,
  SENTRY_PROFILES_SAMPLE_RATE: optionalString,
  SENTRY_AUTH_TOKEN: optionalString,
  SENTRY_ORG: optionalString,
  SENTRY_PROJECT: optionalString,

  // AML / CDD
  SANCTIONS_DENYLIST_JSON: optionalString,
  AML_RESCREEN_INTERVAL_DAYS: optionalNumber('AML_RESCREEN_INTERVAL_DAYS'),
  AUDIT_ALLOW_HARD_DELETE: optionalBool,

  // Audit retention
  AUDIT_RETENTION_DAYS: optionalNumber('AUDIT_RETENTION_DAYS'),
  OPS_ALERT_DELIVERY_RETENTION_DAYS: optionalNumber('OPS_ALERT_DELIVERY_RETENTION_DAYS'),
  NOTIFICATION_RETENTION_DAYS: optionalNumber('NOTIFICATION_RETENTION_DAYS'),
  OPS_WORK_ITEM_RETENTION_DAYS: optionalNumber('OPS_WORK_ITEM_RETENTION_DAYS'),

  // Playwright escape hatches
  PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS: optionalBool,
  PLAYWRIGHT_ALLOWED_HOST_PATTERN: optionalString,
  // Opts the production-mode browser E2E (`next start`, NODE_ENV=production) out
  // of production-only hard-blocks (mock blockchain, local document storage) so
  // it can exercise mock/local paths. See `isRealProduction`. Forbidden by the
  // production preflight.
  E2E_PRODUCTION_BUILD: optionalBool,

  // Maps (optional). When KAKAO_MAP_API_KEY is set, the property explorer
  // renders a Kakao map; otherwise it falls back to Leaflet + OpenStreetMap,
  // which needs no key. The key is a public JS API key (domain-scoped on the
  // Kakao console) and is intentionally exposed to the browser.
  KAKAO_MAP_API_KEY: optionalString,
  // Kakao Local REST key (server-side). When set, the property analyzer geocodes
  // arbitrary Korean addresses via the live Kakao geocoder (coords + PNU);
  // otherwise it falls back to the deterministic demo geocoder. This is a secret
  // REST key — distinct from the public KAKAO_MAP_API_KEY — and must not be
  // exposed to the browser.
  KAKAO_REST_API_KEY: optionalString,
  // Keyless live geocoding via OSM Nominatim. When 'true' (and no Kakao key),
  // /property-analyze resolves arbitrary Korean addresses to real coordinates
  // with no API key (synthetic PNU). Off by default so CI/dev stay on the
  // deterministic demo geocoder.
  ENABLE_OSM_GEOCODER: optionalBool,

  // External AI / model providers (optional)
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_NARRATIVE_MODEL: optionalString,

  // Vercel / deployment metadata (provided by Vercel runtime)
  VERCEL_ENV: optionalString,
  VERCEL_GIT_COMMIT_SHA: optionalString
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Returns the validated env. Throws on unrecoverable schema violation
 * (e.g. a numeric var was passed a non-numeric value). Missing optional
 * vars return undefined; missing required vars are caught by
 * `prod:preflight`, not here, so dev/test environments stay forgiving.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only: clears the memoized env so a subsequent `env()` re-reads. */
export function __resetEnvCache(): void {
  cached = null;
}
