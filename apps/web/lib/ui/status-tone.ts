// ---------------------------------------------------------------------------
// Status -> Badge tone single source of truth.
//
// Dozens of admin/research pages previously declared their own
// `tone()/statusTone()/getApprovalTone()` helpers that mapped a status
// string to a `<Badge tone=…>` value. This module centralises the generic
// lookup plus the recurring named maps so the duplicated ones share one
// implementation. Bespoke per-page logic (numeric thresholds, multi-field
// decisions) intentionally stays local.
// ---------------------------------------------------------------------------

export type Tone = 'neutral' | 'good' | 'warn' | 'danger';

/**
 * Look up `status` in `map`, returning `fallback` when absent.
 *
 * @example statusTone(row.status, { LIVE: 'good' }, 'warn')
 */
export function statusTone<T extends Tone>(status: string, map: Record<string, T>, fallback: T): T {
  return map[status] ?? fallback;
}

/**
 * Approval workflow tone (APPROVED / CONDITIONAL / REJECTED, else neutral).
 * Mirrors the byte-identical `getApprovalTone` from the valuations pages.
 */
export function approvalTone(approvalStatus: string): Tone {
  return statusTone(
    approvalStatus,
    { APPROVED: 'good', CONDITIONAL: 'warn', REJECTED: 'danger' },
    'neutral'
  );
}

/**
 * KYC / identity record tone (APPROVED good; REJECTED/REVOKED danger; else
 * warn). Mirrors the `statusTone` from the identity admin page.
 */
export function kycTone(status: string): Exclude<Tone, 'neutral'> {
  return statusTone(status, { APPROVED: 'good', REJECTED: 'danger', REVOKED: 'danger' }, 'warn');
}
