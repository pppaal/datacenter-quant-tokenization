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

  // Audit retention
  AUDIT_RETENTION_DAYS: optionalNumber('AUDIT_RETENTION_DAYS'),
  OPS_ALERT_DELIVERY_RETENTION_DAYS: optionalNumber('OPS_ALERT_DELIVERY_RETENTION_DAYS'),
  NOTIFICATION_RETENTION_DAYS: optionalNumber('NOTIFICATION_RETENTION_DAYS'),
  OPS_WORK_ITEM_RETENTION_DAYS: optionalNumber('OPS_WORK_ITEM_RETENTION_DAYS'),

  // Playwright escape hatches
  PLAYWRIGHT_ALLOW_HOSTED_MUTATIONS: optionalBool,
  PLAYWRIGHT_ALLOWED_HOST_PATTERN: optionalString,

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
