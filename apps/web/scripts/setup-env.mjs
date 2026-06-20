#!/usr/bin/env node
/**
 * One-shot local env scaffolder.
 *
 *   npm run setup:env
 *
 * Copies `.env.example` → `.env` (never clobbers an existing `.env`), with the
 * two production secrets that are pure toil to mint — `ADMIN_SESSION_SECRET`
 * and `OPS_CRON_TOKEN` — pre-generated with cryptographically strong random
 * values. Then prints the short list of values YOU still have to paste
 * (infra URLs + free data keys) and the next commands.
 *
 * `.env` is gitignored, so generated secrets never get committed. Re-run with
 * `--force` to overwrite an existing `.env` (regenerates the secrets too).
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const examplePath = join(root, '.env.example');
const envPath = join(root, '.env');
const force = process.argv.includes('--force');

if (!existsSync(examplePath)) {
  console.error(`✗ ${examplePath} not found — run from apps/web.`);
  process.exit(1);
}
if (existsSync(envPath) && !force) {
  console.error(
    `✗ ${envPath} already exists. Re-run with --force to overwrite (regenerates secrets).`
  );
  process.exit(1);
}

// ≥32 / ≥24 chars per the preflight length checks; base64 of 48/32 bytes clears both.
const sessionSecret = randomBytes(48).toString('base64');
const cronToken = randomBytes(32).toString('base64url');

function setVar(text, name, value) {
  const line = `${name}=${value}`;
  const re = new RegExp(`^${name}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  // Not present in the example (shouldn't happen) — append.
  return `${text.trimEnd()}\n${line}\n`;
}

let env = readFileSync(examplePath, 'utf8');
env = setVar(env, 'ADMIN_SESSION_SECRET', sessionSecret);
env = setVar(env, 'OPS_CRON_TOKEN', cronToken);
writeFileSync(envPath, env, { mode: 0o600 });
// writeFileSync's mode is ignored when overwriting an existing file; enforce it.
chmodSync(envPath, 0o600);

console.log(`✓ Wrote ${envPath} (gitignored) with freshly generated secrets:`);
console.log(`    ADMIN_SESSION_SECRET  (48-byte base64)`);
console.log(`    OPS_CRON_TOKEN        (32-byte base64url)`);
console.log('');
console.log('Now paste these values into .env (see docs/go-live-checklist.md):');
console.log('  [infra — required to launch]');
console.log('    DATABASE_URL                Postgres + pgvector (Neon / Supabase)');
console.log('    DOCUMENT_STORAGE_BUCKET     S3 / R2 bucket (+ REGION / keys / ENDPOINT)');
console.log('    UPSTASH_REDIS_REST_URL,_TOKEN');
console.log('    APP_BASE_URL                your real domain');
console.log('    BLOCKCHAIN_RPC_URL / _PRIVATE_KEY / _REGISTRY_ADDRESS / _CHAIN_ID / _CHAIN_NAME');
console.log('    login: ADMIN_OIDC_* (or ADMIN_BASIC_AUTH_*)');
console.log('  [free data keys — optional, lights up real data]');
console.log('    data.go.kr: RTMS_SERVICE_KEY, MOLIT_BUILDING_API_KEY, KPX_SMP_SERVICE_KEY,');
console.log('                HRFCO_FLOOD_SERVICE_KEY, KEPCO_DG_SERVICE_KEY');
console.log('    portals:    BOK_ECOS_API_KEY+ECOS_API_KEY, KOSIS_API_KEY+KOREA_KOSIS_API_KEY,');
console.log('                DART_API_KEY, KOFIA_API_KEY, VWORLD_API_KEY+VWORLD_API_DOMAIN,');
console.log('                RONE_API_KEY, FRED_API_KEY');
console.log('');
console.log(
  'Then:  npm run prisma:generate && npm run prisma:migrate:deploy && npm run prod:preflight'
);
