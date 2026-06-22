import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Card } from '@/components/ui/card';
import { KeyValueRow } from '@/components/ui/key-value-row';
import { ProvenancePill } from './helpers';
import { formatPercent } from '@/lib/utils';
import type { SampleReportData } from './types';

export function SourcesUsesSection({ data }: { data: SampleReportData }) {
  const { displayCurrency, fxRateToKrw, proForma, capexBreakdown, provenanceByCard } = data;
  if (!proForma) {
    return null;
  }
  // Sources are the capital raised; Uses are the project cost summed independently
  // from the capex breakdown (NOT a copy of the Sources total). The funding line
  // then reconciles the two instead of footing trivially by construction.
  const sourcesTotalKrw =
    proForma.summary.initialDebtFundingKrw + proForma.summary.initialEquityKrw;
  const usesTotalKrw = capexBreakdown.totalCapexKrw;
  const fundingDeltaKrw = usesTotalKrw !== null ? sourcesTotalKrw - usesTotalKrw : null;
  return (
    <section id="im-sources-uses" className="app-shell py-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="eyebrow">Sources & Uses</div>
          <p className="mt-2 text-sm text-slate-400">
            Initial capitalization at close. Equity equals total cost less drawn debt at funding;
            uses are summed independently from the project capex breakdown below, and the funding
            line reconciles sources against that cost. Reserves accrue against the year-one equity
            outflow.
          </p>
          <dl className="mt-5 grid gap-3 text-sm">
            <KeyValueRow variant="inline" label="Sources · senior debt">
              {formatCompactCurrencyFromKrwAtRate(
                proForma.summary.initialDebtFundingKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Sources · LP/GP equity">
              {formatCompactCurrencyFromKrwAtRate(
                proForma.summary.initialEquityKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Sources · total">
              {formatCompactCurrencyFromKrwAtRate(sourcesTotalKrw, displayCurrency, fxRateToKrw)}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Uses · total project cost">
              {usesTotalKrw !== null
                ? formatCompactCurrencyFromKrwAtRate(usesTotalKrw, displayCurrency, fxRateToKrw)
                : 'N/A (capex breakdown unavailable)'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Funding surplus / (gap)">
              {fundingDeltaKrw !== null ? (
                <span className={fundingDeltaKrw < 0 ? 'text-rose-300' : undefined}>
                  {formatCompactCurrencyFromKrwAtRate(
                    fundingDeltaKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </span>
              ) : (
                '—'
              )}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Reserves required">
              {formatCompactCurrencyFromKrwAtRate(
                proForma.summary.reserveRequirementKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Peak equity exposure">
              {formatCompactCurrencyFromKrwAtRate(
                proForma.summary.peakEquityExposureKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </KeyValueRow>
          </dl>

          {capexBreakdown.totalCapexKrw !== null ? (
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-[hsl(var(--border))]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Uses · line item</th>
                    <th className="px-2 py-2 text-right font-semibold">Amount</th>
                    <th className="px-2 py-2 text-right font-semibold">% of total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))] text-slate-200">
                  {(
                    [
                      ['Land', capexBreakdown.landValueKrw],
                      ['Shell & core', capexBreakdown.shellCoreKrw],
                      ['Mechanical', capexBreakdown.mechanicalKrw],
                      ['Electrical', capexBreakdown.electricalKrw],
                      ['IT fit-out', capexBreakdown.itFitOutKrw],
                      ['Soft cost', capexBreakdown.softCostKrw],
                      ['Contingency', capexBreakdown.contingencyKrw]
                    ] as const
                  )
                    .filter(([, v]) => typeof v === 'number' && v > 0)
                    .map(([label, value]) => (
                      <tr key={label}>
                        <td className="px-2 py-2 text-slate-300">{label}</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatCompactCurrencyFromKrwAtRate(
                            value as number,
                            displayCurrency,
                            fxRateToKrw
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-400">
                          {(
                            ((value as number) / (capexBreakdown.totalCapexKrw ?? 1)) *
                            100
                          ).toFixed(1)}
                          %
                        </td>
                      </tr>
                    ))}
                  <tr className="bg-[hsl(var(--surface-hover))] font-semibold">
                    <td className="px-2 py-2 text-white">Total</td>
                    <td className="px-2 py-2 text-right font-mono text-white">
                      {formatCompactCurrencyFromKrwAtRate(
                        capexBreakdown.totalCapexKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-slate-400">100.0%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
          <ProvenancePill entries={provenanceByCard.capex} />
        </Card>

        <Card>
          <div className="eyebrow">Equity returns</div>
          <p className="mt-2 text-sm text-slate-400">
            Levered returns computed from the year-by-year cash flow stream of the base case. Equity
            multiple = total distributions / initial equity.
          </p>
          <dl className="mt-5 grid gap-3 text-sm">
            <KeyValueRow variant="inline" label="Equity IRR">
              {proForma.summary.equityIrr !== null
                ? formatPercent(proForma.summary.equityIrr)
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Unlevered IRR">
              {proForma.summary.unleveragedIrr !== null
                ? formatPercent(proForma.summary.unleveragedIrr)
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Equity multiple">
              {proForma.summary.equityMultiple > 0
                ? `${proForma.summary.equityMultiple.toFixed(2)}x`
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Avg cash-on-cash">
              {proForma.summary.averageCashOnCash > 0
                ? formatPercent(proForma.summary.averageCashOnCash)
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Payback year">
              {proForma.summary.paybackYear !== null
                ? `Year ${proForma.summary.paybackYear}`
                : 'Beyond model horizon'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Net exit proceeds">
              {formatCompactCurrencyFromKrwAtRate(
                proForma.summary.netExitProceedsKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </KeyValueRow>
          </dl>
        </Card>
      </div>
    </section>
  );
}
