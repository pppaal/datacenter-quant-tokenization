/**
 * Pros & Cons Aggregator.
 *
 * Pulls structured pros/cons from every scoring engine the report already
 * runs (verdict, macro deal-risk, tenant-credit, debt-sourcing, refinancing,
 * optionally ESG) and emits a normalized ProsConsItem[] with severity.
 *
 * This is an adapter, not a new scoring model — it re-uses the underlying
 * scores so the pros/cons stay consistent with the verdict.
 *
 * Severity scale:
 *   1 = minor / informational
 *   2 = meaningful but not deal-breaking
 *   3 = material — should be flagged in the IC memo headline
 *
 * Net sentiment combines weighted severities; any severity-3 con drags the
 * verdict toward NEGATIVE because materials should not be averaged away.
 */
import type { InvestmentVerdict } from '@/lib/services/valuation/investment-verdict';
import type { DealMacroExposure } from '@/lib/services/macro/deal-risk';
import type { RentDefaultProjection } from '@/lib/services/valuation/tenant-credit';
import type { DebtSourcingResult } from '@/lib/services/valuation/debt-sourcing';
import type { RefinanceAnalysis } from '@/lib/services/valuation/refinancing';
import type { EsgScore } from '@/lib/services/valuation/esg';
import type { IdiosyncraticRiskReport } from '@/lib/services/valuation/idiosyncratic-risk';

export type ProsConsCategory =
  | 'returns'
  | 'risk'
  | 'tenant'
  | 'debt'
  | 'macro'
  | 'esg'
  | 'liquidity'
  | 'idiosyncratic';

export type ProsConsSentiment = 'pro' | 'con';
export type ProsConsSeverity = 1 | 2 | 3;

export type ProsConsItem = {
  category: ProsConsCategory;
  sentiment: ProsConsSentiment;
  severity: ProsConsSeverity;
  fact: string;
  source: string;
  metric?: number;
};

export type ProsConsReport = {
  pros: ProsConsItem[];
  cons: ProsConsItem[];
  summary: {
    totalPros: number;
    totalCons: number;
    materialCons: number;
    materialPros: number;
    netSentiment: 'POSITIVE' | 'BALANCED' | 'NEGATIVE';
    headline: string;
  };
};

export type ProsConsInputs = {
  verdict: InvestmentVerdict;
  macroExposure: DealMacroExposure;
  tenantCredit: RentDefaultProjection | null;
  debtSourcing: DebtSourcingResult;
  refinancing: RefinanceAnalysis;
  esg?: EsgScore;
  idiosyncraticRisk?: IdiosyncraticRiskReport;
};

// ---------------------------------------------------------------------------
// Severity mapping helpers
// ---------------------------------------------------------------------------

// Map a verdict dim score (-3..+3 continuous) to a 1-3 severity bucket.
// Very small magnitudes are dropped (returned as null) — they aren't worth
// listing as either pro or con.
function severityFromScore(score: number): ProsConsSeverity | null {
  const m = Math.abs(score);
  if (m < 0.5) return null;
  if (m < 1.5) return 1;
  if (m < 2.5) return 2;
  return 3;
}

function categoryForVerdictDim(dimensionName: string): ProsConsCategory {
  switch (dimensionName) {
    case 'Base Levered IRR':
    case 'P50 MOIC':
      return 'returns';
    case 'P10 Downside IRR':
    case 'Prob(IRR < 8%)':
    case 'DSCR Covenant':
      return 'risk';
    case 'Macro Risk':
      return 'macro';
    case 'Refinance Pressure':
      return 'debt';
    default:
      return 'risk';
  }
}

// ---------------------------------------------------------------------------
// Per-source extractors
// ---------------------------------------------------------------------------

function fromVerdict(verdict: InvestmentVerdict): ProsConsItem[] {
  const items: ProsConsItem[] = [];
  for (const dim of verdict.dimensions) {
    const sev = severityFromScore(dim.score);
    if (sev === null) continue;
    const sentiment: ProsConsSentiment = dim.score > 0 ? 'pro' : 'con';
    items.push({
      category: categoryForVerdictDim(dim.dimension),
      sentiment,
      severity: sev,
      fact: `${dim.dimension}: ${dim.observed} (score ${dim.score >= 0 ? '+' : ''}${dim.score.toFixed(2)})`,
      source: 'investment-verdict',
      metric: dim.score
    });
  }
  return items;
}

