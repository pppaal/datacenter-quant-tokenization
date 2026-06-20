import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Card } from '@/components/ui/card';
import { KeyValueRow } from '@/components/ui/key-value-row';
import { ProvenancePill } from './helpers';
import { formatNumber, formatPercent } from '@/lib/utils';
import type { SampleReportData } from './types';

export function ReturnsSection({ data }: { data: SampleReportData }) {
  const {
    asset,
    displayCurrency,
    fxRateToKrw,
    leaseRoll,
    capStack,
    returnsSnapshot,
    tenantCredit,
    provenanceByCard
  } = data;
  return (
    <section id="im-returns" className="app-shell py-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="eyebrow">Returns snapshot</div>
          <p className="mt-2 text-sm text-slate-400">
            Headline returns from the latest valuation run. Going-in yield and exit cap reflect the
            base case; minimum DSCR is the floor across all scenarios.
          </p>
          <dl className="mt-5 grid gap-3 text-sm">
            <KeyValueRow variant="inline" label="Going-in yield">
              {returnsSnapshot.goingInYieldPct !== null
                ? formatPercent(returnsSnapshot.goingInYieldPct)
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Exit cap">
              {returnsSnapshot.exitCapPct !== null
                ? formatPercent(returnsSnapshot.exitCapPct)
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Upside (base → bull)">
              {returnsSnapshot.upsideToBullPct !== null
                ? `+${returnsSnapshot.upsideToBullPct.toFixed(1)}%`
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Downside (base → bear)">
              {returnsSnapshot.downsideToBearPct !== null
                ? `${returnsSnapshot.downsideToBearPct.toFixed(1)}%`
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Min DSCR">
              {returnsSnapshot.minDscr !== null ? `${returnsSnapshot.minDscr.toFixed(2)}x` : '—'}
            </KeyValueRow>
          </dl>
          <ProvenancePill entries={provenanceByCard.valuationRates} />
        </Card>

        <Card>
          <div className="eyebrow">Capital structure</div>
          <p className="mt-2 text-sm text-slate-400">
            {capStack.facilityCount === 0
              ? 'No facilities recorded. Presented unlevered pending committed financing.'
              : `${capStack.facilityCount} facility${capStack.facilityCount === 1 ? '' : 'ies'} aggregated.`}
          </p>
          <dl className="mt-5 grid gap-3 text-sm">
            <KeyValueRow variant="inline" label="Total commitment">
              {formatCompactCurrencyFromKrwAtRate(
                capStack.totalCommitmentKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Drawn">
              {formatCompactCurrencyFromKrwAtRate(
                capStack.totalDrawnKrw,
                displayCurrency,
                fxRateToKrw
              )}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Drawn / commitment">
              {capStack.totalCommitmentKrw === 0
                ? '—'
                : `${capStack.drawnPctOfCommitment.toFixed(1)}%`}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Blended rate">
              {capStack.totalCommitmentKrw === 0 ? '—' : `${capStack.blendedRatePct.toFixed(2)}%`}
            </KeyValueRow>
          </dl>
          {asset.debtFacilities && asset.debtFacilities.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Facility</th>
                    <th className="px-2 py-2 text-right font-semibold">Commit</th>
                    <th className="px-2 py-2 text-right font-semibold">Drawn</th>
                    <th className="px-2 py-2 text-right font-semibold">Rate</th>
                    <th className="px-2 py-2 text-right font-semibold">Term</th>
                    <th className="px-2 py-2 text-right font-semibold">Amort</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {asset.debtFacilities.map((f) => (
                    <tr key={f.id}>
                      <td className="px-2 py-2">
                        <div className="text-white">{f.facilityType}</div>
                        {f.lenderName ? (
                          <div className="text-[10px] text-slate-500">{f.lenderName}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatCompactCurrencyFromKrwAtRate(
                          f.commitmentKrw,
                          displayCurrency,
                          fxRateToKrw
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {f.drawnAmountKrw !== null
                          ? formatCompactCurrencyFromKrwAtRate(
                              f.drawnAmountKrw,
                              displayCurrency,
                              fxRateToKrw
                            )
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {f.interestRatePct.toFixed(2)}%
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {f.amortizationTermMonths
                          ? `${(f.amortizationTermMonths / 12).toFixed(0)} yr`
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                        {f.amortizationProfile.replace(/_/g, ' ').toLowerCase()}
                        {typeof f.balloonPct === 'number' && f.balloonPct > 0
                          ? ` · ${f.balloonPct.toFixed(0)}% balloon`
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <ProvenancePill entries={provenanceByCard.capitalStructure} />
        </Card>

        <Card>
          <div className="eyebrow">Tenancy snapshot</div>
          <p className="mt-2 text-sm text-slate-400">
            {leaseRoll.leaseCount === 0
              ? 'No leases on file. Pre-stabilization; rent underwriting is projected.'
              : `${leaseRoll.leaseCount} lease${leaseRoll.leaseCount === 1 ? '' : 's'} aggregated; weighted by leasedKw.`}
          </p>
          <dl className="mt-5 grid gap-3 text-sm">
            <KeyValueRow variant="inline" label="Total leased capacity">
              {leaseRoll.totalLeasedKw > 0 ? `${formatNumber(leaseRoll.totalLeasedKw, 1)} kW` : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="WALT">
              {leaseRoll.weightedAvgTermYears > 0
                ? `${leaseRoll.weightedAvgTermYears.toFixed(1)} yrs`
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Weighted in-place rent">
              {leaseRoll.weightedRentPerKwKrw > 0
                ? `${formatNumber(leaseRoll.weightedRentPerKwKrw, 0)} KRW/kW/mo`
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Mark-to-market gap">
              {leaseRoll.markToMarketGapPct !== null
                ? `${leaseRoll.markToMarketGapPct >= 0 ? '+' : ''}${leaseRoll.markToMarketGapPct.toFixed(1)}%`
                : '—'}
            </KeyValueRow>
            <KeyValueRow variant="inline" label="Tenant credit (avg)">
              {tenantCredit.count > 0 ? tenantCredit.averageScore.toFixed(0) : '—'}
            </KeyValueRow>
          </dl>
          {asset.leases && asset.leases.length > 0 ? (
            <div className="mt-5 overflow-x-auto rounded-[14px] border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.04] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Tenant</th>
                    <th className="px-2 py-2 text-right font-semibold">kW</th>
                    <th className="px-2 py-2 text-right font-semibold">Term</th>
                    <th className="px-2 py-2 text-right font-semibold">In-place</th>
                    <th className="px-2 py-2 text-right font-semibold">Esc</th>
                    <th className="px-2 py-2 text-right font-semibold">MTM gap</th>
                    <th className="px-2 py-2 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-200">
                  {asset.leases.map((lease) => {
                    const mtmGap =
                      lease.markToMarketRatePerKwKrw && lease.baseRatePerKwKrw > 0
                        ? ((lease.markToMarketRatePerKwKrw - lease.baseRatePerKwKrw) /
                            lease.baseRatePerKwKrw) *
                          100
                        : null;
                    return (
                      <tr key={lease.id}>
                        <td className="px-2 py-2 text-white">{lease.tenantName}</td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatNumber(lease.leasedKw, 0)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-400">
                          Y{lease.startYear}–{lease.startYear + lease.termYears - 1}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {formatNumber(lease.baseRatePerKwKrw, 0)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-400">
                          {lease.annualEscalationPct !== null
                            ? `${lease.annualEscalationPct.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {mtmGap !== null ? `${mtmGap >= 0 ? '+' : ''}${mtmGap.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-[10px] text-slate-400">
                          {lease.status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-white/5 bg-white/[0.02] px-2 py-2 text-[10px] text-slate-500">
                WALT = Σ(term × kW) / Σ(kW); weighted in-place rent uses the same kW weighting on
                contract rate; MTM gap = blended market rate / blended in-place rate − 1.
              </p>
            </div>
          ) : null}
          <ProvenancePill entries={provenanceByCard.tenancy} />
        </Card>
      </div>
    </section>
  );
}
