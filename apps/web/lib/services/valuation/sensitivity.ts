import { computeIrr } from '@/lib/services/valuation/return-metrics';
import type { ProFormaBaseCase } from '@/lib/services/valuation/types';
import type { MacroStressScenario } from '@/lib/services/macro/deal-risk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SensitivityAxis = {
  label: string;
  key: string;
  values: number[];
  unit: '%' | 'bps' | 'x';
};

export type SensitivityCell = {
  row: number;
  col: number;
  equityIrr: number | null;
  equityMultiple: number;
  noiDelta: number;
};

export type SensitivityMatrix = {
  rowAxis: SensitivityAxis;
  colAxis: SensitivityAxis;
  baseRowIndex: number;
  baseColIndex: number;
  cells: SensitivityCell[][];
};

// ---------------------------------------------------------------------------
// Cap Rate × Exit Cap Rate sensitivity
// ---------------------------------------------------------------------------

export function buildCapRateExitSensitivity(
  proForma: ProFormaBaseCase,
  totalCapexKrw: number,
  initialDebtFundingKrw: number,
  baseCapRatePct: number,
  baseExitCapRatePct: number,
  stabilizedNoiKrw: number
): SensitivityMatrix {
  const capRateSteps = [-1.0, -0.5, 0, 0.5, 1.0];
  const exitCapSteps = [-1.0, -0.5, 0, 0.5, 1.0];

  const rowValues = capRateSteps.map((s) => Number((baseCapRatePct + s).toFixed(2)));
  const colValues = exitCapSteps.map((s) => Number((baseExitCapRatePct + s).toFixed(2)));

  const rowAxis: SensitivityAxis = { label: 'Going-In Cap Rate', key: 'capRate', values: rowValues, unit: '%' };
  const colAxis: SensitivityAxis = { label: 'Exit Cap Rate', key: 'exitCapRate', values: colValues, unit: '%' };

  const initialEquityKrw = totalCapexKrw - initialDebtFundingKrw;
  const years = proForma.years;
  const baseNoi = stabilizedNoiKrw;

  const cells: SensitivityCell[][] = rowValues.map((capRate, ri) =>
    colValues.map((exitCap, ci) => {
      const adjustedTerminalValue = exitCap > 0 ? baseNoi / (exitCap / 100) : 0;
      const noiMultiplier = baseCapRatePct > 0 ? capRate / baseCapRatePct : 1;
      const noiDelta = Number((((noiMultiplier - 1) * 100)).toFixed(2));

      const cashFlows: number[] = [-initialEquityKrw];
      for (let i = 0; i < years.length; i++) {
        const year = years[i]!;
        const isTerminal = i === years.length - 1;
        const cf = year.afterTaxDistributionKrw +
          (isTerminal ? adjustedTerminalValue - proForma.summary.endingDebtBalanceKrw : 0);
        cashFlows.push(cf);
      }

      const equityIrr = computeIrr(cashFlows);
      const totalDistributions = years.reduce((sum, y) => sum + y.afterTaxDistributionKrw, 0);
      const totalReturn = totalDistributions + adjustedTerminalValue - proForma.summary.endingDebtBalanceKrw;
      const equityMultiple = initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;

      return { row: ri, col: ci, equityIrr, equityMultiple, noiDelta };
    })
  );

  return {
    rowAxis,
    colAxis,
    baseRowIndex: capRateSteps.indexOf(0),
    baseColIndex: exitCapSteps.indexOf(0),
    cells
  };
}

// ---------------------------------------------------------------------------
// Occupancy × Rent Growth sensitivity
// ---------------------------------------------------------------------------

