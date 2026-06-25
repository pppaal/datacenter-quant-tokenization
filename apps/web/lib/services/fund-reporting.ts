import { InvestorReportReleaseStatus, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

type FundReportingMutationDb = Pick<PrismaClient, 'investorReport'>;

export type InvestorReportReleaseInput = {
  releaseStatus?: InvestorReportReleaseStatus;
  draftSummary?: string | null;
  reviewNotes?: string | null;
};

export async function updateInvestorReportRelease(
  reportId: string,
  input: InvestorReportReleaseInput,
  actor: {
    userId?: string | null;
    identifier?: string | null;
  },
  db: FundReportingMutationDb = prisma
) {
  const existing = await db.investorReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      fundId: true,
      releaseStatus: true,
      publishedAt: true,
      reviewedAt: true
    }
  });

  if (!existing) {
    throw new Error('Investor report not found.');
  }

  const nextReleaseStatus = input.releaseStatus ?? existing.releaseStatus;
  if (
    existing.releaseStatus === InvestorReportReleaseStatus.RELEASED &&
    nextReleaseStatus !== InvestorReportReleaseStatus.RELEASED
  ) {
    throw new Error('Released investor reports cannot be moved back to draft status.');
  }

  const now = new Date();
  const reviewedAt =
    nextReleaseStatus === InvestorReportReleaseStatus.DRAFT ? null : (existing.reviewedAt ?? now);

  const publishedAt =
    nextReleaseStatus === InvestorReportReleaseStatus.RELEASED
      ? (existing.publishedAt ?? now)
      : existing.publishedAt;

  // Attribution must be stamped only on the *transition into* a state, never on
  // every subsequent edit:
  //  - reviewedById: stamp when the report first leaves DRAFT (reviewedAt was
  //    null); clear when moving back to DRAFT; otherwise leave unchanged so
  //    editing notes on an already-reviewed report does not re-assign the
  //    reviewer (and does not erase it when the editor has no userId).
  //  - releasedById: stamp only on the transition into RELEASED; otherwise leave
  //    unchanged so editing an already-released report's notes does not overwrite
  //    or null out the original releaser.
  const isReleaseTransition =
    nextReleaseStatus === InvestorReportReleaseStatus.RELEASED &&
    existing.releaseStatus !== InvestorReportReleaseStatus.RELEASED;
  const isReviewTransition =
    nextReleaseStatus !== InvestorReportReleaseStatus.DRAFT && existing.reviewedAt == null;

  return db.investorReport.update({
    where: { id: reportId },
    data: {
      releaseStatus: nextReleaseStatus,
      draftSummary: input.draftSummary != null ? input.draftSummary.trim() || null : undefined,
      reviewNotes: input.reviewNotes != null ? input.reviewNotes.trim() || null : undefined,
      reviewedAt,
      reviewedById:
        nextReleaseStatus === InvestorReportReleaseStatus.DRAFT
          ? null
          : isReviewTransition
            ? (actor.userId ?? undefined)
            : undefined,
      publishedAt,
      releasedById: isReleaseTransition ? (actor.userId ?? null) : undefined
    }
  });
}
