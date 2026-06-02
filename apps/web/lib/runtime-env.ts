/**
 * Production runtime detection shared by every production-only hard-block
 * (mock blockchain writes, mock tokenization writes, local-filesystem document
 * storage, ...).
 *
 * The browser E2E serves a real production `next start` build, so
 * `NODE_ENV === 'production'` is true even though the suite is not a real
 * deployment and has no S3 / RPC / signer. Setting `E2E_PRODUCTION_BUILD=true`
 * opts that single, well-known context out of the hard-blocks so the suite can
 * exercise the mock/local code paths. The production preflight forbids the
 * flag, so it can never weaken a real deployment.
 *
 * Guards should read this instead of comparing `NODE_ENV` directly, so a new
 * production hard-block automatically honors the E2E opt-out without inventing
 * its own escape-hatch env var.
 */
export function isRealProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production') {
    return false;
  }
  // A real production deployment must NEVER honor the E2E opt-out, regardless of
  // whether the (advisory) production preflight was run. Vercel sets VERCEL_ENV
  // automatically to 'production' on production deployments, so the flag can
  // only ever relax hard-blocks in a non-production `next start` context (the
  // browser E2E) and can never weaken a real deployment via a leaked/copied
  // env var.
  if (env.VERCEL_ENV === 'production') {
    return true;
  }
  return env.E2E_PRODUCTION_BUILD?.trim().toLowerCase() !== 'true';
}
