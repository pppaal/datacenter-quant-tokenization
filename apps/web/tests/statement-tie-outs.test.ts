import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSyntheticProForma,
  type ProFormaInputs
} from '@/lib/services/valuation/synthetic-pro-forma';

/**
 * Pins the rendered-statement tie-outs (`app/property-analyze/_sections/*`):
 *  - Cash Flow: the deduction bridge must foot to After-Tax Distribution, which
 *    requires the 종부세 (jongbuse) and capex-reserve rows the display previously
 *    omitted.
 *  - Sources & Uses: total Sources (debt + acquisition equity + TI/reserve
 *    equity) must equal total Uses.
 * Audit finding F1/F2 — the statements could not foot before these rows existed.
 */

function baseProForma(overrides: Partial<ProFormaInputs> = {}): ProFormaInputs {
  return {
    purchasePriceKrw: 100_000_000_000,
    ltvPct: 50,
    interestRatePct: 5,
    amortTermMonths: 180,
    capRatePct: 6,
    exitCapRatePct: 6,
    year1Noi: 6_000_000_000,
    growthPct: 2,
    opexRatio: 0.3,
    propertyTaxPct: 0.25,
    insurancePct: 0.08,
    corpTaxPct: 24.2,
    exitTaxPct: 24.2,
    acquisitionTaxPct: 9.4,
    landValuePct: 30,
    depreciationYears: 40,
    exitCostPct: 1.5,
    propertyTaxGrowthPct: 3,
    assetClass: 'OFFICE',
    ...overrides
  };
}

// Every asset class the synthetic engine supports — the statements must foot for
// all of them, not just office (e.g. MULTIFAMILY carries heavier 주택 종부세).
const ASSET_CLASSES: ProFormaInputs['assetClass'][] = [
  'OFFICE',
  'INDUSTRIAL',
  'RETAIL',
  'MULTIFAMILY',
  'HOTEL',
  'DATA_CENTER',
  'LAND',
  'MIXED_USE'
];

test('cash flow deduction bridge foots to After-Tax Distribution every year', () => {
  for (const assetClass of ASSET_CLASSES) {
    const { proForma } = buildSyntheticProForma(baseProForma({ assetClass }));
    for (const y of proForma.years) {
      const bridge =
        y.noiKrw -
        y.debtServiceKrw -
        y.propertyTaxKrw -
        (y.jongbuseKrw ?? 0) -
        y.insuranceKrw -
        y.reserveContributionKrw -
        (y.capexReserveKrw ?? 0) -
        y.corporateTaxKrw;
      // Allow ±a few KRW for the per-line Math.round in the engine.
      assert.ok(
        Math.abs(bridge - y.afterTaxDistributionKrw) <= 5,
        `${assetClass} Y${y.year}: bridge ${bridge} != afterTax ${y.afterTaxDistributionKrw}`
      );
    }
  }
});

test('jongbuse and capex reserve are non-zero (so the omitted rows mattered)', () => {
  const { proForma } = buildSyntheticProForma(baseProForma({ assetClass: 'OFFICE' }));
  const y1 = proForma.years[0]!;
  assert.ok((y1.jongbuseKrw ?? 0) > 0, 'jongbuse should be non-zero for an office asset');
  assert.ok((y1.capexReserveKrw ?? 0) > 0, 'capex reserve should be non-zero');
});

test('sources & uses balance to zero', () => {
  for (const assetClass of ASSET_CLASSES) {
    const { proForma, extras } = buildSyntheticProForma(baseProForma({ assetClass }));
    const s = proForma.summary;
    const y1 = proForma.years[0]!;
    const initialTenantCapital = y1.tenantCapitalCostKrw + y1.fitOutCostKrw;
    const reserveFunding = s.reserveRequirementKrw;

    const purchasePrice = extras.totalBasisKrw - extras.acquisitionTaxKrw;
    const totalUses =
      purchasePrice + extras.acquisitionTaxKrw + initialTenantCapital + reserveFunding;
    const totalSources =
      s.initialDebtFundingKrw + s.initialEquityKrw + (initialTenantCapital + reserveFunding);

    assert.equal(
      totalSources - totalUses,
      0,
      `${assetClass}: sources ${totalSources} != uses ${totalUses}`
    );
  }
});
