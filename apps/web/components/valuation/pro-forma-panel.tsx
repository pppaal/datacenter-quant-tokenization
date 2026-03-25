import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, type SupportedCurrency } from '@/lib/finance/currency';
import { readStoredBaseCaseProForma } from '@/lib/services/valuation/pro-forma';
import type { ProFormaBaseCase } from '@/lib/services/valuation/types';
import { formatNumber } from '@/lib/utils';

export function ProFormaPanel({
  assumptions,
  displayCurrency = 'KRW',
  fxRateToKrw
}: {
  assumptions: unknown;
  displayCurrency?: SupportedCurrency;
  fxRateToKrw?: number | null;
}) {
  const proForma = readStoredBaseCaseProForma(assumptions);

  if (!proForma) {
    return (
      <Card>
        <div className="eyebrow">Base Case Pro Forma</div>
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          No stored base-case pro forma yet. Run a fresh valuation after the new cash-flow model is saved.
        </div>
      </Card>
    );
  }

  const summaryCards = [
    ['Year 1 Revenue', proForma.summary.annualRevenueKrw],
    ['Stabilized NOI', proForma.summary.stabilizedNoiKrw],
    ['Reserve Requirement', proForma.summary.reserveRequirementKrw],
    ['Ending Debt Balance', proForma.summary.endingDebtBalanceKrw],
    ['Net Exit Proceeds', proForma.summary.netExitProceedsKrw],
    ['Levered Equity Value', proForma.summary.leveredEquityValueKrw]
  ];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Base Case Pro Forma</div>
          <div className="mt-2 text-sm text-slate-400">
            Year-by-year revenue, NOI, debt service, and after-tax equity cash flow.
          </div>
        </div>
        <div className="text-sm text-slate-400">{formatNumber(proForma.years.length, 0)} forecast years</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {formatCurrencyFromKrwAtRate(Number(value), displayCurrency, fxRateToKrw)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2">Gross Pot. Rev</th>
              <th className="px-3 py-2">Contracted Rev</th>
              <th className="px-3 py-2">Residual Rev</th>
              <th className="px-3 py-2">Downtime Loss</th>
              <th className="px-3 py-2">Rent-Free Loss</th>
              <th className="px-3 py-2">Net Rental Rev</th>
              <th className="px-3 py-2">Fixed Rec.</th>
              <th className="px-3 py-2">OpEx Rec.</th>
              <th className="px-3 py-2">Utility Pass-Thru</th>
              <th className="px-3 py-2">Recoveries</th>
              <th className="px-3 py-2">Total Op. Rev</th>
              <th className="px-3 py-2">Power</th>
              <th className="px-3 py-2">Site OpEx</th>
              <th className="px-3 py-2">Non-Recov. OpEx</th>
              <th className="px-3 py-2">Maint. Reserve</th>
              <th className="px-3 py-2">TI</th>
              <th className="px-3 py-2">LC</th>
              <th className="px-3 py-2">TI / LC Total</th>
              <th className="px-3 py-2">NOI</th>
              <th className="px-3 py-2">CFADS</th>
              <th className="px-3 py-2">Debt Service</th>
              <th className="px-3 py-2">DSCR</th>
              <th className="px-3 py-2">After-tax CF</th>
              <th className="px-3 py-2">Ending Debt</th>
            </tr>
          </thead>
          <tbody>
            {proForma.years.map((year) => (
              <tr key={year.year} className="rounded-2xl border border-white/10 bg-white/[0.03] text-slate-200">
                <td className="px-3 py-3 font-medium text-white">{year.year}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.grossPotentialRevenueKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.contractedRevenueKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.residualRevenueKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.downtimeLossKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.rentFreeLossKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.revenueKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.fixedRecoveriesKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.siteRecoveriesKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.utilityPassThroughRevenueKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.reimbursementRevenueKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.totalOperatingRevenueKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.powerCostKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.siteOperatingExpenseKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.nonRecoverableOperatingExpenseKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.maintenanceReserveKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.tenantImprovementKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.leasingCommissionKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.tenantCapitalCostKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.noiKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.cfadsBeforeDebtKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.debtServiceKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{year.dscr !== null ? `${formatNumber(year.dscr, 2)}x` : 'N/A'}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.afterTaxDistributionKrw, displayCurrency, fxRateToKrw)}</td>
                <td className="px-3 py-3">{formatCurrencyFromKrwAtRate(year.endingDebtBalanceKrw, displayCurrency, fxRateToKrw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
