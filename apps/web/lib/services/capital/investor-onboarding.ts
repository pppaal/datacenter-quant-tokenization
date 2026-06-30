/**
 * Reusable LP onboarding profile + subscription-readiness assessment (benchmark #4).
 *
 * Captures an LP's reusable identity data ONCE (entity type, domicile, accreditation,
 * wallet, tax) and turns the current compliance snapshot into:
 *   1. a per-item subscription-readiness CHECKLIST (blocking vs advisory), and
 *   2. a canonical ERC-3643 CLAIM-TOPIC payload, ready for a future on-chain bridge.
 *
 * COMPOSITION, not duplication: the KYC / sanctions / accreditation gate is delegated
 * verbatim to `evaluateCommitmentEligibility` (aml/eligibility.ts) — this module only
 * unpacks its reasons into human-readable items and adds FUND-level constraints
 * (domicile allowlist, minimum commitment) that the eligibility gate does not model.
 *
 * PURE and DB-free (compliance state + fund constraints are passed in) → fully
 * unit-testable. No schema change: the reusable profile is validated by zod and can be
 * persisted later without touching this logic.
 */
import { z } from 'zod';
import {
  evaluateCommitmentEligibility,
  type EligibilityReasonCode
} from '@/lib/services/aml/eligibility';

export const InvestorOnboardingProfileSchema = z.object({
  investorId: z.string().min(1),
  investorName: z.string().min(1),
  investorType: z.enum(['CORPORATE', 'INDIVIDUAL', 'FUND', 'OTHER']).nullable().default(null),
  /** ISO 3166-1 alpha-3 domicile. */
  domicile: z.string().length(3).nullable().default(null),
  accreditationStatus: z.enum(['PROFESSIONAL', 'QUALIFIED', 'RETAIL']).nullable().default(null),
  /** 0x-prefixed wallet linking to on-chain KYC/identity. */
  wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .nullable()
    .default(null),
  /** ISO 3166-1 alpha-3 tax residence (defaults conceptually to domicile). */
  taxCountry: z.string().length(3).nullable().default(null),
  taxId: z.string().nullable().default(null),
  primaryContactEmail: z.string().email().nullable().default(null),
  /** ISO 3166-1 NUMERIC country code (as stored on KycRecord) for on-chain identity. */
  countryCode: z.number().int().min(0).max(999).nullable().default(null)
});

export type InvestorOnboardingProfile = z.infer<typeof InvestorOnboardingProfileSchema>;

/** Parse/validate a reusable onboarding profile (throws ZodError on invalid input). */
export function parseInvestorOnboardingProfile(input: unknown): InvestorOnboardingProfile {
  return InvestorOnboardingProfileSchema.parse(input);
}

export type ReadinessStatus = 'PASS' | 'FAIL' | 'PENDING';

export type SubscriptionReadinessItem = {
  check: string;
  status: ReadinessStatus;
  /** True when a non-PASS status must block subscription. */
  blocking: boolean;
  reason?: string;
};

/** Canonical claim-topic payload prepared for a future ERC-3643/ONCHAINID bridge. */
export type CanonicalClaimTopics = {
  kycStatus: string | null;
  accreditationLevel: string | null;
  countryCode: number | null;
  entityType: string | null;
  taxCountry: string | null;
  isPep: boolean;
  isScreened: boolean;
};

export type SubscriptionReadinessAssessment = {
  investorId: string;
  items: SubscriptionReadinessItem[];
  canSubscribe: boolean;
  blockingReasons: string[];
  claimTopics: CanonicalClaimTopics;
};

export type SubscriptionReadinessOptions = {
  /** Resolved server-side KYC status (e.g. from resolveCommitmentEligibility). */
  kycStatus?: string | null;
  /** Latest screening status (CLEAR / POTENTIAL_MATCH / ...). */
  screeningStatus?: string | null;
  isPep?: boolean;
  requireAccreditation?: boolean;
  acceptedAccreditation?: string[];
  /** Proposed commitment size, checked against the fund minimum when both present. */
  commitmentKrw?: number | null;
  fundConstraints?: {
    minCommitmentKrw?: number | null;
    /** ISO 3166-1 alpha-3 allowlist; when set, the LP domicile must be a member. */
    allowedDomiciles?: string[] | null;
  };
};

const REASON_TO_CHECK: Record<EligibilityReasonCode, string> = {
  KYC_NOT_APPROVED: 'KYC verification',
  SANCTIONS_BLOCKED: 'Sanctions & PEP screening',
  NOT_SCREENED: 'Sanctions & PEP screening',
  NOT_ACCREDITED: 'Accreditation status'
};

