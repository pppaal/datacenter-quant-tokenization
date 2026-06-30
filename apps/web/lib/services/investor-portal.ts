/**
 * LP portal read-only view assembler (benchmark #1 — LP portal foundation).
 *
 * Turns an investor's already-fetched per-fund capital-account data (the `LpStatement`
 * rows from `buildPcap`/`buildFundPcap`) into a safe, investor-scoped, read-only payload
 * for an LP-facing surface. PURE and DB-free so it is fully unit-testable.
 *
 * Safety properties enforced here:
 *   - SCOPED: only funds whose statement.investorId matches the requested investor are
 *     included; a mismatched row is dropped (never another LP's data).
 *   - READ-ONLY / minimal: exposes the LP's own capital account + high-level fund metrics
 *     (NAV total, a data-quality flag, asset COUNT) — never per-asset prices, cost basis,
 *     or other investors' statements.
 *
 * The token check + DB fetch live elsewhere (security-reviewed middleware + route); this
 * module only shapes data it is handed.
 */
import type { LpStatement } from '@/lib/services/fund-nav';

export type LpPortalFundInput = {
  fundId: string;
  fundName: string;
  vehicleName?: string | null;
  navKrw: number;
  navUsedCostBasisFallback?: boolean;
  assetCount?: number;
  /** This investor's statement for the fund (from `buildPcap(...).investors`). */
  statement: LpStatement;
};

export type LpPortalFundView = {
  fundId: string;
  fundName: string;
  vehicleName: string | null;
  capitalAccount: LpStatement;
  fundMetrics: {
    navKrw: number;
    navUsedCostBasisFallback: boolean;
    assetCount: number;
  };
};

export type LpPortalView = {
  investorId: string;
  investorCode: string | null;
  investorName: string | null;
  funds: LpPortalFundView[];
  summary: {
    fundCount: number;
    committedKrw: number;
    calledKrw: number;
    distributedKrw: number;
    unfundedKrw: number;
    navShareKrw: number;
  };
};

export function buildLpPortalView(
  investor: { id: string; code?: string | null; name?: string | null },
  funds: LpPortalFundInput[]
): LpPortalView {
  // SCOPE: keep only this investor's own statements.
  const scoped = funds.filter((f) => f.statement.investorId === investor.id);

  const fundViews: LpPortalFundView[] = scoped.map((f) => ({
    fundId: f.fundId,
    fundName: f.fundName,
    vehicleName: f.vehicleName ?? null,
    capitalAccount: f.statement,
    fundMetrics: {
      navKrw: f.navKrw,
      navUsedCostBasisFallback: f.navUsedCostBasisFallback ?? false,
      assetCount: f.assetCount ?? 0
    }
  }));

  const summary = fundViews.reduce(
    (acc, f) => {
      acc.committedKrw += f.capitalAccount.committedKrw;
      acc.calledKrw += f.capitalAccount.calledKrw;
      acc.distributedKrw += f.capitalAccount.distributedKrw;
      acc.unfundedKrw += f.capitalAccount.unfundedKrw;
      acc.navShareKrw += f.capitalAccount.navShareKrw;
      return acc;
    },
    {
      fundCount: fundViews.length,
      committedKrw: 0,
      calledKrw: 0,
      distributedKrw: 0,
      unfundedKrw: 0,
      navShareKrw: 0
    }
  );

  return {
    investorId: investor.id,
    investorCode: investor.code ?? null,
    investorName: investor.name ?? null,
    funds: fundViews,
    summary
  };
}
