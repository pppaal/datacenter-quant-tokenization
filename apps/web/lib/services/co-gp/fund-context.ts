/**
 * Fund / capital-event → co-GP context mappers (benchmark #10 wiring).
 *
 * PURE adapters projecting already-fetched fund, capital-call/distribution, PCAP, and
 * deal records onto the co-GP notice / LP-Q&A input shapes, so the admin routes stay
 * thin and the mapping is unit-testable without a DB. Structural input types keep these
 * decoupled from the exact Prisma payloads.
 */
import { toNumber } from '@/lib/math';
import type { NoticeInput, LpQaInput } from '@/lib/services/co-gp/co-gp';

export type FundLike = { name: string; vehicles?: Array<{ name: string }> | null };

export type CapitalCallLike = {
  amountKrw: unknown;
  callDate?: Date | string | null;
  dueDate?: Date | string | null;
  purpose?: string | null;
};

export type DistributionLike = {
  amountKrw: unknown;
  distributionDate?: Date | string | null;
  purpose?: string | null;
};

/** Format a date-ish value to YYYY-MM-DD; '' when absent/invalid. */
export function isoDate(value?: Date | string | null): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function vehicleName(fund: FundLike): string | null {
  return fund.vehicles?.[0]?.name ?? null;
}

export function capitalCallToNoticeInput(
  fund: FundLike,
  call: CapitalCallLike,
  noticeDate: string
): NoticeInput {
  return {
    kind: 'CAPITAL_CALL',
    fundName: fund.name,
    vehicleName: vehicleName(fund),
    noticeDate,
    // Payment is due on dueDate when set, else the call date itself.
    actionDate: isoDate(call.dueDate ?? call.callDate),
    totalAmountKrw: toNumber(call.amountKrw, 0),
    reason: call.purpose ?? null
  };
}

export function distributionToNoticeInput(
  fund: FundLike,
  distribution: DistributionLike,
  noticeDate: string
): NoticeInput {
  return {
    kind: 'DISTRIBUTION',
    fundName: fund.name,
    vehicleName: vehicleName(fund),
    noticeDate,
    actionDate: isoDate(distribution.distributionDate),
    totalAmountKrw: toNumber(distribution.amountKrw, 0),
    reason: distribution.purpose ?? null
  };
}

export type PcapLike = {
  navKrw: number;
  totals: { dpiMultiple: number; tvpiMultiple: number; irrPct: number | null };
};

export type DealForLpQa = { dealCode: string; title: string; stage?: string | null };

const MAX_QA_DEALS = 8;

export function buildLpQaInput(params: {
  question: string;
  asOf: string;
  fundName?: string | null;
  pcap?: PcapLike | null;
  deals?: DealForLpQa[];
}): LpQaInput {
  const fund =
    params.fundName && params.pcap
      ? {
          name: params.fundName,
          navKrw: params.pcap.navKrw,
          dpi: params.pcap.totals.dpiMultiple,
          tvpi: params.pcap.totals.tvpiMultiple,
          irrPct: params.pcap.totals.irrPct
        }
      : null;

  const deals = (params.deals ?? []).slice(0, MAX_QA_DEALS).map((d) => ({
    dealCode: d.dealCode,
    assetName: d.title,
    stage: d.stage ?? null
  }));

  return { question: params.question, asOf: params.asOf, fund, deals };
}