function fromMacroExposure(macro: DealMacroExposure): ProsConsItem[] {
  const items: ProsConsItem[] = [];

  // Mitigants → pros, riskFactors → cons. Severity tied to the band.
  const conSeverity: ProsConsSeverity =
    macro.band === 'CRITICAL' ? 3 : macro.band === 'HIGH' ? 3 : macro.band === 'MODERATE' ? 2 : 1;
  const proSeverity: ProsConsSeverity = macro.band === 'LOW' ? 2 : 1;

  for (const m of macro.mitigants) {
    items.push({
      category: 'macro',
      sentiment: 'pro',
      severity: proSeverity,
      fact: m,
      source: 'deal-macro-exposure'
    });
  }
  for (const r of macro.riskFactors) {
    items.push({
      category: 'macro',
      sentiment: 'con',
      severity: conSeverity,
      fact: r,
      source: 'deal-macro-exposure'
    });
  }

  // Always emit an overall band marker — readers expect a single line summarizing macro.
  items.push({
    category: 'macro',
    sentiment: macro.band === 'LOW' ? 'pro' : 'con',
    severity: conSeverity,
    fact: `Macro exposure ${macro.band} (${macro.overallScore}/100): ${macro.summary}`,
    source: 'deal-macro-exposure',
    metric: macro.overallScore
  });

  return items;
}

function fromTenantCredit(tc: RentDefaultProjection | null): ProsConsItem[] {
  if (!tc) return [];
  const items: ProsConsItem[] = [];

  const isIg = ['AAA', 'AA', 'A', 'BBB'].includes(tc.weightedGrade);
  const isStress = ['B', 'CCC'].includes(tc.weightedGrade);

  if (isIg) {
    items.push({
      category: 'tenant',
      sentiment: 'pro',
      severity: tc.weightedGrade === 'AAA' || tc.weightedGrade === 'AA' ? 3 : 2,
      fact: `Weighted tenant credit ${tc.weightedGrade} — investment grade (1y PD ${tc.weightedPd1yrPct.toFixed(2)}%)`,
      source: 'tenant-credit',
      metric: tc.weightedPd1yrPct
    });
  } else if (isStress) {
    items.push({
      category: 'tenant',
      sentiment: 'con',
      severity: 3,
      fact: `Weighted tenant credit ${tc.weightedGrade} — sub-investment grade with 1y PD ${tc.weightedPd1yrPct.toFixed(2)}%, expected annual rent loss ₩${formatKrw(tc.expectedAnnualRentLossKrw)}`,
      source: 'tenant-credit',
      metric: tc.weightedPd1yrPct
    });
  } else {
    // BB — borderline
    items.push({
      category: 'tenant',
      sentiment: 'con',
      severity: 2,
      fact: `Weighted tenant credit ${tc.weightedGrade} — speculative grade (1y PD ${tc.weightedPd1yrPct.toFixed(2)}%)`,
      source: 'tenant-credit',
      metric: tc.weightedPd1yrPct
    });
  }

  // Concentration risk: any single tenant > 40% of rent
  const total = tc.totalAnnualRentKrw;
  if (total > 0) {
    const top = [...tc.breakdown].sort((a, b) => b.annualRentKrw - a.annualRentKrw)[0];
    if (top && top.annualRentKrw / total > 0.4) {
      const sharePct = (top.annualRentKrw / total) * 100;
      items.push({
        category: 'tenant',
        sentiment: 'con',
        severity: sharePct > 60 ? 3 : 2,
        fact: `Tenant concentration: ${top.companyName} = ${sharePct.toFixed(0)}% of rent (single-tenant default risk)`,
        source: 'tenant-credit',
        metric: sharePct
      });
    } else if (top && tc.breakdown.length >= 3 && top.annualRentKrw / total < 0.3) {
      items.push({
        category: 'tenant',
        sentiment: 'pro',
        severity: 1,
        fact: `Tenant base diversified across ${tc.breakdown.length} tenants (top ${((top.annualRentKrw / total) * 100).toFixed(0)}%)`,
        source: 'tenant-credit'
      });
    }
  }

  // Effective credit reserve drag — high reserve % is a structural cost
  if (tc.effectiveCreditReservePct >= 5) {
    items.push({
      category: 'tenant',
      sentiment: 'con',
      severity: tc.effectiveCreditReservePct >= 10 ? 3 : 2,
      fact: `Required credit reserve ${tc.effectiveCreditReservePct.toFixed(1)}% of rent — meaningful drag on net cashflow`,
      source: 'tenant-credit',
      metric: tc.effectiveCreditReservePct
    });
  }

  return items;
}

