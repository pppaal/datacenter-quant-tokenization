/**
 * Full-report demo: address → autoAnalyze → buildFullReport → print every layer.
 */

import { autoAnalyzeProperty } from '@/lib/services/property-analyzer/auto-analyze';
import { buildFullReport } from '@/lib/services/property-analyzer/full-report';

const B = 1_000_000_000;
function krw(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  if (Math.abs(v) >= B * 1000) return `${(v / B / 1000).toFixed(d)}T`;
  if (Math.abs(v) >= B) return `${(v / B).toFixed(d)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(d)}M`;
  return Math.round(v).toLocaleString();
}
function pct(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  return `${v.toFixed(d)}%`;
}
function hr(char = '─', w = 92) {
  return char.repeat(w);
}
function section(t: string) {
  console.log('\n' + hr('═') + '\n  ' + t + '\n' + hr('═'));
}
function sub(t: string) {
  console.log('\n' + hr('─') + '\n  ' + t + '\n' + hr('─'));
}

async function main() {
  const address = process.argv[2] ?? '경기도 평택시 고덕면 삼성로 114';
  console.log(`\nFull report for: ${address}`);

  const auto = await autoAnalyzeProperty({ address, includeAlternatives: 0 });
  // Realistic illustrative inputs so the new risk engines have signal to chew on.
  // - Single anchor tenant + 2 small ones (industrial single-purpose typical)
  // - Light deferred CapEx, ~10y building age, no environmental flags by default
  const tenantExposures = [
    {
      tenant: {
        companyId: 'samsung-electronics',
        companyName: 'Samsung Electronics',
        industry: 'TECH' as const,
        fiscalYear: 2024,
        isListed: true,
        totalAssetsKrw: 480_000_000_000_000,
        totalLiabilitiesKrw: 92_000_000_000_000,
        currentAssetsKrw: 218_000_000_000_000,
        currentLiabilitiesKrw: 78_000_000_000_000,
        cashAndEquivalentsKrw: 95_000_000_000_000,
        totalDebtKrw: 12_000_000_000_000,
        revenueKrw: 258_000_000_000_000,
        operatingIncomeKrw: 6_000_000_000_000,
        netIncomeKrw: 15_000_000_000_000,
        interestExpenseKrw: 800_000_000_000,
        operatingCashFlowKrw: 38_000_000_000_000,
        priorYearRevenueKrw: 230_000_000_000_000
      },
      annualRentKrw: 600_000_000,
      leaseRemainingYears: 8
    },
    {
      tenant: {
        companyId: 'midcap-logistics',
        companyName: 'MidCap Logistics',
        industry: 'LOGISTICS' as const,
        fiscalYear: 2024,
        isListed: false,
        totalAssetsKrw: 80_000_000_000,
        totalLiabilitiesKrw: 50_000_000_000,
        currentAssetsKrw: 30_000_000_000,
        currentLiabilitiesKrw: 25_000_000_000,
        cashAndEquivalentsKrw: 5_000_000_000,
        totalDebtKrw: 35_000_000_000,
        revenueKrw: 70_000_000_000,
        operatingIncomeKrw: 3_500_000_000,
        netIncomeKrw: 1_800_000_000,
        interestExpenseKrw: 1_400_000_000,
        operatingCashFlowKrw: 4_000_000_000,
        priorYearRevenueKrw: 65_000_000_000
      },
      annualRentKrw: 200_000_000,
      leaseRemainingYears: 3
    },
    {
      tenant: {
        companyId: 'small-tenant-c',
        companyName: 'Small Tenant Co',
        industry: 'GENERAL' as const,
        fiscalYear: 2024,
        isListed: false,
        totalAssetsKrw: 8_000_000_000,
        totalLiabilitiesKrw: 5_500_000_000,
        currentAssetsKrw: 3_000_000_000,
        currentLiabilitiesKrw: 2_500_000_000,
        cashAndEquivalentsKrw: 400_000_000,
        totalDebtKrw: 4_000_000_000,
        revenueKrw: 12_000_000_000,
        operatingIncomeKrw: 400_000_000,
        netIncomeKrw: 150_000_000,
        interestExpenseKrw: 250_000_000,
        operatingCashFlowKrw: 350_000_000,
        priorYearRevenueKrw: 11_500_000_000
      },
      annualRentKrw: 100_000_000,
      leaseRemainingYears: 2
    }
  ];
  const idiosyncraticRiskInputs = {
    deferredCapexKrw: 800_000_000, // ~0.8% of building value
    buildingAgeYears: 12,
    soilContaminationFlag: false,
    asbestosFlag: false,
    floodZoneFlag: false,
    zoningChangeRisk: 'LOW' as const,
    redevelopmentFreezeFlag: false,
    pendingLitigationFlag: false,
    titleEncumbranceFlag: false
  };
  const report = await buildFullReport(auto, { tenantExposures, idiosyncraticRiskInputs });
  const a = report.autoAnalyze.primaryAnalysis;

  section(`${auto.resolvedAddress.roadAddress} · ${auto.resolvedAddress.districtName}`);
  console.log(
    `  Primary class       : ${a.asset.assetClass} (${report.autoAnalyze.classification.primary.feasibility})`
  );
  console.log(`  Base valuation      : ${krw(a.baseCaseValueKrw)} KRW`);
  console.log(
    `  Scenario range      : ${krw(a.scenarios.find((s) => s.name === 'Bear')?.valuationKrw)} — ${krw(a.scenarios.find((s) => s.name === 'Bull')?.valuationKrw)}`
  );

  sub('1. Macro Regime Interpretation');
  console.log(`  Label   : ${report.macro.regime.label ?? '(n/a)'}`);
  if (report.macro.regime.summary.length === 0) {
    console.log(`  Summary : (empty)`);
  } else {
    for (const line of report.macro.regime.summary.slice(0, 5)) console.log(`  · ${line}`);
  }

  sub('2. Deal Macro Exposure (0-100, higher = worse)');
  const dx = report.macro.dealExposure;
  console.log(`  Overall     : ${dx.overallScore} [${dx.band}] (raw ${dx.rawScore})`);
  console.log(`  Correlation : +${dx.correlationPenalty.appliedPenaltyPct.toFixed(1)}% penalty`);
  for (const d of dx.dimensions) {
    console.log(`    ${d.label.padEnd(22)} ${String(d.score).padStart(3)}  ${d.commentary}`);
  }
  console.log(`  ⇒ ${dx.summary}`);

  sub('3. Macro Stress Tests');
  for (const s of report.macro.stressTests) {
    console.log(
      `  ${s.scenario.name.padEnd(15)} · ${s.verdict.padEnd(11)} · ΔCap ${pct(s.stressedCapRate && s.baselineCapRate ? s.stressedCapRate - s.baselineCapRate : null)} · Value impact ${pct(s.valuationImpactPct)}`
    );
    console.log(`    → ${s.commentary}`);
  }

  sub('4. Pro-Forma Summary (10-year)');
  const pf = report.proForma.summary;
  console.log(`  Year-1 NOI          : ${krw(pf.stabilizedNoiKrw)}`);
  console.log(`  Year-1 Revenue      : ${krw(pf.annualRevenueKrw)}`);
  console.log(`  Terminal Value (Y${pf.terminalYear}) : ${krw(pf.terminalValueKrw)}`);
  console.log(`  Initial Equity      : ${krw(pf.initialEquityKrw)}`);
  console.log(`  Initial Debt        : ${krw(pf.initialDebtFundingKrw)}`);
  console.log(`  Ending Debt Balance : ${krw(pf.endingDebtBalanceKrw)}`);
  console.log(`  Gross Exit Value    : ${krw(pf.grossExitValueKrw)}`);
  console.log(`  Net Exit Proceeds   : ${krw(pf.netExitProceedsKrw)}`);

  sub('5. Return Metrics');
  const rm = report.returnMetrics;
  console.log(`  Equity IRR       : ${pct(rm.equityIrr)}`);
  console.log(`  Unlevered IRR    : ${pct(rm.unleveragedIrr)}`);
  console.log(`  Equity Multiple  : ${rm.equityMultiple.toFixed(2)}x`);
  console.log(`  Avg Cash-on-Cash : ${pct(rm.averageCashOnCash)}`);
  console.log(`  Payback Year     : ${rm.paybackYear ?? 'never'}`);
  console.log(`  Peak Equity      : ${krw(rm.peakEquityExposureKrw)}`);

  sub('6. Debt Covenant (DSCR)');
  const dc = report.debtCovenant;
  console.log(`  Covenant floor   : ${dc.covenantFloor.toFixed(2)}x`);
  console.log(`  Year-1 DSCR      : ${dc.baseYear1Dscr?.toFixed(2) ?? 'N/A'}x`);
  console.log(
    `  Years < ${dc.covenantFloor} : ${dc.yearsBelowFloor.length > 0 ? dc.yearsBelowFloor.join(',') : 'none'}`
  );
  console.log(
    `  Years < 1.00x    : ${dc.yearsBelowOne.length > 0 ? dc.yearsBelowOne.join(',') : 'none'}`
  );
  console.log(`  Base breaches    : ${dc.breachesInBase ? 'YES ⚠' : 'NO'}`);

  sub('7. Sensitivity — Cap Rate × Exit Cap Rate (equity IRR)');
  const m = report.sensitivities.capRateExit;
  const header =
    '         Exit:  ' + m.colAxis.values.map((v) => `${v.toFixed(1)}%`.padStart(8)).join('');
  console.log(header);
  for (let r = 0; r < m.cells.length; r++) {
    const row = m.cells[r]!;
    const rowLabel = `Cap ${m.rowAxis.values[r]!.toFixed(1)}%`.padStart(10);
    const cells = row
      .map((c) => (c.equityIrr === null ? '   N/A  ' : `${c.equityIrr.toFixed(1)}%`.padStart(8)))
      .join('');
    console.log(rowLabel + '  ' + cells + (r === m.baseRowIndex ? '  ← base' : ''));
  }

  sub('8. Sensitivity — Interest Rate Shift');
  console.log('     ΔRate    Equity IRR  MOIC    Y1 DSCR');
  for (const row of report.sensitivities.interestRate) {
    console.log(
      `    ${String(row.shiftBps).padStart(5)}bps  ${row.equityIrr === null ? '   N/A' : pct(row.equityIrr).padStart(8)}  ${row.equityMultiple.toFixed(2)}x   ${row.dscrYear1?.toFixed(2) ?? 'N/A'}x`
    );
  }

  sub('9. Macro-Driven Sensitivity (axes from stress scenarios)');
  const md = report.sensitivities.macroDriven;
  console.log(`  Rate axis source     : ${md.rateAxisSourceScenario}`);
  console.log(`  Occupancy axis source: ${md.occupancyAxisSourceScenario}`);
  const hdr2 =
    '       Vacancy:  ' + md.colAxis.values.map((v) => `+${v.toFixed(1)}%`.padStart(8)).join('');
  console.log(hdr2);
  for (let r = 0; r < md.cells.length; r++) {
    const row = md.cells[r]!;
    const rowLabel = `+${md.rowAxis.values[r]!}bps`.padStart(10);
    const cells = row
      .map((c) => (c.equityIrr === null ? '   N/A  ' : `${c.equityIrr.toFixed(1)}%`.padStart(8)))
      .join('');
    console.log(rowLabel + '  ' + cells);
  }

  sub('10. Refinancing Analysis');
  const refi = report.refinancing;
  console.log(`  Triggers detected: ${refi.triggers.length}`);
  for (const t of refi.triggers.slice(0, 5)) {
    console.log(`    [${t.severity}] Y${t.year} — ${t.reason}`);
  }
  console.log(`  Refi scenarios   :`);
  for (const s of refi.scenarios.slice(0, 4)) {
    console.log(
      `    refi Y${s.refiYear} @ ${s.newRatePct.toFixed(2)}% · DS savings ${krw(s.annualDebtServiceSavingKrw)}/yr · break-even ${s.breakEvenYears?.toFixed(1) ?? 'never'}y`
    );
  }
  console.log(`  ⇒ ${refi.recommendation}`);

  sub('11. Monte Carlo — Tail Risk (VaR / CVaR / semi-deviation)');
  const mc = report.monteCarlo;
  const t = mc.leveredIrr.tail;
  console.log(`  Iterations valid : ${mc.validIterations}/${mc.iterations}`);
  console.log(
    `  Levered IRR     P50 ${pct(mc.leveredIrr.p50)}  mean ${pct(mc.leveredIrr.mean)}  σ ${pct(mc.leveredIrr.stdDev)}`
  );
  console.log(
    `  Lower tail      P10 ${pct(mc.leveredIrr.p10)}  P5 ${pct(t.p5)}  P1 ${pct(t.p1)}  worst ${pct(t.worstObserved)}`
  );
  console.log(
    `  Expected Shortfall (CVaR)  ES95 ${pct(t.expectedShortfall95)}  ES99 ${pct(t.expectedShortfall99)}`
  );
  console.log(
    `  Upside          P90 ${pct(mc.leveredIrr.p90)}  P95 ${pct(t.p95)}  P99 ${pct(t.p99)}`
  );
  console.log(`  Semi-deviation (vs ${t.downsideTarget}%) : ${pct(t.downsideDeviation)}`);
  console.log(
    `  Prob(IRR < target) : ${mc.probLeveredIrrBelow.map((b) => `<${b.targetPct}%: ${(b.probability * 100).toFixed(1)}%`).join(' · ')}`
  );

  sub('12. Idiosyncratic (Asset-Specific) Risk');
  const ir = report.idiosyncraticRisk;
  console.log(`  Overall : ${ir.overallScore}/100  [${ir.band}]  — ${ir.summary}`);
  for (const f of ir.factors) {
    console.log(
      `    ${f.label.padEnd(28)} ${String(f.score).padStart(5)}  [${f.severity.padEnd(8)}]  ${f.evidence}`
    );
    if (f.recommendation) console.log(`      → ${f.recommendation}`);
  }

  sub('13. Tenant Credit Overlay');
  const tc = report.tenantCredit;
  if (!tc) {
    console.log('  (no tenant exposures supplied)');
  } else {
    console.log(
      `  Weighted grade   : ${tc.weightedGrade}  (1y PD ${tc.weightedPd1yrPct.toFixed(2)}%)`
    );
    console.log(
      `  Annual rent      : ${krw(tc.totalAnnualRentKrw)}  →  expected loss ${krw(tc.expectedAnnualRentLossKrw)}/yr`
    );
    console.log(`  Effective reserve: ${tc.effectiveCreditReservePct.toFixed(2)}%`);
    for (const b of tc.breakdown) {
      console.log(
        `    ${b.companyName.padEnd(24)} ${b.grade.padEnd(4)} rent ${krw(b.annualRentKrw).padStart(8)}  PD ${b.pd1yrPct.toFixed(2)}%  loss ${krw(b.expectedAnnualLossKrw)}`
      );
    }
  }

  sub('14. Investment Verdict');
  const v = report.verdict;
  console.log(`  Tier        : ${v.tier}  — ${v.headline}`);
  console.log(
    `  Score       : ${v.totalScore.toFixed(2)}/${v.maxPossibleScore}  (normalized ${v.normalizedScore.toFixed(3)})`
  );
  console.log('  Dimensions  :');
  for (const d of v.dimensions) {
    const sign = d.score >= 0 ? '+' : '';
    console.log(
      `    ${d.dimension.padEnd(22)} ${d.observed.padEnd(20)} score ${(sign + d.score.toFixed(2)).padStart(6)} × w${d.weight} = ${(d.contribution >= 0 ? '+' : '') + d.contribution.toFixed(2)}`
    );
  }
  if (v.redFlags.length > 0) {
    console.log('  Red flags   :');
    for (const r of v.redFlags) console.log(`    ⚠ ${r}`);
  }

  sub('15. Pros & Cons (aggregated)');
  const pc = report.prosCons;
  console.log(`  ${pc.summary.headline}`);
  console.log(`  Pros (${pc.pros.length}, ${pc.summary.materialPros} material):`);
  for (const p of pc.pros.slice(0, 8)) {
    console.log(`    [+${p.severity}] (${p.category}) ${p.fact}`);
  }
  console.log(`  Cons (${pc.cons.length}, ${pc.summary.materialCons} material):`);
  for (const c of pc.cons.slice(0, 8)) {
    console.log(`    [-${c.severity}] (${c.category}) ${c.fact}`);
  }

  sub('16. Implied Bid');
  const ib = report.impliedBid;
  console.log(
    `  Target IRR ${pct(ib.targetIrrPct)} → max bid ${krw(ib.atTargetIrr.bidPriceKrw)}  (${pct(ib.atTargetIrr.achievedIrrPct)} achieved)`
  );
  console.log(
    `  Floor  IRR ${pct(ib.floorIrrPct)}  → max bid ${krw(ib.atP10FloorIrr.bidPriceKrw)}   (${pct(ib.atP10FloorIrr.achievedIrrPct)} achieved)`
  );
  console.log(
    `  Δ vs base price (${krw(ib.basePriceKrw)}): target ${pct(ib.atTargetIrr.discountPct)}, floor ${pct(ib.atP10FloorIrr.discountPct)}`
  );

  sub('17. GP/LP Waterfall');
  const wf = report.gpLpWaterfall;
  console.log(
    `  LP IRR ${pct(wf.lpIrrPct)}  ·  GP IRR ${pct(wf.gpIrrPct)}  ·  LP MOIC ${wf.lpMoic.toFixed(2)}x  ·  GP MOIC ${wf.gpMoic.toFixed(2)}x`
  );
  console.log(
    `  GP promote earned: ${krw(wf.gpPromoteEarnedKrw)} (vs pro-rata GP ${krw(wf.proRataGpKrw)})`
  );
  const activeTiers = wf.tiers.filter((tt) => tt.gpKrw > 0 || tt.lpKrw > 0).map((tt) => tt.name);
  console.log(`  Tiers paid: ${activeTiers.length > 0 ? activeTiers.join(' · ') : 'none'}`);

  console.log('\n' + hr('═'));
  console.log('  FULL REPORT COMPLETE');
  console.log(hr('═') + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
