/**
 * Shared OPS_CRON_TOKEN authorization for the `/api/ops/*` cron routes.
 *
 * The token is a long-lived shared secret presented by the scheduler on every
 * call, so the comparison MUST be constant-time: a naive `===` on a secret
 * returns as soon as the first differing byte is found, leaking the length of
 * the matching prefix through response timing and letting an attacker recover
 * the token byte-by-byte. We compare every byte regardless of where the first
 * mismatch occurs, and fold the length check into the same accumulator so a
 * length difference can't short-circuit either.
 *
 * This mirrors the `safeEqual` helpers already used for admin session/basic
 * auth (`lib/security/admin-session.ts`, `lib/security/admin-auth.ts`). The
 * `/api/ops/*` middleware gate is the first line of defense; this re-check at
 * the handler is defense-in-depth, so it should be at least as strong.
 */
function constantTimeEquals(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length === right.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = left.charCodeAt(index) || 0;
    const rightCode = right.charCodeAt(index) || 0;
    difference |= leftCode ^ rightCode;
  }

  return difference === 0;
}

/**
 * Returns true iff the request presents the expected ops cron token in either
 * the `Authorization: Bearer <token>` header or the `x-ops-cron-token` header.
 *
 * `expectedToken` must be a non-empty, already-trimmed secret (callers reject
 * an unconfigured token with a 503 before reaching here). A missing/empty
 * presented token never matches a non-empty expected token because the length
 * check fails closed. Both candidate headers are always evaluated so the total
 * work — and thus the timing — does not depend on which header (if any) was
 * supplied.
 */
export function isOpsRequestAuthorized(request: Request, expectedToken: string): boolean {
  const bearer =
    request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '')
      .trim() ?? '';
  const headerToken = request.headers.get('x-ops-cron-token')?.trim() ?? '';

  const bearerMatches = constantTimeEquals(bearer, expectedToken);
  const headerMatches = constantTimeEquals(headerToken, expectedToken);
  return bearerMatches || headerMatches;
}