export function buildOccupancyRentSensitivity(
  proForma: ProFormaBaseCase,
  totalCapexKrw: number,
  initialDebtFundingKrw: number,
  baseOccupancyPct: number,
  terminalValueKrw: number
): SensitivityMatrix {
  const occupancySteps = [-15, -10, -5, 0, 5];
  const rentSteps = [-20, -10, 0, 10, 20];

  const rowValues = occupancySteps.map((s) => Math.min(Number((baseOccupancyPct + s).toFixed(1)), 100));
  const colValues = rentSteps.map((s) => s);

  const rowAxis: SensitivityAxis = { label: 'Occupancy', key: 'occupancy', values: rowValues, unit: '%' };
  const colAxis: SensitivityAxis = { label: 'Revenue Growth', key: 'revenueGrowth', values: colValues, unit: '%' };

  const initialEquityKrw = totalCapexKrw - initialDebtFundingKrw;
  const years = proForma.years;
  const baseRevenue = years.length > 0 ? years[0]!.totalOperatingRevenueKrw : 0;

  const cells: SensitivityCell[][] = rowValues.map((occPct, ri) =>
    colValues.map((rentDelta, ci) => {
      const occMultiplier = baseOccupancyPct > 0 ? occPct / baseOccupancyPct : 1;
      const rentMultiplier = 1 + rentDelta / 100;

      const cashFlows: number[] = [-initialEquityKrw];
      for (let i = 0; i < years.length; i++) {
        const year = years[i]!;
        const isTerminal = i === years.length - 1;
        const adjustedDistribution = year.afterTaxDistributionKrw * occMultiplier * rentMultiplier;
        const adjustedTerminal = isTerminal ? terminalValueKrw * occMultiplier * rentMultiplier
          - proForma.summary.endingDebtBalanceKrw : 0;
        cashFlows.push(adjustedDistribution + adjustedTerminal);
      }

      const equityIrr = computeIrr(cashFlows);
      const totalReturn = cashFlows.slice(1).reduce((sum, cf) => sum + cf, 0);
      const equityMultiple = initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;
      const noiDelta = Number((((occMultiplier * rentMultiplier) - 1) * 100).toFixed(2));

      return { row: ri, col: ci, equityIrr, equityMultiple, noiDelta };
    })
  );

  return {
    rowAxis,
    colAxis,
    baseRowIndex: occupancySteps.indexOf(0),
    baseColIndex: rentSteps.indexOf(0),
    cells
  };
}

// ---------------------------------------------------------------------------
// Interest Rate sensitivity (one-way)
// ---------------------------------------------------------------------------

export type OneWaySensitivityRow = {
  shiftBps: number;
  equityIrr: number | null;
  equityMultiple: number;
  dscrYear1: number | null;
};

export function buildInterestRateSensitivity(
  proForma: ProFormaBaseCase,
  totalCapexKrw: number,
  initialDebtFundingKrw: number,
  baseInterestRatePct: number,
  terminalValueKrw: number,
  _amortTermMonths?: number
): OneWaySensitivityRow[] {
  const shiftsBps = [-200, -100, -50, 0, 50, 100, 200];
  const initialEquityKrw = totalCapexKrw - initialDebtFundingKrw;
  const years = proForma.years;

  return shiftsBps.map((shiftBps) => {
    const rateMultiplier = 1 + (shiftBps / 100) / Math.max(baseInterestRatePct, 1);
    const debtCostFactor = rateMultiplier;

    const cashFlows: number[] = [-initialEquityKrw];
    let firstYearDscr: number | null = null;

    for (let i = 0; i < years.length; i++) {
      const year = years[i]!;
      const isTerminal = i === years.length - 1;
      const adjustedInterest = year.interestKrw * debtCostFactor;
      const adjustedDebtService = adjustedInterest + year.principalKrw;
      const adjustedDistribution = year.afterTaxDistributionKrw + (year.debtServiceKrw - adjustedDebtService);
      const adjustedTerminal = isTerminal
        ? terminalValueKrw - proForma.summary.endingDebtBalanceKrw : 0;

      cashFlows.push(adjustedDistribution + adjustedTerminal);

      if (i === 0) {
        firstYearDscr = adjustedDebtService > 0
          ? Number((year.cfadsBeforeDebtKrw / adjustedDebtService).toFixed(2))
          : null;
      }
    }

    const equityIrr = computeIrr(cashFlows);
    const totalReturn = cashFlows.slice(1).reduce((sum, cf) => sum + cf, 0);
    const equityMultiple = initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;

    return { shiftBps, equityIrr, equityMultiple, dscrYear1: firstYearDscr };
  });
}

// ---------------------------------------------------------------------------
// Macro-driven sensitivity: steps derived from dynamic macro scenarios
// ---------------------------------------------------------------------------
//
// Instead of hardcoded symmetric ranges, this builds a sensitivity matrix
// whose axes are bounded by the actual shocks proposed by the macro engine
// (e.g. trend continuation = +50bps rates, tail risk = +250bps rates). The
// result reflects what the market is actually signaling, not arbitrary bands.

