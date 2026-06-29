/**
 * Commitment eligibility gate.
 *
 * Before a `Commitment` can be created or activated, an investor must have:
 *   1. passed KYC (an APPROVED KycRecord), and
 *   2. passed sanctions/PEP screening (latest ScreeningResult is CLEAR — i.e.
 *      not blocked), and
 *   3. (optional, configurable) an accreditation/suitability flag
 *      (적격투자자 / 전문투자자).
 *
 * There is currently no Commitment create/activate mutation route in the
 * codebase. When one is added, it MUST call `assertCommitmentEligibility`
 * (or `evaluateCommitmentEligibility`) before persisting. See the test for
 * the contract.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type EligibilityReasonCode =
  | 'KYC_NOT_APPROVED'
  | 'SANCTIONS_BLOCKED'
  | 'NOT_SCREENED'
  | 'NOT_ACCREDITED';

export type EligibilityResult = {
  eligible: boolean;
  reasons: EligibilityReasonCode[];
  detail: string;
};

export type EligibilityInputs = {
  /** Resolved KYC status for the investor's wallet/applicant. */
  kycStatus?: string | null;
  /** Latest screening status for the investor. */
  screeningStatus?: string | null;
  /** Accreditation flag value, if assessed. */
  accreditationStatus?: string | null;
  /** When true, accreditation is enforced (default false — additive). */
  requireAccreditation?: boolean;
  /** Accreditation values that count as eligible. */
  acceptedAccreditation?: string[];
};

const BLOCKING_SCREENING_STATUSES = new Set([
  'REJECTED',
  'CONFIRMED_MATCH',
  'ESCALATED',
  'POTENTIAL_MATCH'
]);

const DEFAULT_ACCREDITATION = ['PROFESSIONAL', 'QUALIFIED'];

/** Pure evaluation — DB-free. */
export function evaluateCommitmentEligibility(inputs: EligibilityInputs): EligibilityResult {
  const reasons: EligibilityReasonCode[] = [];

  if ((inputs.kycStatus ?? '').toUpperCase() !== 'APPROVED') {
    reasons.push('KYC_NOT_APPROVED');
  }

  const screening = (inputs.screeningStatus ?? '').toUpperCase();
  if (!screening) {
    reasons.push('NOT_SCREENED');
  } else if (BLOCKING_SCREENING_STATUSES.has(screening)) {
    reasons.push('SANCTIONS_BLOCKED');
  }

  if (inputs.requireAccreditation) {
    const accepted = (inputs.acceptedAccreditation ?? DEFAULT_ACCREDITATION).map((v) =>
      v.toUpperCase()
    );
    if (!accepted.includes((inputs.accreditationStatus ?? '').toUpperCase())) {
      reasons.push('NOT_ACCREDITED');
    }
  }

  const eligible = reasons.length === 0;
  return {
    eligible,
    reasons,
    detail: eligible
      ? 'Investor cleared KYC, screening, and accreditation checks.'
      : `Commitment blocked: ${reasons.join(', ')}.`
  };
}

export type ResolveEligibilityOptions = {
  requireAccreditation?: boolean;
  acceptedAccreditation?: string[];
  /** Optional KYC status when there is no wallet linkage to derive it. */
  kycStatusOverride?: string | null;
};

/**
 * Resolve an investor's eligibility from the database (latest screening +
 * accreditation flag). KYC status is passed in (the KycRecord is keyed on a
 * wallet, not the Investor model) — callers that know the wallet should look
 * up the KycRecord and pass its status via `kycStatusOverride`.
 */
export async function resolveCommitmentEligibility(
  investorId: string,
  options: ResolveEligibilityOptions = {},
  db: Pick<PrismaClient, 'investor' | 'screeningResult' | 'kycRecord'> = prisma
): Promise<EligibilityResult> {
  const [investor, latestScreening] = await Promise.all([
    db.investor.findUnique({
      where: { id: investorId },
      select: { accreditationStatus: true, wallet: true }
    }),
    db.screeningResult.findFirst({
      where: { investorId },
      orderBy: { screenedAt: 'desc' },
      select: { status: true }
    })
  ]);

  // KYC: when the investor has a linked wallet, resolve the status SERVER-SIDE
  // from the latest KycRecord (authoritative). The client-supplied
  // `kycStatusOverride` is only honored as a fallback for genuinely wallet-less
  // investors — it can NEVER satisfy the gate for a wallet-linked investor, so a
  // caller cannot pass `kycStatus: 'APPROVED'` to onboard an un-KYC'd party.
  let kycStatus = options.kycStatusOverride ?? null;
  if (investor?.wallet) {
    const kyc = await db.kycRecord.findFirst({
      where: { wallet: investor.wallet },
      orderBy: { createdAt: 'desc' },
      select: { status: true }
    });
    kycStatus = kyc?.status ?? null;
  }

  return evaluateCommitmentEligibility({
    kycStatus,
    screeningStatus: latestScreening?.status ?? null,
    accreditationStatus: investor?.accreditationStatus ?? null,
    requireAccreditation: options.requireAccreditation,
    acceptedAccreditation: options.acceptedAccreditation
  });
}

/** Throwing variant for use at a mutation boundary. */
export async function assertCommitmentEligibility(
  investorId: string,
  options: ResolveEligibilityOptions = {},
  db: Pick<PrismaClient, 'investor' | 'screeningResult' | 'kycRecord'> = prisma
): Promise<void> {
  const result = await resolveCommitmentEligibility(investorId, options, db);
  if (!result.eligible) {
    throw new CommitmentEligibilityError(result);
  }
}

export class CommitmentEligibilityError extends Error {
  public readonly reasons: EligibilityReasonCode[];
  constructor(result: EligibilityResult) {
    super(result.detail);
    this.name = 'CommitmentEligibilityError';
    this.reasons = result.reasons;
  }
}
