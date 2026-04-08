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
  if (existing.releaseStatus === InvestorReportReleaseStatus.RELEASED && nextReleaseStatus !== InvestorReportReleaseStatus.RELEASED) {
    throw new Error('Released investor reports cannot be moved back to draft status.');
  }

  const now = new Date();
  const reviewedAt =
    nextReleaseStatus === InvestorReportReleaseStatus.DRAFT
      ? null
      : existing.reviewedAt ?? now;

  const publishedAt =
    nextReleaseStatus === InvestorReportReleaseStatus.RELEASED
      ? existing.publishedAt ?? now
      : existing.publishedAt;

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
          : actor.userId ?? undefined,
      publishedAt,
      releasedById:
        nextReleaseStatus === InvestorReportReleaseStatus.RELEASED
          ? actor.userId ?? null
          : undefined
    }
  });
}
