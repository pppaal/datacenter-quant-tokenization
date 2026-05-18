/**
 * Tax leakage walk through the hold period. Real institutional IMs
 * carry an after-tax bridge: acquisition transfer tax → annual
 * property tax over the hold → corporate tax on operating earnings
 * → exit transfer tax → withholding tax on cross-border
 * distributions. This helper assembles the cash outflow line by
 * line so the LP sees what the unlevered gross IRR loses to tax.
 */

type TaxAssumptionLike = {
  acquisitionTaxPct?: number | null;
  propertyTaxPct?: number | null;
  corporateTaxPct?: number | null;
  exitTaxPct?: number | null;
  vatRecoveryPct?: number | null;
  withholdingTaxPct?: number | null;
  insurancePct?: number | null;
};

export type InvestmentBasisSource =
  | 'purchase_price'
  | 'capex_total'
  | 'unknown';

export type TaxWalkRow = {
  category:
    | 'acquisition'
    | 'property'
    | 'corporate'
    | 'exit'
    | 'withholding'
    | 'insurance';
  label: string;
  ratePct: number;
  /** Base value the rate applies to (e.g. purchase price, cumulative NOI). */
  baseKrw: number;
  baseLabel: string;
  /** rate × base, or rate × base × hold years for annual items. */
  totalCashOutflowKrw: number;
  notes: string;
};

export type TaxWalkSummary = {
  rows: TaxWalkRow[];
  totalCashOutflowKrw: number;
  /**
   * Total cash tax outflow as a fraction of pre-tax cumulative
   * gross profit (cumulative NOI + exit gain). Captures the drag
   * the LP actually feels on equity returns. null when inputs
   * insufficient.
   */
  effectiveDragOnGrossPct: number | null;
  /**
   * Source of the investment basis used for transfer-tax bases.
   * 'purchase_price' is the lender-grade value; 'capex_total' is
   * a development-asset proxy (transfer tax base may differ).
   */
  basisSource: InvestmentBasisSource;
  basisCaveat: string | null;
};

export function buildTaxWalk(
  taxes: TaxAssumptionLike | null,
  inputs: {
    purchasePriceKrw: number;
    cumulativeNoiKrw: number;
    exitValueKrw: number;
    holdYears: number;
    basisSource?: InvestmentBasisSource;
  }
): TaxWalkSummary {
  if (!taxes || inputs.purchasePriceKrw <= 0) {
    return {
      rows: [],
      totalCashOutflowKrw: 0,
      effectiveDragOnGrossPct: null,
      basisSource: inputs.basisSource ?? 'unknown',
      basisCaveat: null
    };
  }

  const rows: TaxWalkRow[] = [];

  if (typeof taxes.acquisitionTaxPct === 'number') {
    const cash = inputs.purchasePriceKrw * (taxes.acquisitionTaxPct / 100);
    rows.push({
      category: 'acquisition',
      label: 'Acquisition transfer tax',
      ratePct: taxes.acquisitionTaxPct,
      baseKrw: inputs.purchasePriceKrw,
      baseLabel:
        (inputs.basisSource ?? 'purchase_price') === 'capex_total'
          ? 'Investment basis (capex)'
          : 'Purchase price',
      totalCashOutflowKrw: cash,
      notes: 'One-time at close.'
    });
  }
  if (typeof taxes.propertyTaxPct === 'number' && inputs.holdYears > 0) {
    const cash =
      inputs.purchasePriceKrw * (taxes.propertyTaxPct / 100) * inputs.holdYears;
    rows.push({
      category: 'property',
      label: `Property tax (${inputs.holdYears}y hold)`,
      ratePct: taxes.propertyTaxPct,
      baseKrw: inputs.purchasePriceKrw,
      baseLabel:
        (inputs.basisSource ?? 'purchase_price') === 'capex_total'
          ? 'Investment basis × yrs'
          : 'Purchase price × yrs',
      totalCashOutflowKrw: cash,
      notes: `Annualized; ${taxes.propertyTaxPct.toFixed(2)}% × ${inputs.holdYears}y on basis.`
    });
  }
  if (typeof taxes.insurancePct === 'number' && inputs.holdYears > 0) {
    const cash =
      inputs.purchasePriceKrw * (taxes.insurancePct / 100) * inputs.holdYears;
    rows.push({
      category: 'insurance',
      label: `Insurance premium (${inputs.holdYears}y hold)`,
      ratePct: taxes.insurancePct,
      baseKrw: inputs.purchasePriceKrw,
      baseLabel:
        (inputs.basisSource ?? 'purchase_price') === 'capex_total'
          ? 'Investment basis × yrs'
          : 'Purchase price × yrs',
      totalCashOutflowKrw: cash,
      notes: 'Operating expense; not strictly tax but tracked alongside.'
    });
  }
  if (typeof taxes.corporateTaxPct === 'number' && inputs.cumulativeNoiKrw > 0) {
    const cash = inputs.cumulativeNoiKrw * (taxes.corporateTaxPct / 100);
    rows.push({
      category: 'corporate',
      label: 'Corporate income tax (hold)',
      ratePct: taxes.corporateTaxPct,
      baseKrw: inputs.cumulativeNoiKrw,
      baseLabel: 'Cumulative NOI',
      totalCashOutflowKrw: cash,
      notes: 'Applied to taxable earnings; D&A shield not modeled.'
    });
  }
  if (typeof taxes.exitTaxPct === 'number' && inputs.exitValueKrw > 0) {
    const cash = inputs.exitValueKrw * (taxes.exitTaxPct / 100);
    rows.push({
      category: 'exit',
      label: 'Exit transfer tax',
      ratePct: taxes.exitTaxPct,
      baseKrw: inputs.exitValueKrw,
      baseLabel: 'Exit value',
      totalCashOutflowKrw: cash,
      notes: 'Triggered at sale.'
    });
  }
  if (typeof taxes.withholdingTaxPct === 'number' && inputs.cumulativeNoiKrw > 0) {
    // Withholding generally applies to cross-border distributions;
    // we proxy to cumulative NOI as a directional figure.
    const cash =
      inputs.cumulativeNoiKrw * 0.5 * (taxes.withholdingTaxPct / 100); // rough — half of NOI distributed
    rows.push({
      category: 'withholding',
      label: 'Withholding tax (cross-border)',
      ratePct: taxes.withholdingTaxPct,
      baseKrw: inputs.cumulativeNoiKrw * 0.5,
      baseLabel: '~50% of NOI distributed',
      totalCashOutflowKrw: cash,
      notes: 'Applies if foreign LPs; rate per Korea-source treaty.'
    });
  }

  const total = rows.reduce((s, r) => s + r.totalCashOutflowKrw, 0);
  // Effective drag on pre-tax gross profit (NOI + exit gain over basis).
  // This is what an LP feels on equity returns, not a flow+stock blend.
  const grossProfitKrw =
    inputs.cumulativeNoiKrw + Math.max(0, inputs.exitValueKrw - inputs.purchasePriceKrw);
  const effectiveDragOnGrossPct =
    grossProfitKrw > 0 ? (total / grossProfitKrw) * 100 : null;

  const basisSource = inputs.basisSource ?? 'purchase_price';
  const basisCaveat =
    basisSource === 'capex_total'
      ? 'Transfer-tax bases use the development all-in capex as a proxy when the share-purchase price is not yet committed; actual KR transfer tax is assessed on the executed share-purchase amount and may differ.'
      : null;

  return {
    rows,
    totalCashOutflowKrw: total,
    effectiveDragOnGrossPct,
    basisSource,
    basisCaveat
  };
}