function fromDebtSourcing(ds: DebtSourcingResult): ProsConsItem[] {
  const items: ProsConsItem[] = [];
  const eligible = ds.eligibleCount;
  const top = ds.recommendedTopN[0];

  if (eligible >= 5) {
    items.push({
      category: 'debt',
      sentiment: 'pro',
      severity: 2,
      fact: `${eligible} eligible lenders — competitive financing market`,
      source: 'debt-sourcing',
      metric: eligible
    });
  } else if (eligible >= 1) {
    items.push({
      category: 'debt',
      sentiment: 'con',
      severity: eligible === 1 ? 2 : 1,
      fact: `Only ${eligible} eligible lender${eligible > 1 ? 's' : ''} — thin debt market for this profile`,
      source: 'debt-sourcing',
      metric: eligible
    });
  } else {
    items.push({
      category: 'debt',
      sentiment: 'con',
      severity: 3,
      fact: 'No eligible lenders for this debt profile — financing assumption at risk',
      source: 'debt-sourcing',
      metric: 0
    });
  }

  if (top && top.indicativeSpreadBps !== null && top.indicativeSpreadBps !== undefined) {
    if (top.indicativeSpreadBps <= 200) {
      items.push({
        category: 'debt',
        sentiment: 'pro',
        severity: 1,
        fact: `Tight indicative spread ${top.indicativeSpreadBps}bps from top lender`,
        source: 'debt-sourcing',
        metric: top.indicativeSpreadBps
      });
    } else if (top.indicativeSpreadBps >= 350) {
      items.push({
        category: 'debt',
        sentiment: 'con',
        severity: 2,
        fact: `Wide indicative spread ${top.indicativeSpreadBps}bps — financing cost stress`,
        source: 'debt-sourcing',
        metric: top.indicativeSpreadBps
      });
    }
  }

  return items;
}

function fromRefinancing(refi: RefinanceAnalysis): ProsConsItem[] {
  const items: ProsConsItem[] = [];
  const critical = refi.triggers.filter((t) => t.severity === 'CRITICAL');
  const warning = refi.triggers.filter((t) => t.severity === 'WARNING');

  if (critical.length > 0) {
    items.push({
      category: 'debt',
      sentiment: 'con',
      severity: 3,
      fact: `${critical.length} CRITICAL refi trigger${critical.length > 1 ? 's' : ''}: ${critical.map((t) => `Y${t.year} ${t.reason}`).join('; ')}`,
      source: 'refinancing',
      metric: critical.length
    });
  }
  if (warning.length >= 2) {
    items.push({
      category: 'debt',
      sentiment: 'con',
      severity: 2,
      fact: `${warning.length} WARNING refi triggers — review structure pre-close`,
      source: 'refinancing',
      metric: warning.length
    });
  }

  // Find any savings opportunity scenario
  const bestRefi = refi.scenarios
    .filter(
      (s) => s.annualDebtServiceSavingKrw > 0 && s.breakEvenYears !== null && s.breakEvenYears < 4
    )
    .sort((a, b) => b.annualDebtServiceSavingKrw - a.annualDebtServiceSavingKrw)[0];
  if (bestRefi) {
    items.push({
      category: 'debt',
      sentiment: 'pro',
      severity: 1,
      fact: `Refi at Y${bestRefi.refiYear} (${bestRefi.newRatePct.toFixed(2)}%) saves ₩${formatKrw(bestRefi.annualDebtServiceSavingKrw)}/yr, ${bestRefi.breakEvenYears}y breakeven`,
      source: 'refinancing',
      metric: bestRefi.annualDebtServiceSavingKrw
    });
  }

  return items;
}

function fromIdiosyncraticRisk(report: IdiosyncraticRiskReport | undefined): ProsConsItem[] {
  if (!report || report.factors.length === 0) return [];
  const items: ProsConsItem[] = [];

  // Per-factor cons. Severity mapping mirrors macro-band cons:
  // CRITICAL → 3, HIGH → 3, MEDIUM → 2, LOW → drop (don't list as con).
  for (const f of report.factors) {
    if (f.severity === 'LOW') continue;
    const sev: ProsConsSeverity = f.severity === 'CRITICAL' || f.severity === 'HIGH' ? 3 : 2;
    items.push({
      category: 'idiosyncratic',
      sentiment: 'con',
      severity: sev,
      fact: `${f.label}: ${f.evidence}` + (f.recommendation ? ` — ${f.recommendation}` : ''),
      source: 'idiosyncratic-risk',
      metric: f.score
    });
  }

  // If everything is benign, surface that as a single low-severity pro so the
  // pros side isn't artificially empty when DD is clean.
  const allLow = report.factors.every((f) => f.severity === 'LOW');
  if (allLow) {
    items.push({
      category: 'idiosyncratic',
      sentiment: 'pro',
      severity: 1,
      fact: `Asset-specific risk profile is benign across ${report.factors.length} factor(s) reviewed`,
      source: 'idiosyncratic-risk',
      metric: report.overallScore
    });
  }

  return items;
}

