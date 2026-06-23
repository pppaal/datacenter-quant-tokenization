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

  const rowAxis: SensitivityAxis = {
    label: 'Going-In Cap Rate',
    key: 'capRate',
    values: rowValues,
    unit: '%'
  };
  const colAxis: SensitivityAxis = {
    label: 'Exit Cap Rate',
    key: 'exitCapRate',
    values: colValues,
    unit: '%'
  };

  const initialEquityKrw = totalCapexKrw - initialDebtFundingKrw;
  const years = proForma.years;
  const baseNoi = stabilizedNoiKrw;

  const cells: SensitivityCell[][] = rowValues.map((capRate, ri) =>
    colValues.map((exitCap, ci) => {
      // Floor the exit cap at a small positive value rather than collapsing the
      // terminal value to ZERO when a downward step pushes it to <= 0. A cap rate
      // can never realistically be <= 0%, and zeroing the exit proceeds produces a
      // discontinuous, wildly-pessimistic IRR for the lowest-exit-cap corner of a
      // low-base-cap asset (the most BULLISH cell should show the HIGHEST value,
      // not a sudden crater). 0.1% is a conservative floor that keeps the implied
      // terminal value finite and ordered.
      const effectiveExitCap = Math.max(exitCap, 0.1);
      const adjustedTerminalValue = baseNoi / (effectiveExitCap / 100);
      const noiMultiplier = baseCapRatePct > 0 ? capRate / baseCapRatePct : 1;
      const noiDelta = Number(((noiMultiplier - 1) * 100).toFixed(2));

      // The going-in cap-rate axis must actually move the operating cash flows,
      // otherwise the entire ROW dimension is inert: a higher going-in cap means
      // a higher entry NOI yield (more income per KRW of basis), so scale the
      // per-year operating distributions by noiMultiplier. Previously the row
      // value was computed into noiDelta but never applied, so every row produced
      // an identical IRR/multiple and the matrix was effectively one-dimensional.
      const cashFlows: number[] = [-initialEquityKrw];
      for (let i = 0; i < years.length; i++) {
        const year = years[i]!;
        const isTerminal = i === years.length - 1;
        const cf =
          year.afterTaxDistributionKrw * noiMultiplier +
          (isTerminal ? adjustedTerminalValue - proForma.summary.endingDebtBalanceKrw : 0);
        cashFlows.push(cf);
      }

      const equityIrr = computeIrr(cashFlows);
      const totalDistributions = years.reduce(
        (sum, y) => sum + y.afterTaxDistributionKrw * noiMultiplier,
        0
      );
      const totalReturn =
        totalDistributions + adjustedTerminalValue - proForma.summary.endingDebtBalanceKrw;
      const equityMultiple =
        initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;

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

  // Clamp BOTH ends of the occupancy axis. Without a lower floor a low base
  // occupancy combined with a large negative step (e.g. base 10% − 15) produces
  // a NEGATIVE occupancy, whose occMultiplier (occPct / baseOccupancyPct) flips
  // sign and turns every operating distribution into a spurious inflow — an
  // IRR/multiple that improves as occupancy collapses. Floor at 0%.
  const rowValues = occupancySteps.map((s) =>
    Math.max(0, Math.min(Number((baseOccupancyPct + s).toFixed(1)), 100))
  );
  const colValues = rentSteps.map((s) => s);

  const rowAxis: SensitivityAxis = {
    label: 'Occupancy',
    key: 'occupancy',
    values: rowValues,
    unit: '%'
  };
  const colAxis: SensitivityAxis = {
    label: 'Revenue Growth',
    key: 'revenueGrowth',
    values: colValues,
    unit: '%'
  };

  const initialEquityKrw = totalCapexKrw - initialDebtFundingKrw;
  const years = proForma.years;

  const cells: SensitivityCell[][] = rowValues.map((occPct, ri) =>
    colValues.map((rentDelta, ci) => {
      const occMultiplier = baseOccupancyPct > 0 ? occPct / baseOccupancyPct : 1;
      const rentMultiplier = 1 + rentDelta / 100;

      const cashFlows: number[] = [-initialEquityKrw];
      for (let i = 0; i < years.length; i++) {
        const year = years[i]!;
        const isTerminal = i === years.length - 1;
        const adjustedDistribution = year.afterTaxDistributionKrw * occMultiplier * rentMultiplier;
        const adjustedTerminal = isTerminal
          ? terminalValueKrw * occMultiplier * rentMultiplier -
            proForma.summary.endingDebtBalanceKrw
          : 0;
        cashFlows.push(adjustedDistribution + adjustedTerminal);
      }

      const equityIrr = computeIrr(cashFlows);
      const totalReturn = cashFlows.slice(1).reduce((sum, cf) => sum + cf, 0);
      const equityMultiple =
        initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;
      const noiDelta = Number(((occMultiplier * rentMultiplier - 1) * 100).toFixed(2));

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
    // Floor the debt-cost factor at 0: interest expense can fall to zero but
    // never go NEGATIVE. With a low base rate (e.g. 0.5%) the divisor is floored
    // at 1, so a −200bps shift would otherwise yield 1 + (−2)/1 = −1, producing
    // negative interest and a spurious over-credit to equity distributions.
    const rateMultiplier = Math.max(0, 1 + shiftBps / 100 / Math.max(baseInterestRatePct, 1));
    const debtCostFactor = rateMultiplier;

    const cashFlows: number[] = [-initialEquityKrw];
    let firstYearDscr: number | null = null;

    for (let i = 0; i < years.length; i++) {
      const year = years[i]!;
      const isTerminal = i === years.length - 1;
      const adjustedInterest = year.interestKrw * debtCostFactor;
      const adjustedDebtService = adjustedInterest + year.principalKrw;
      const adjustedDistribution =
        year.afterTaxDistributionKrw + (year.debtServiceKrw - adjustedDebtService);
      const adjustedTerminal = isTerminal
        ? terminalValueKrw - proForma.summary.endingDebtBalanceKrw
        : 0;

      cashFlows.push(adjustedDistribution + adjustedTerminal);

      if (i === 0) {
        firstYearDscr =
          adjustedDebtService > 0
            ? Number((year.cfadsBeforeDebtKrw / adjustedDebtService).toFixed(2))
            : null;
      }
    }

    const equityIrr = computeIrr(cashFlows);
    const totalReturn = cashFlows.slice(1).reduce((sum, cf) => sum + cf, 0);
    const equityMultiple =
      initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;

    return { shiftBps, equityIrr, equityMultiple, dscrYear1: firstYearDscr };
  });
}

// ---------------------------------------------------------------------------
// Tornado sensitivity (one-way, all key drivers ranked by |levered IRR swing|)
// ---------------------------------------------------------------------------
//
// Deterministic: each driver is independently shocked +delta and -delta around
// the base case, the resulting levered equity IRR is recomputed, and drivers are
// ranked by the absolute spread between their up and down IRR outcomes. This is
// the classic "tornado" view — the widest bar (biggest swing) sits on top.

export type TornadoDriver = {
  key: string;
  label: string;
  /** Human-readable description of the +/- shock applied. */
  deltaLabel: string;
  baseIrr: number | null;
  lowIrr: number | null;
  highIrr: number | null;
  /** |highIrr - lowIrr| in IRR percentage points; the bar length / rank key. */
  irrSwing: number;
};

export type TornadoResult = {
  baseEquityIrr: number | null;
  drivers: TornadoDriver[];
};

type TornadoInputs = {
  proForma: ProFormaBaseCase;
  totalCapexKrw: number;
  initialDebtFundingKrw: number;
  baseCapRatePct: number;
  baseExitCapRatePct: number;
  baseInterestRatePct: number;
  baseOccupancyPct: number;
  growthPct: number;
  stabilizedNoiKrw: number;
  terminalValueKrw: number;
};

// A scenario is a per-year transform on (afterTaxDistribution, terminalAddOn).
type TornadoScenario = (args: { year: ProFormaBaseCase['years'][number]; isTerminal: boolean }) => {
  distribution: number;
  terminalAddOn: number;
};

function tornadoIrr(
  inputs: TornadoInputs,
  scenario: TornadoScenario,
  initialEquityKrw: number
): number | null {
  const years = inputs.proForma.years;
  const cashFlows: number[] = [-initialEquityKrw];
  for (let i = 0; i < years.length; i++) {
    const year = years[i]!;
    const isTerminal = i === years.length - 1;
    const { distribution, terminalAddOn } = scenario({ year, isTerminal });
    cashFlows.push(distribution + (isTerminal ? terminalAddOn : 0));
  }
  return computeIrr(cashFlows);
}

export function buildTornadoSensitivity(inputs: TornadoInputs): TornadoResult {
  const initialEquityKrw = inputs.totalCapexKrw - inputs.initialDebtFundingKrw;
  const endingDebt = inputs.proForma.summary.endingDebtBalanceKrw;
  const baseTerminalNet = inputs.terminalValueKrw - endingDebt;

  const baseScenario: TornadoScenario = ({ year }) => ({
    distribution: year.afterTaxDistributionKrw,
    terminalAddOn: baseTerminalNet
  });
  const baseEquityIrr = tornadoIrr(inputs, baseScenario, initialEquityKrw);

  // Each driver: a +/- shock factory. Deltas are symmetric and deterministic.
  type DriverSpec = {
    key: string;
    label: string;
    deltaLabel: string;
    make: (sign: 1 | -1) => TornadoScenario;
  };

  // Going-in cap rate proxy: scale NOI-driven distributions by the cap ratio.
  const capDelta = 0.5; // ±50bps
  const exitCapDelta = 0.5; // ±50bps
  const rentDelta = 0.1; // ±10% NOI/rent
  const occDeltaPct = 5; // ±5 occupancy points
  const rateDeltaBps = 100; // ±100bps interest
  const opexDelta = 0.05; // ±5% opex burden on distributions
  const growthDelta = 1.0; // ±100bps rent growth → terminal value

  const drivers: DriverSpec[] = [
    {
      key: 'capRate',
      label: 'Going-In Cap Rate',
      deltaLabel: `±${capDelta.toFixed(1)}%`,
      make: (sign) => {
        // Higher cap rate ⇒ lower entry value ⇒ proxy lower distributions.
        const mult =
          inputs.baseCapRatePct > 0
            ? inputs.baseCapRatePct / (inputs.baseCapRatePct + sign * capDelta)
            : 1;
        return ({ year }) => ({
          distribution: year.afterTaxDistributionKrw * mult,
          terminalAddOn: baseTerminalNet
        });
      }
    },
    {
      key: 'exitCapRate',
      label: 'Exit Cap Rate',
      deltaLabel: `±${exitCapDelta.toFixed(1)}%`,
      make: (sign) => {
        const newExitCap = inputs.baseExitCapRatePct + sign * exitCapDelta;
        const newTerminalGross = newExitCap > 0 ? inputs.stabilizedNoiKrw / (newExitCap / 100) : 0;
        const newTerminalNet = newTerminalGross - endingDebt;
        return ({ year }) => ({
          distribution: year.afterTaxDistributionKrw,
          terminalAddOn: newTerminalNet
        });
      }
    },
    {
      key: 'rentNoi',
      label: 'Rent / NOI',
      deltaLabel: `±${(rentDelta * 100).toFixed(0)}%`,
      make: (sign) => {
        const mult = 1 + sign * rentDelta;
        return ({ year }) => ({
          distribution: year.afterTaxDistributionKrw * mult,
          terminalAddOn: baseTerminalNet * mult + endingDebt * (1 - mult)
        });
      }
    },
    {
      key: 'occupancy',
      label: 'Occupancy',
      deltaLabel: `±${occDeltaPct} pts`,
      make: (sign) => {
        const occMult =
          inputs.baseOccupancyPct > 0
            ? (inputs.baseOccupancyPct + sign * occDeltaPct) / inputs.baseOccupancyPct
            : 1;
        return ({ year }) => ({
          distribution: year.afterTaxDistributionKrw * occMult,
          terminalAddOn: inputs.terminalValueKrw * occMult - endingDebt
        });
      }
    },
    {
      key: 'interestRate',
      label: 'Interest Rate',
      deltaLabel: `±${rateDeltaBps}bps`,
      make: (sign) => {
        const debtCostFactor =
          1 + (sign * rateDeltaBps) / 100 / Math.max(inputs.baseInterestRatePct, 1);
        return ({ year }) => {
          const adjustedInterest = year.interestKrw * debtCostFactor;
          const debtServiceDelta = year.debtServiceKrw - (adjustedInterest + year.principalKrw);
          return {
            distribution: year.afterTaxDistributionKrw + debtServiceDelta,
            terminalAddOn: baseTerminalNet
          };
        };
      }
    },
    {
      key: 'opex',
      label: 'Operating Expense',
      deltaLabel: `±${(opexDelta * 100).toFixed(0)}%`,
      make: (sign) => {
        // Higher opex ⇒ lower NOI ⇒ proxy lower distributions. Use opex burden:
        // shock distributions by the opex's share-of-revenue proportionally.
        return ({ year }) => {
          const opexShock = year.operatingExpenseKrw * sign * opexDelta;
          return {
            distribution: year.afterTaxDistributionKrw - opexShock,
            terminalAddOn: baseTerminalNet
          };
        };
      }
    },
    {
      key: 'growth',
      label: 'Rent Growth',
      deltaLabel: `±${growthDelta.toFixed(1)}%`,
      make: (sign) => {
        // Growth compounds into the terminal value (forward-NOI driven). Approximate
        // terminal sensitivity over the holding period; distributions held flat.
        const holdYears = inputs.proForma.years.length;
        const growthMult = (1 + (sign * growthDelta) / 100) ** holdYears;
        return ({ year }) => ({
          distribution: year.afterTaxDistributionKrw,
          terminalAddOn: inputs.terminalValueKrw * growthMult - endingDebt
        });
      }
    }
  ];

  const computed: TornadoDriver[] = drivers.map((d) => {
    const lowIrr = tornadoIrr(inputs, d.make(-1), initialEquityKrw);
    const highIrr = tornadoIrr(inputs, d.make(1), initialEquityKrw);
    const irrSwing =
      lowIrr !== null && highIrr !== null ? Number(Math.abs(highIrr - lowIrr).toFixed(4)) : 0;
    return {
      key: d.key,
      label: d.label,
      deltaLabel: d.deltaLabel,
      baseIrr: baseEquityIrr,
      lowIrr,
      highIrr,
      irrSwing
    };
  });

  // Rank by absolute IRR swing, widest bar first (classic tornado ordering).
  computed.sort((a, b) => b.irrSwing - a.irrSwing);

  return { baseEquityIrr, drivers: computed };
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

function pickWorstShock(
  scenarios: MacroStressScenario[],
  key: keyof MacroStressScenario['shocks']
): {
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

export function buildMacroDrivenSensitivity(
  input: MacroDrivenSensitivityInput
): MacroDrivenSensitivityMatrix {
  const rateWorst = pickWorstShock(input.scenarios, 'rateShiftBps');
  const vacancyWorst = pickWorstShock(input.scenarios, 'vacancyShiftPct');

  const rateSteps = [
    0,
    rateWorst.value * 0.25,
    rateWorst.value * 0.5,
    rateWorst.value * 0.75,
    rateWorst.value
  ];
  const vacancySteps = [
    0,
    vacancyWorst.value * 0.25,
    vacancyWorst.value * 0.5,
    vacancyWorst.value * 0.75,
    vacancyWorst.value
  ];

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
      const debtCostFactor = 1 + rateShiftBps / 100 / Math.max(input.baseInterestRatePct, 1);
      const occMultiplier =
        input.baseOccupancyPct > 0
          ? Math.max(0.3, (input.baseOccupancyPct - vacancyShiftPct) / input.baseOccupancyPct)
          : 1;

      const cashFlows: number[] = [-initialEquityKrw];
      for (let i = 0; i < years.length; i++) {
        const year = years[i]!;
        const isTerminal = i === years.length - 1;
        const adjustedInterest = year.interestKrw * debtCostFactor;
        const adjustedDebtService = adjustedInterest + year.principalKrw;
        const debtServiceDelta = year.debtServiceKrw - adjustedDebtService;
        const adjustedDistribution =
          (year.afterTaxDistributionKrw + debtServiceDelta) * occMultiplier;
        const adjustedTerminal = isTerminal
          ? input.terminalValueKrw * occMultiplier - input.proForma.summary.endingDebtBalanceKrw
          : 0;
        cashFlows.push(adjustedDistribution + adjustedTerminal);
      }

      const equityIrr = computeIrr(cashFlows);
      const totalReturn = cashFlows.slice(1).reduce((sum, cf) => sum + cf, 0);
      const equityMultiple =
        initialEquityKrw > 0 ? Number((totalReturn / initialEquityKrw).toFixed(2)) : 0;
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
