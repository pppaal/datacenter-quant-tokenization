/**
 * End-to-end valuation walkthrough for a hypothetical Apgujeong edge data center.
 * Runs every pipeline stage with printed intermediate numbers. No DB / no API keys.
 *
 * Usage: npx tsx scripts/apgujeong-walkthrough.ts
 */

import { computeCostApproach } from '@/lib/services/valuation/cost-approach';
import { computeLeaseDcf } from '@/lib/services/valuation/lease-dcf';
import { buildDebtSchedule } from '@/lib/services/valuation/project-finance';
import { computeEquityWaterfall } from '@/lib/services/valuation/equity-waterfall';
import { computeReturnMetrics } from '@/lib/services/valuation/return-metrics';
import { buildStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import { dataCenterScenarioInputs } from '@/lib/services/valuation/data-center-config';
import {
  buildCapRateExitSensitivity,
  buildOccupancyRentSensitivity,
  buildInterestRateSensitivity,
  buildMacroDrivenSensitivity
} from '@/lib/services/valuation/sensitivity';
import {
  runMacroStressAnalysis,
  runFactorAttribution
} from '@/lib/services/valuation/macro-stress';
import type { PreparedUnderwritingInputs } from '@/lib/services/valuation/types';
import type { MacroStressScenario } from '@/lib/services/macro/deal-risk';

const B = 1_000_000_000;

function hr(char = '─', width = 78) {
  return char.repeat(width);
}

function section(title: string) {
  console.log('\n' + hr('═'));
  console.log('  ' + title);
  console.log(hr('═'));
}

function sub(title: string) {
  console.log('\n' + hr('─'));
  console.log('  ' + title);
  console.log(hr('─'));
}

function krw(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return 'N/A';
  const billions = value / B;
  return `${billions.toFixed(decimals)}B KRW`;
}

function pct(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(decimals)}%`;
}

function num(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return 'N/A';
  return value.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// Apgujeong edge datacenter — hypothetical premium urban asset
// ---------------------------------------------------------------------------

function buildApgujeongInputs(): PreparedUnderwritingInputs {
  const totalCapexKrw = 103.8 * B;
  const landKrw = 45 * B;    // ~1,500 sqm @ 30M KRW/sqm, Apgujeong-ro prime
  const shellKrw = 9 * B;
  const electricalKrw = 15 * B;
  const mechanicalKrw = 10 * B;
  const itFitOutKrw = 8 * B;
  const softKrw = 10 * B;
  const contingencyKrw = 5 * B;
  const hardKrw = shellKrw + electricalKrw + mechanicalKrw + itFitOutKrw;

  return {
    bundle: {
      asset: {
        id: 'apgujeong-edge-01',
        assetCode: 'APGUJEONG-EDGE-01',
        name: 'Apgujeong Edge Data Center',
        assetClass: 'DATA_CENTER',
        market: 'KR',
        stage: 'STABILIZED',
        financingLtvPct: 55,
        financingRatePct: 5.3,
        occupancyAssumptionPct: 82,
        capexAssumptionKrw: totalCapexKrw,
        opexAssumptionKrw: 5.5 * B,
        powerCapacityMw: 6,
        targetItLoadMw: 5
      },
      leases: [],
      debtFacilities: [],
      capexLineItems: []
    } as unknown as PreparedUnderwritingInputs['bundle'],
    stage: 'STABILIZED',
    capacityMw: 6,
    capacityKw: 5000,           // IT load
    occupancyPct: 82,
    baseMonthlyRatePerKwKrw: 280_000,      // premium Gangnam rate
    baseCapRatePct: 5.8,                   // prime location → tight cap
    baseDiscountRatePct: 8.8,
    baseDebtCostPct: 5.3,
    baseReplacementCostPerMwKrw: 9.8 * B,  // urban construction premium
    powerPriceKrwPerKwh: 145,
    pueTarget: 1.35,
    annualGrowthPct: 2.8,
    baseOpexKrw: 5.5 * B,
    stageFactor: 1,
    permitPenalty: 1,
    floodPenalty: 1,
    wildfirePenalty: 1,
    locationPremium: 1.15,                 // Apgujeong premium
    comparableCalibration: {
      entryCount: 0,
      weightedCapRatePct: null,
      weightedMonthlyRatePerKwKrw: null,
      weightedDiscountRatePct: null,
      weightedValuePerMwKrw: null,
      directComparableValueKrw: null
    },
    capexBreakdown: {
      totalCapexKrw,
      landValueKrw: landKrw,
      shellCoreKrw: shellKrw,
      electricalKrw,
      mechanicalKrw,
      itFitOutKrw,
      softCostKrw: softKrw,
      contingencyKrw,
      hardCostKrw: hardKrw,
      embeddedCostKrw: 0
    },
    taxProfile: {
      acquisitionTaxPct: 4.6,
      vatRecoveryPct: 90,
      propertyTaxPct: 0.35,
      insurancePct: 0.12,
      corporateTaxPct: 24.2,
      withholdingTaxPct: 15.4,
      exitTaxPct: 1
    },
    spvProfile: {
      legalStructure: 'SPC',
      managementFeePct: 1.25,
      performanceFeePct: 8,
      promoteThresholdPct: 10,
      promoteSharePct: 15,
      reserveTargetMonths: 6
    },
    macroRegime: {
      guidance: {
        summary: [],
        discountRateShiftPct: 0,
        exitCapRateShiftPct: 0,
        debtCostShiftPct: 0,
        occupancyShiftPct: 0,
        growthShiftPct: 0,
        replacementCostShiftPct: 0
      }
    } as unknown as PreparedUnderwritingInputs['macroRegime'],
    leases: [],
    debtFacilities: [],
    documentFeatureOverrides: {
      occupancyPct: null,
      monthlyRatePerKwKrw: null,
      capRatePct: null,
      discountRatePct: null,
      capexKrw: null,
      contractedKw: null,
      permitStatusNote: null,
      sourceVersion: null
    },
    curatedFeatureOverrides: {
      marketInputs: {
        monthlyRatePerKwKrw: null, capRatePct: null, discountRatePct: null,
        debtCostPct: null, constructionCostPerMwKrw: null, note: null, sourceVersion: null
      },
      satelliteRisk: {
        floodRiskScore: null, wildfireRiskScore: null, climateNote: null, sourceVersion: null
      },
      permitInputs: {
        permitStage: null, powerApprovalStatus: null, timelineNote: null, sourceVersion: null
      },
      powerMicro: {
        utilityName: null, substationDistanceKm: null, tariffKrwPerKwh: null,
        renewableAvailabilityPct: null, pueTarget: null, backupFuelHours: null, sourceVersion: null
      },
      revenueMicro: {
        primaryTenant: null, leasedKw: null, baseRatePerKwKrw: null, termYears: null,
        probabilityPct: null, annualEscalationPct: null, sourceVersion: null
      },
      legalMicro: {
        ownerName: null, ownerEntityType: null, ownershipPct: null, encumbranceType: null,
        encumbranceHolder: null, securedAmountKrw: null, priorityRank: null,
        constraintType: null, constraintTitle: null, constraintSeverity: null, sourceVersion: null
      },
      reviewReadiness: {
        readinessStatus: null, reviewPhase: null, legalStructure: null,
        nextAction: null, sourceVersion: null
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Main walkthrough
// ---------------------------------------------------------------------------

function main() {
  section('STAGE 0 · ASSET PROFILE — Apgujeong Edge Data Center (hypothetical)');
  const prepared = buildApgujeongInputs();

  console.log(`  Location             : Apgujeong-ro, Gangnam-gu, Seoul (premium urban edge-DC)`);
  console.log(`  Power capacity       : ${prepared.capacityMw} MW gross / ${prepared.capacityKw / 1000} MW IT load`);
  console.log(`  Occupancy assumption : ${pct(prepared.occupancyPct)}`);
  console.log(`  Monthly rate per kW  : ${prepared.baseMonthlyRatePerKwKrw.toLocaleString()} KRW`);
  console.log(`  Cap rate (entry)     : ${pct(prepared.baseCapRatePct)}`);
  console.log(`  Discount rate        : ${pct(prepared.baseDiscountRatePct)}`);
  console.log(`  Debt cost            : ${pct(prepared.baseDebtCostPct)}`);
  console.log(`  PUE target           : ${prepared.pueTarget}`);
  console.log(`  Annual growth        : ${pct(prepared.annualGrowthPct)}`);
  console.log(`  Total capex          : ${krw(prepared.capexBreakdown.totalCapexKrw)}`);
  console.log(`    land               : ${krw(prepared.capexBreakdown.landValueKrw)}`);
  console.log(`    hard (shell+MEP+IT): ${krw(prepared.capexBreakdown.hardCostKrw)}`);
  console.log(`    soft + contingency : ${krw(prepared.capexBreakdown.softCostKrw + prepared.capexBreakdown.contingencyKrw)}`);
  console.log(`  Annual opex          : ${krw(prepared.baseOpexKrw)}`);
  console.log(`  LTV                  : 55% → initial debt ~${krw(prepared.capexBreakdown.totalCapexKrw * 0.55)}`);

  const baseScenario = dataCenterScenarioInputs.find((s) => s.name === 'Base')!;

  // -------------------------------------------------------------------------
  // Stage 1 — Cost Approach
  // -------------------------------------------------------------------------
  section('STAGE 1 · COST APPROACH');
  const costApproach = computeCostApproach(prepared, baseScenario);
  console.log(`  Replacement cost      : ${krw(costApproach.replacementCostKrw)}`);
  console.log(`  Replacement floor     : ${krw(costApproach.replacementCostFloorKrw)}`);
  console.log(`  Directly-indicated    : ${krw(costApproach.directComparableValueKrw)}`);
  console.log(`  Location premium      : ${prepared.locationPremium.toFixed(3)}x  (applied upstream to inputs)`);

  // -------------------------------------------------------------------------
  // Stage 2 — Lease DCF
  // -------------------------------------------------------------------------
  section('STAGE 2 · LEASE DCF (10-year hold)');
  const leaseDcf = computeLeaseDcf(prepared, baseScenario);
  console.log(`  Stabilized NOI        : ${krw(leaseDcf.stabilizedNoiKrw)}`);
  console.log(`  Annual revenue        : ${krw(leaseDcf.annualRevenueKrw)}`);
  console.log(`  Annual opex           : ${krw(leaseDcf.annualOpexKrw)}`);
  console.log(`  Terminal value        : ${krw(leaseDcf.terminalValueKrw)} (year ${leaseDcf.terminalYear})`);
  console.log(`  Income approach value : ${krw(leaseDcf.incomeApproachValueKrw)}`);
  console.log(`  Lease-driven value    : ${krw(leaseDcf.leaseDrivenValueKrw)}`);
  console.log('\n  Year-by-year (revenue / NOI / CFADS):');
  for (const y of leaseDcf.years.slice(0, 10)) {
    console.log(
      `    Y${String(y.year).padStart(2)} | rev ${krw(y.totalOperatingRevenueKrw, 1).padStart(10)} · ` +
      `NOI ${krw(y.noiKrw, 1).padStart(10)} · CFADS ${krw(y.cfadsBeforeDebtKrw, 1).padStart(10)}`
    );
  }

  // -------------------------------------------------------------------------
  // Stage 3 — Debt Schedule
  // -------------------------------------------------------------------------
  section('STAGE 3 · DEBT SCHEDULE');
  const debtSchedule = buildDebtSchedule(
    prepared,
    baseScenario,
    leaseDcf.years.map((y) => y.cfadsBeforeDebtKrw)
  );
  console.log(`  Initial debt funding  : ${krw(debtSchedule.initialDebtFundingKrw)}`);
  console.log(`  Ending debt balance   : ${krw(debtSchedule.endingDebtBalanceKrw)}`);
  console.log(`  Reserve requirement   : ${krw(debtSchedule.reserveRequirementKrw)}`);
  const avgDscr = debtSchedule.years
    .map((y) => (y as { dscr: number | null }).dscr)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const avg = avgDscr.length ? avgDscr.reduce((s, v) => s + v, 0) / avgDscr.length : null;
  const worst = avgDscr.length ? Math.min(...avgDscr) : null;
  console.log(`  DSCR avg / worst      : ${num(avg)}x / ${num(worst)}x`);
  console.log('\n  Year-by-year (interest / principal / DSCR):');
  for (const y of debtSchedule.years.slice(0, 10)) {
    // dscr + endingBalanceKrw live on the runtime object but aren't in the exported type
    const yr = y as typeof y & { dscr: number | null; endingBalanceKrw: number };
    console.log(
      `    Y${String(y.year).padStart(2)} | int ${krw(y.interestKrw, 2).padStart(10)} · ` +
      `prin ${krw(y.principalKrw, 2).padStart(10)} · DSCR ${num(yr.dscr).padStart(6)}x · ` +
      `bal ${krw(yr.endingBalanceKrw, 1).padStart(10)}`
    );
  }

  // -------------------------------------------------------------------------
  // Stage 4 — Equity Waterfall
  // -------------------------------------------------------------------------
  section('STAGE 4 · EQUITY WATERFALL');
  const equityWaterfall = computeEquityWaterfall(
    prepared,
    baseScenario,
    costApproach,
    leaseDcf,
    debtSchedule
  );
  console.log(`  Gross exit value      : ${krw(equityWaterfall.grossExitValueKrw)}`);
  console.log(`  Net exit proceeds     : ${krw(equityWaterfall.netExitProceedsKrw)}`);
  console.log(`  Levered equity value  : ${krw(equityWaterfall.leveredEquityValueKrw)}`);

  // -------------------------------------------------------------------------
  // Stage 5 — Return Metrics
  // -------------------------------------------------------------------------
  section('STAGE 5 · RETURN METRICS');
  const returnMetrics = computeReturnMetrics({
    leaseDcf,
    debtSchedule,
    equityWaterfall,
    totalCapexKrw: prepared.capexBreakdown.totalCapexKrw
  });
  console.log(`  Equity IRR            : ${pct(returnMetrics.equityIrr)}`);
  console.log(`  Unleveraged IRR       : ${pct(returnMetrics.unleveragedIrr)}`);
  console.log(`  Equity multiple       : ${num(returnMetrics.equityMultiple)}x`);
  console.log(`  Avg cash-on-cash      : ${pct(returnMetrics.averageCashOnCash)}`);
  console.log(`  Payback year          : ${returnMetrics.paybackYear ?? 'beyond horizon'}`);
  console.log(`  Peak equity exposure  : ${krw(returnMetrics.peakEquityExposureKrw)}`);

  // -------------------------------------------------------------------------
  // Stage 6 — Pro Forma
  // -------------------------------------------------------------------------
  section('STAGE 6 · PRO FORMA BASE CASE SUMMARY');
  const proForma = buildStoredBaseCaseProForma({
    leaseDcf,
    debtSchedule,
    equityWaterfall,
    totalCapexKrw: prepared.capexBreakdown.totalCapexKrw
  });
  const s = proForma.summary;
  console.log(`  Initial equity        : ${krw(s.initialEquityKrw)}`);
  console.log(`  Initial debt          : ${krw(s.initialDebtFundingKrw)}`);
  console.log(`  Gross exit            : ${krw(s.grossExitValueKrw)}`);
  console.log(`  Net exit proceeds     : ${krw(s.netExitProceedsKrw)}`);
  console.log(`  Equity IRR / Multiple : ${pct(s.equityIrr)} · ${num(s.equityMultiple)}x`);
  console.log(`  Payback year          : ${s.paybackYear ?? 'beyond horizon'}`);

  // -------------------------------------------------------------------------
  // Stage 7 — Sensitivity Matrices
  // -------------------------------------------------------------------------
  section('STAGE 7 · SENSITIVITY MATRICES');

  const initialDebt = debtSchedule.initialDebtFundingKrw;
  const totalCapex = prepared.capexBreakdown.totalCapexKrw;
  const stabilizedNoi = leaseDcf.stabilizedNoiKrw;
  const terminalValue = leaseDcf.terminalValueKrw;

  sub('7a · Cap Rate × Exit Cap Rate');
  const capMatrix = buildCapRateExitSensitivity(
    proForma, totalCapex, initialDebt, prepared.baseCapRatePct, prepared.baseCapRatePct + 0.5, stabilizedNoi
  );
  printMatrix(capMatrix);

  sub('7b · Occupancy × Rent');
  const occMatrix = buildOccupancyRentSensitivity(
    proForma, totalCapex, initialDebt, prepared.occupancyPct, terminalValue
  );
  printMatrix(occMatrix);

  sub('7c · Interest Rate Parallel Shift');
  const rateRows = buildInterestRateSensitivity(
    proForma, totalCapex, initialDebt, prepared.baseDebtCostPct, terminalValue, 180
  );
  console.log('     Shift    | IRR       | Multiple');
  for (const row of rateRows) {
    const shift = `${row.shiftBps >= 0 ? '+' : ''}${row.shiftBps}bps`;
    console.log(
      `     ${shift.padEnd(8)} | ${pct(row.equityIrr).padEnd(9)} | ${num(row.equityMultiple)}x`
    );
  }

  // -------------------------------------------------------------------------
  // Stage 8 — Macro Stress (full pipeline re-run)
  // -------------------------------------------------------------------------
  section('STAGE 8 · MACRO STRESS (full pro forma re-run)');

  const scenarios: MacroStressScenario[] = [
    {
      name: 'Trend Continuation',
      description: '6-month projected drift (mild)',
      shocks: { rateShiftBps: 75, spreadShiftBps: 25, vacancyShiftPct: 1.0, growthShiftPct: -0.5, constructionCostShiftPct: 3.0 }
    },
    {
      name: 'Rate Shock',
      description: 'BoK + Fed tightening',
      shocks: { rateShiftBps: 200, spreadShiftBps: 50, vacancyShiftPct: 1.5, growthShiftPct: -1.0, constructionCostShiftPct: 0 }
    },
    {
      name: 'Tail Risk (2-sigma)',
      description: 'Rates + credit + vacancy + growth + cost',
      shocks: { rateShiftBps: 300, spreadShiftBps: 150, vacancyShiftPct: 4.0, growthShiftPct: -2.5, constructionCostShiftPct: 15.0 }
    }
  ];

  const analysis = runMacroStressAnalysis(prepared, scenarios);
  console.log(`  Baseline IRR / Multiple : ${pct(analysis.baseline.equityIrr)} · ${num(analysis.baseline.equityMultiple)}x`);

  for (const sc of analysis.scenarios) {
    sub(`${sc.scenarioName} — ${sc.verdict}`);
    console.log(`  ${sc.description}`);
    console.log(`  IRR (base → stressed) : ${pct(sc.baseline.equityIrr)} → ${pct(sc.stressed.equityIrr)}  (Δ ${num(sc.equityIrrDeltaPct)}pp)`);
    console.log(`  Multiple              : ${num(sc.baseline.equityMultiple)}x → ${num(sc.stressed.equityMultiple)}x  (Δ ${num(sc.equityMultipleDelta)}x)`);
    console.log(`  Worst DSCR            : ${num(sc.worstDscr)}x`);
    console.log(`  Ending debt           : ${krw(sc.stressedEndingDebtKrw)}`);
    console.log(`  → ${sc.commentary}`);
    console.log(`  Line items:`);
    for (const li of sc.lineItemImpacts) {
      const sign = li.deltaPct >= 0 ? '+' : '';
      console.log(`    ${li.label.padEnd(18)} | ${krw(li.baselineKrw, 1).padStart(10)} → ${krw(li.stressedKrw, 1).padStart(10)}  (${sign}${num(li.deltaPct)}%)`);
    }
  }

  // -------------------------------------------------------------------------
  // Stage 9 — Factor Attribution
  // -------------------------------------------------------------------------
  section('STAGE 9 · FACTOR ATTRIBUTION (Tail Risk isolated)');
  const tailRisk = scenarios[2]!;
  const attribution = runFactorAttribution(prepared, tailRisk);
  console.log(`  Scenario              : ${attribution.scenarioName}`);
  console.log(`  Total IRR delta       : ${num(attribution.totalIrrDeltaPct)}pp`);
  console.log(`  Total multiple delta  : ${num(attribution.totalMultipleDelta)}x`);
  console.log('\n  Contribution by factor (sorted by share):');
  const sorted = [...attribution.factors].sort(
    (a, b) => b.contributionShareOfTotalDelta - a.contributionShareOfTotalDelta
  );
  console.log('     Factor            | Isolated IRR Δ  | Share');
  console.log('     ' + hr('─', 50));
  for (const f of sorted) {
    console.log(
      `     ${f.factorLabel.padEnd(18)}| ${num(f.isolatedIrrDeltaPct).padStart(8)}pp    | ${num(f.contributionShareOfTotalDelta, 1).padStart(5)}%`
    );
  }

  // -------------------------------------------------------------------------
  // Stage 10 — Macro-driven Sensitivity (axes derived from scenarios)
  // -------------------------------------------------------------------------
  section('STAGE 10 · MACRO-DRIVEN SENSITIVITY');
  const macroSensitivity = buildMacroDrivenSensitivity({
    proForma,
    totalCapexKrw: totalCapex,
    initialDebtFundingKrw: initialDebt,
    baseInterestRatePct: prepared.baseDebtCostPct,
    baseOccupancyPct: prepared.occupancyPct,
    terminalValueKrw: terminalValue,
    scenarios
  });
  console.log(`  Axis source           : ${macroSensitivity.axisSource}`);
  console.log(`  Rate axis driver      : ${macroSensitivity.rateAxisSourceScenario}`);
  console.log(`  Occupancy axis driver : ${macroSensitivity.occupancyAxisSourceScenario}`);
  console.log(`  Rate axis (bps)       : [${macroSensitivity.rowAxis.values.join(', ')}]`);
  console.log(`  Vacancy axis (%)      : [${macroSensitivity.colAxis.values.join(', ')}]`);
  printMatrix(macroSensitivity);

  console.log('\n' + hr('═'));
  console.log('  WALKTHROUGH COMPLETE.');
  console.log(hr('═') + '\n');
}

function printMatrix(matrix: any) {
  const { rowAxis, colAxis, cells, baseRowIndex, baseColIndex } = matrix;
  const rowLabel = rowAxis.label ?? 'row';
  const colLabel = colAxis.label ?? 'col';
  console.log(`     ${rowLabel} (rows) × ${colLabel} (cols). Base cell marked [·].`);
  const header = '           ' + colAxis.values.map((v: number) => num(v, 1).padStart(9)).join(' ');
  console.log(header);
  for (let r = 0; r < cells.length; r++) {
    const rowHdr = num(rowAxis.values[r], 1).padStart(8);
    const rowVals = cells[r]
      .map((cell: { equityIrr: number | null; equityMultiple: number }, c: number) => {
        const mark = r === baseRowIndex && c === baseColIndex ? '·' : ' ';
        const irr = cell.equityIrr !== null ? cell.equityIrr.toFixed(1) : 'n/a';
        return `${mark}${irr.padStart(6)}  `;
      })
      .join(' ');
    console.log(`     ${rowHdr} | ${rowVals}`);
  }
}

main();
