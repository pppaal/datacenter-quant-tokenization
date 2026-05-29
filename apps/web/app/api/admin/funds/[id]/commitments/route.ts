import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { withAdminApi } from '@/lib/security/with-admin-api';
import { createCommitmentWithEligibility } from '@/lib/services/commitments';
import { CommitmentEligibilityError } from '@/lib/services/aml/eligibility';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  investorId: z.string().min(1),
  committedKrw: z.number().positive(),
  // Currency is accepted for forward-compat; only KRW is supported today.
  currency: z.string().optional(),
  vehicleId: z.string().min(1).optional(),
  signedAt: z.string().datetime().optional(),
  // KYC status resolved out-of-band (KycRecord is keyed on wallet, not Investor).
  kycStatus: z.string().optional()
});

/**
 * Create a fund Commitment. The AML eligibility gate runs BEFORE any write:
 *   - 422 + { error, reasons } when the investor is not cleared
 *     (KYC_NOT_APPROVED / NOT_SCREENED / SANCTIONS_BLOCKED / NOT_ACCREDITED)
 *   - 404 when the investor does not exist / 409 on duplicate commitment
 *   - audit before/after pair on success (before = null; create)
 *
 * Requires ANALYST role (capital ops). Gated by middleware as an admin route.
 */
export const POST = withAdminApi<typeof bodySchema, { id: string }>({
  bodySchema,
  requiredRole: 'ANALYST',
  auditAction: 'commitment.create',
  auditEntityType: 'Commitment',
  auditEntityIdFromParams: (params) => params.id,
  async handler({ body, params, requestId }) {
    if (body.currency && body.currency.toUpperCase() !== 'KRW') {
      return NextResponse.json(
        { error: `Unsupported currency ${body.currency}; only KRW is supported.` },
        { status: 422, headers: { 'X-Request-Id': requestId } }
      );
    }

    try {
      const result = await createCommitmentWithEligibility(
        {
          fundId: params.id,
          investorId: body.investorId,
          committedKrw: body.committedKrw,
          vehicleId: body.vehicleId ?? null,
          signedAt: body.signedAt ? new Date(body.signedAt) : null,
          kycStatus: body.kycStatus ?? null
        },
        {},
        prisma
      );

      return {
        response: NextResponse.json(
          { ok: true, commitmentId: result.commitment.id },
          { status: 201 }
        ),
        before: result.before,
        after: result.after
      };
    } catch (error) {
      if (error instanceof CommitmentEligibilityError) {
        return NextResponse.json(
          { error: error.message, reasons: error.reasons },
          { status: 422, headers: { 'X-Request-Id': requestId } }
        );
      }
      const message = error instanceof Error ? error.message : 'Commitment create failed';
      // Prisma unique-constraint violation on (fundId, investorId, vehicleId).
      if (/unique|P2002/i.test(message)) {
        return NextResponse.json(
          { error: 'A commitment already exists for this investor in this fund.' },
          { status: 409, headers: { 'X-Request-Id': requestId } }
        );
      }
      if (/foreign key|not found|P2003|P2025/i.test(message)) {
        return NextResponse.json(
          { error: 'Fund or investor not found.' },
          { status: 404, headers: { 'X-Request-Id': requestId } }
        );
      }
      throw error;
    }
  }
});
