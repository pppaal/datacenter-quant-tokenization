/**
 * Pure presentation helpers for per-LP capital-account (PCAP) statements.
 * DB-free and side-effect-free so they can be unit-tested directly and reused
 * across the admin UI and exports.
 */
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils';
import type { LpStatement } from '@/lib/services/fund-nav';

export type PcapDisplayRow = {
  investorId: string;
  investorLabel: string;
  committed: string;
  called: string;
  distributed: string;
  unfunded: string;
  navShare: string;
  sharePct: string;
  irr: string;
  tvpi: string;
  dpi: string;
  rvpi: string;
  /** True when this LP's cashflow timing was allocated pro-rata (fund-level events). */
  proRataAllocated: boolean;
};

/** Format a single LP statement into display-ready strings. */
export function formatPcapRow(statement: LpStatement): PcapDisplayRow {
  return {
    investorId: statement.investorId,
    investorLabel: statement.investorName ?? statement.investorCode ?? statement.investorId,
    committed: formatCurrency(statement.committedKrw),
    called: formatCurrency(statement.calledKrw),
    distributed: formatCurrency(statement.distributedKrw),
    unfunded: formatCurrency(statement.unfundedKrw),
    navShare: formatCurrency(statement.navShareKrw),
    sharePct: formatPercent(statement.sharePct),
    irr: statement.irrPct == null ? 'n/a' : formatPercent(statement.irrPct),
    tvpi: `${formatNumber(statement.tvpiMultiple, 2)}x`,
    dpi: `${formatNumber(statement.dpiMultiple, 2)}x`,
    rvpi: `${formatNumber(statement.rvpiMultiple, 2)}x`,
    proRataAllocated: statement.cashflowsAllocatedProRata
  };
}