export type MacroDrivenSensitivityInput = {
  proForma: ProFormaBaseCase;
  totalCapexKrw: number;
  initialDebtFundingKrw: number;
  baseInterestRatePct: number;
  baseOccupancyPct: number;
  terminalValueKrw: number;
  scenarios: MacroStressScenario[];
};

export type MacroDrivenSensitivityMatrix = SensitivityMatrix & {
  axisSource: 'macro';
  rateAxisSourceScenario: string;
  occupancyAxisSourceScenario: string;
};

function pickWorstShock(scenarios: MacroStressScenario[], key: keyof MacroStressScenario['shocks']): {
  value: number;
  scenarioName: string;
} {
  if (scenarios.length === 0) return { value: 0, scenarioName: 'none' };
  let worst = scenarios[0]!;
  for (const s of scenarios) {
    if (Math.abs(s.shocks[key]) > Math.abs(worst.shocks[key])) worst = s;
  }
  return { value: worst.shocks[key], scenarioName: worst.name };
}

export function buildMacroDrivenSensitivity(input: MacroDrivenSensitivityInput): MacroDrivenSensitivityMatrix {
  const rateWorst = pickWorstShock(input.scenarios, 'rateShiftBps');
  const vacancyWorst = pickWorstShock(input.scenarios, 'vacancyShiftPct');

  const rateSteps = [0, rateWorst.value * 0.25, rateWorst.value * 0.5, rateWorst.value * 0.75, rateWorst.value];
  const vacancySteps = [0, vacancyWorst.value * 0.25, vacancyWorst.value * 0.5, vacancyWorst.value * 0.75, vacancyWorst.value];

  const rowValues = rateSteps.map((s) => Number(s.toFixed(0)));
  const colValues = vacancySteps.map((s) => Number(s.toFixed(1)));

  const rowAxis: SensitivityAxis = {
    label: `Interest Rate Shift (worst: ${rateWorst.scenarioName})`,
    key: 'macroRateShift',
    values: rowValues,
    unit: 'bps'
  };
  const colAxis: SensitivityAxis = {
    label: `Vacancy Shift (worst: ${vacancyWorst.scenarioName})`,
    key: 'macroVacancyShift',
    values: colValues,
    unit: '%'
  };

  const initialEquityKrw = input.totalCapexKrw - input.initialDebtFundingKrw;
  const years = input.proForma.years;

  const cells: SensitivityCell[][] = rowValues.map((rateShiftBps, ri) =>
    colValues.map((vacancyShiftPct, ci) => {
      const debtCostFactor = 1 + (rateShiftBps / 100) / Math.max(input.baseInterestRatePct, 1);
      const occMultiplier = input.baseOccupancyPct > 0
        ? Math.max(0.3, (input.baseOccupancyPct - vacancyShiftPct) / input.baseOccupancyPct)
        : 1;

      const cashFlows: number[] = [-initialEquityKrw];
      for (let i = 0; i < years.length; i++) {
        const year = years[i]!;
        const isTerminal = i === years.length - 1;
        const adjustedInterest = year.interestKrw * debtCostFactor;
        const adjustedDebtService = adjustedInterest + year.principalKrw;
        const debtServiceDelta = year.debtServiceKrw - adjustedDebtService;
        const adjustedDistribution = (year.afterTaxDistributionKrw + debtServiceDelta) * occMultiplier;
        const adjustedTerminal = isTerminal
          ? input.terminalValueKrw * occMultiplier - input.proForma.summary.endingDebtBalanceKrw
          : 0;
        cashFlows.push(adjustedDistribution + adjustedTerminal);
      }

      const equityIrr = computeIrr(cashFlows);
      const totalReturn = cashFlows.slice(1).reduce((sum, cf) => sum + cf, 0);
      const equityMultiple = initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;
      const noiDelta = Number(((occMultiplier - 1) * 100).toFixed(2));

      return { row: ri, col: ci, equityIrr, equityMultiple, noiDelta };
    })
  );

  return {
    axisSource: 'macro',
    rateAxisSourceScenario: rateWorst.scenarioName,
    occupancyAxisSourceScenario: vacancyWorst.scenarioName,
    rowAxis,
    colAxis,
    baseRowIndex: 0,
    baseColIndex: 0,
    cells
  };
}
