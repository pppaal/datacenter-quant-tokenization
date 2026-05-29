/**
 * Investor compliance read-model.
 *
 * Assembles a single investor's AML/KYC posture from the new compliance
 * models — latest sanctions/PEP screening, AML risk rating, accreditation
 * flag — plus a computed eligibility verdict (the same gate the Commitment
 * mutation route enforces). Pure assembly over already-loaded rows so it is
 * unit-testable with Prisma fakes.
 *
 * KYC status is keyed on a wallet (`KycRecord`), not the `Investor` model, so
 * callers that know the wallet pass `kycStatus` in. When omitted the view
 * reports KYC as unknown and the eligibility verdict will block on
 * `KYC_NOT_APPROVED` — fail-closed, matching the mutation gate.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { evaluateCommitmentEligibility, type EligibilityResult } from './eligibility';

export type ScreeningSummary = {
  status: string;
  isPep: boolean;
  matchScore: number;
  listType: string | null;
  provider: string;
  screenedAt: string;
  /** ISO date the next re-screen is due (ongoing monitoring), if scheduled. */
  rescreenDueAt: string | null;
  /** True when `rescreenDueAt` is in the past relative to `asOf`. */
  rescreenOverdue: boolean;
};

export type RiskRatingSummary = {
  rating: string;
  score: number;
  factors: Array<{ code: string; label: string; weight: number }>;
  ratedAt: string;
};

export type InvestorComplianceView = {
  investorId: string;
  investorName: string | null;
  investorCode: string | null;
  investorType: string | null;
  domicile: string | null;
  kycStatus: string | null;
  accreditationStatus: string | null;
  accreditedAt: string | null;
  screening: ScreeningSummary | null;
  riskRating: RiskRatingSummary | null;
  eligibility: EligibilityResult;
};

export type BuildInvestorComplianceViewOptions = {
  /** KYC status resolved out-of-band (KycRecord is keyed on wallet). */
  kycStatus?: string | null;
  /** Enforce accreditation in the eligibility verdict (default false). */
  requireAccreditation?: boolean;
  acceptedAccreditation?: string[];
  asOf?: Date;
};

type RiskFactorShape = { code: string; label: string; weight: number };

function coerceFactors(raw: unknown): RiskFactorShape[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is RiskFactorShape =>
      !!f &&
      typeof (f as RiskFactorShape).code === 'string' &&
      typeof (f as RiskFactorShape).label === 'string' &&
      typeof (f as RiskFactorShape).weight === 'number'
  );
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function buildInvestorComplianceView(
  investorId: string,
  options: BuildInvestorComplianceViewOptions = {},
  db: Pick<PrismaClient, 'investor' | 'screeningResult' | 'amlRiskRating'> = prisma
): Promise<InvestorComplianceView | null> {
  const asOf = options.asOf ?? new Date();

  const [investor, latestScreening, riskRating] = await Promise.all([
    db.investor.findUnique({
      where: { id: investorId },
      select: {
        id: true,
        name: true,
        code: true,
        investorType: true,
        domicile: true,
        accreditationStatus: true,
        accreditedAt: true
      }
    }),
    db.screeningResult.findFirst({
      where: { investorId },
      orderBy: { screenedAt: 'desc' },
      select: {
        status: true,
        isPep: true,
        matchScore: true,
        listType: true,
        provider: true,
        screenedAt: true,
        rescreenDueAt: true
      }
    }),
    db.amlRiskRating.findUnique({
      where: { investorId },
      select: { rating: true, score: true, factors: true, ratedAt: true }
    })
  ]);

  if (!investor) return null;

  const screening: ScreeningSummary | null = latestScreening
    ? {
        status: latestScreening.status,
        isPep: latestScreening.isPep,
        matchScore: latestScreening.matchScore,
        listType: latestScreening.listType ?? null,
        provider: latestScreening.provider,
        screenedAt: toIso(latestScreening.screenedAt) ?? '',
        rescreenDueAt: toIso(latestScreening.rescreenDueAt),
        rescreenOverdue: latestScreening.rescreenDueAt
          ? new Date(latestScreening.rescreenDueAt).getTime() <= asOf.getTime()
          : false
      }
    : null;

  const riskRatingSummary: RiskRatingSummary | null = riskRating
    ? {
        rating: riskRating.rating,
        score: riskRating.score,
        factors: coerceFactors(riskRating.factors),
        ratedAt: toIso(riskRating.ratedAt) ?? ''
      }
    : null;

  const eligibility = evaluateCommitmentEligibility({
    kycStatus: options.kycStatus ?? null,
    screeningStatus: latestScreening?.status ?? null,
    accreditationStatus: investor.accreditationStatus,
    requireAccreditation: options.requireAccreditation,
    acceptedAccreditation: options.acceptedAccreditation
  });

  return {
    investorId: investor.id,
    investorName: investor.name ?? null,
    investorCode: investor.code ?? null,
    investorType: investor.investorType ?? null,
    domicile: investor.domicile ?? null,
    kycStatus: options.kycStatus ?? null,
    accreditationStatus: investor.accreditationStatus ?? null,
    accreditedAt: toIso(investor.accreditedAt),
    screening,
    riskRating: riskRatingSummary,
    eligibility
  };
}