function fromEsg(esg: EsgScore | undefined): ProsConsItem[] {
  if (!esg) return [];
  const items: ProsConsItem[] = [];

  if (esg.overall >= 70) {
    items.push({
      category: 'esg',
      sentiment: 'pro',
      severity: esg.overall >= 85 ? 3 : 2,
      fact: `ESG score ${esg.overall}/100 — strong green premium / RE100-compatible`,
      source: 'esg',
      metric: esg.overall
    });
  } else if (esg.overall < 40) {
    items.push({
      category: 'esg',
      sentiment: 'con',
      severity: 2,
      fact: `Low ESG score ${esg.overall}/100 — limits institutional / RE100 tenant pool`,
      source: 'esg',
      metric: esg.overall
    });
  }

  if (esg.stranding === 'HIGH') {
    items.push({
      category: 'esg',
      sentiment: 'con',
      severity: 3,
      fact: 'HIGH stranding risk — weak energy grade + no certification, exit value at risk in 2028+ regime',
      source: 'esg'
    });
  } else if (esg.stranding === 'MODERATE') {
    items.push({
      category: 'esg',
      sentiment: 'con',
      severity: 2,
      fact: 'Moderate stranding risk — partial certification, retrofit may be required',
      source: 'esg'
    });
  } else {
    items.push({
      category: 'esg',
      sentiment: 'pro',
      severity: 1,
      fact: 'Low stranding risk — meets current efficiency expectations',
      source: 'esg'
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Net sentiment & headline
// ---------------------------------------------------------------------------

function netSentimentOf(
  pros: ProsConsItem[],
  cons: ProsConsItem[]
): { net: 'POSITIVE' | 'BALANCED' | 'NEGATIVE'; headline: string } {
  const proWeight = pros.reduce((s, p) => s + p.severity, 0);
  const conWeight = cons.reduce((s, c) => s + c.severity, 0);
  const materialCons = cons.filter((c) => c.severity === 3).length;
  const materialPros = pros.filter((p) => p.severity === 3).length;

  // Material cons drag sentiment regardless of count balance: 2+ material cons
  // can't be NEGATIVE-defeated by pro count alone.
  let net: 'POSITIVE' | 'BALANCED' | 'NEGATIVE';
  if (materialCons >= 2) {
    net = 'NEGATIVE';
  } else if (materialCons === 1 && materialPros === 0) {
    net = conWeight > proWeight ? 'NEGATIVE' : 'BALANCED';
  } else if (proWeight >= conWeight * 1.5) {
    net = 'POSITIVE';
  } else if (conWeight >= proWeight * 1.5) {
    net = 'NEGATIVE';
  } else {
    net = 'BALANCED';
  }

  const headline =
    net === 'POSITIVE'
      ? `Net positive: ${pros.length} pros (weight ${proWeight}) outweigh ${cons.length} cons (weight ${conWeight}).`
      : net === 'NEGATIVE'
        ? `Net negative: ${cons.length} cons (weight ${conWeight}, ${materialCons} material) outweigh ${pros.length} pros (weight ${proWeight}).`
        : `Balanced: ${pros.length} pros (weight ${proWeight}) vs ${cons.length} cons (weight ${conWeight}).`;
  return { net, headline };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildProsConsReport(inputs: ProsConsInputs): ProsConsReport {
  const all: ProsConsItem[] = [
    ...fromVerdict(inputs.verdict),
    ...fromMacroExposure(inputs.macroExposure),
    ...fromTenantCredit(inputs.tenantCredit),
    ...fromDebtSourcing(inputs.debtSourcing),
    ...fromRefinancing(inputs.refinancing),
    ...fromIdiosyncraticRisk(inputs.idiosyncraticRisk),
    ...fromEsg(inputs.esg)
  ];

  // Sort: severity desc, then category for determinism. Pros first within sev tier.
  const compareItems = (a: ProsConsItem, b: ProsConsItem): number => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.fact.localeCompare(b.fact);
  };

  const pros = all.filter((i) => i.sentiment === 'pro').sort(compareItems);
  const cons = all.filter((i) => i.sentiment === 'con').sort(compareItems);

  const materialCons = cons.filter((c) => c.severity === 3).length;
  const materialPros = pros.filter((p) => p.severity === 3).length;
  const { net, headline } = netSentimentOf(pros, cons);

  return {
    pros,
    cons,
    summary: {
      totalPros: pros.length,
      totalCons: cons.length,
      materialCons,
      materialPros,
      netSentiment: net,
      headline
    }
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatKrw(krw: number): string {
  const abs = Math.abs(krw);
  if (abs >= 1e12) return `${(krw / 1e12).toFixed(1)}T`;
  if (abs >= 1e8) return `${(krw / 1e8).toFixed(1)}억`;
  if (abs >= 1e6) return `${(krw / 1e6).toFixed(1)}M`;
  return krw.toLocaleString();
}
