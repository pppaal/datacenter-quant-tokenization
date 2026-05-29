/**
 * Commitment creation with the AML/eligibility gate enforced at the mutation
 * boundary. This is the ONLY sanctioned path to create a `Commitment`: it calls
 * `assertCommitmentEligibility` BEFORE persisting, so an investor that has not
 * cleared KYC + sanctions/PEP screening (and, optionally, accreditation) can
 * never be onboarded into a fund's capital stack.
 *
 * Pure-ish + DB-fake testable: callers pass a Prisma client (defaults to the
 * shared instance). The eligibility error surfaces as `CommitmentEligibilityError`
 * so the route can map it to a 422 with structured reasons.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertCommitmentEligibility, type ResolveEligibilityOptions } from './aml/eligibility';

export type CreateCommitmentInput = {
  fundId: string;
  investorId: string;
  committedKrw: number;
  vehicleId?: string | null;
  signedAt?: Date | null;
  /** KYC status resolved out-of-band (KycRecord is keyed on wallet). */
  kycStatus?: string | null;
};

export type CreateCommitmentDeps = Pick<
  PrismaClient,
  'commitment' | 'investor' | 'screeningResult'
>;

/**
 * Create a Commitment after enforcing the eligibility gate. Throws
 * `CommitmentEligibilityError` (caught by the route → 422) when the investor is
 * not cleared, or a plain Error for fund/investor not-found / duplicate.
 *
 * Returns `{ before, after }` so the route can emit a before/after audit pair
 * (`before` is null — this is a create).
 */
export async function createCommitmentWithEligibility(
  input: CreateCommitmentInput,
  eligibilityOptions: ResolveEligibilityOptions = {},
  db: CreateCommitmentDeps = prisma
): Promise<{ commitment: { id: string }; before: null; after: unknown }> {
  // 1. Gate FIRST — never persist for an ineligible investor.
  await assertCommitmentEligibility(
    input.investorId,
    {
      ...eligibilityOptions,
      kycStatusOverride: input.kycStatus ?? eligibilityOptions.kycStatusOverride
    },
    db
  );

  // 2. Persist.
  const commitment = await db.commitment.create({
    data: {
      fundId: input.fundId,
      investorId: input.investorId,
      vehicleId: input.vehicleId ?? null,
      commitmentKrw: input.committedKrw,
      signedAt: input.signedAt ?? null
    }
  });

  return {
    commitment: { id: commitment.id },
    before: null,
    after: {
      id: commitment.id,
      fundId: input.fundId,
      investorId: input.investorId,
      vehicleId: input.vehicleId ?? null,
      commitmentKrw: input.committedKrw
    }
  };
}