export function assessSubscriptionReadiness(
  profile: InvestorOnboardingProfile,
  options: SubscriptionReadinessOptions = {}
): SubscriptionReadinessAssessment {
  const eligibility = evaluateCommitmentEligibility({
    kycStatus: options.kycStatus ?? null,
    screeningStatus: options.screeningStatus ?? null,
    accreditationStatus: profile.accreditationStatus,
    requireAccreditation: options.requireAccreditation,
    acceptedAccreditation: options.acceptedAccreditation
  });
  const reasons = new Set(eligibility.reasons);

  const items: SubscriptionReadinessItem[] = [];

  // KYC — PENDING when simply not yet approved/absent, FAIL when explicitly rejected.
  const kyc = (options.kycStatus ?? '').toUpperCase();
  if (reasons.has('KYC_NOT_APPROVED')) {
    const rejected = kyc === 'REJECTED' || kyc === 'REVOKED';
    items.push({
      check: REASON_TO_CHECK.KYC_NOT_APPROVED,
      status: rejected ? 'FAIL' : 'PENDING',
      blocking: true,
      reason: rejected ? `KYC ${kyc.toLowerCase()}` : 'Awaiting KYC approval'
    });
  } else {
    items.push({ check: REASON_TO_CHECK.KYC_NOT_APPROVED, status: 'PASS', blocking: false });
  }

  // Screening.
  if (reasons.has('SANCTIONS_BLOCKED')) {
    items.push({
      check: REASON_TO_CHECK.SANCTIONS_BLOCKED,
      status: 'FAIL',
      blocking: true,
      reason: 'Investor flagged on a sanctions/PEP list'
    });
  } else if (reasons.has('NOT_SCREENED')) {
    items.push({
      check: REASON_TO_CHECK.NOT_SCREENED,
      status: 'PENDING',
      blocking: true,
      reason: 'Screening not yet completed'
    });
  } else {
    items.push({ check: REASON_TO_CHECK.NOT_SCREENED, status: 'PASS', blocking: false });
  }

  // Accreditation (only assessed when the fund requires it).
  if (options.requireAccreditation) {
    if (reasons.has('NOT_ACCREDITED')) {
      const accepted = (options.acceptedAccreditation ?? ['PROFESSIONAL', 'QUALIFIED']).join(', ');
      items.push({
        check: REASON_TO_CHECK.NOT_ACCREDITED,
        status: 'FAIL',
        blocking: true,
        reason: `Accreditation not in accepted tier (${accepted})`
      });
    } else {
      items.push({ check: REASON_TO_CHECK.NOT_ACCREDITED, status: 'PASS', blocking: false });
    }
  }

  // Fund-level domicile allowlist (not modeled by the eligibility gate).
  const allowed = options.fundConstraints?.allowedDomiciles;
  if (allowed && allowed.length > 0) {
    if (!profile.domicile) {
      items.push({
        check: 'Domicile eligibility',
        status: 'PENDING',
        blocking: true,
        reason: 'Investor domicile is not recorded'
      });
    } else if (!allowed.includes(profile.domicile)) {
      items.push({
        check: 'Domicile eligibility',
        status: 'FAIL',
        blocking: true,
        reason: `Domicile ${profile.domicile} is outside the fund allowlist`
      });
    } else {
      items.push({ check: 'Domicile eligibility', status: 'PASS', blocking: false });
    }
  }

  // Minimum commitment.
  const min = options.fundConstraints?.minCommitmentKrw;
  if (typeof min === 'number' && typeof options.commitmentKrw === 'number') {
    const met = options.commitmentKrw >= min;
    items.push({
      check: 'Minimum commitment',
      status: met ? 'PASS' : 'FAIL',
      blocking: !met,
      reason: met ? undefined : `Commitment is below the fund minimum (${min.toLocaleString()} KRW)`
    });
  }

  // Wallet linkage — advisory: wallet-less investors are allowed (KYC may be out-of-band),
  // but on-chain identity/claims require a wallet, so surface it without blocking.
  items.push({
    check: 'Wallet linked (on-chain identity)',
    status: profile.wallet ? 'PASS' : 'PENDING',
    blocking: false,
    reason: profile.wallet ? undefined : 'No wallet linked; on-chain claims unavailable'
  });

  const blockingReasons = items
    .filter((i) => i.blocking && i.status !== 'PASS')
    .map((i) => `${i.check}: ${i.reason ?? i.status}`);
  const canSubscribe = blockingReasons.length === 0;

  const claimTopics: CanonicalClaimTopics = {
    kycStatus: options.kycStatus ?? null,
    accreditationLevel: profile.accreditationStatus,
    countryCode: profile.countryCode,
    entityType: profile.investorType,
    taxCountry: profile.taxCountry ?? profile.domicile,
    isPep: options.isPep ?? false,
    isScreened: Boolean((options.screeningStatus ?? '').trim())
  };

  return { investorId: profile.investorId, items, canSubscribe, blockingReasons, claimTopics };
}
