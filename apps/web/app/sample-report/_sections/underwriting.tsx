import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { KeyValueRow } from '@/components/ui/key-value-row';
import { ProvenancePill } from './helpers';
import { formatNumber } from '@/lib/utils';
import type { SampleReportData } from './types';

export function UnderwritingSection({ data }: { data: SampleReportData }) {
  const { latestRun, capRateDecomp, underwriting, provenanceByCard } = data;
  return (
    <section id="im-underwriting" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Underwriting assumptions (base case)</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Inputs anchoring the base scenario on this run. Cap rate and discount rate are the
              primary value drivers; tax leakage and SPV economics drive the gap between unlevered
              and equity returns.
            </p>
          </div>
          <Badge tone="good">{latestRun.engineVersion}</Badge>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
            <div className="fine-print">Valuation rates</div>
            <dl className="mt-3 space-y-2 text-sm">
              <KeyValueRow variant="inline" label="Cap rate">
                {underwriting.capRatePct !== null ? `${underwriting.capRatePct.toFixed(2)}%` : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Discount rate">
                {underwriting.discountRatePct !== null
                  ? `${underwriting.discountRatePct.toFixed(2)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Going-in occupancy">
                {underwriting.occupancyPct !== null
                  ? `${underwriting.occupancyPct.toFixed(1)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="In-place rate">
                {underwriting.monthlyRatePerKwKrw !== null
                  ? `${formatNumber(underwriting.monthlyRatePerKwKrw, 0)} KRW/kW/mo`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Power price">
                {underwriting.powerPriceKrwPerKwh !== null
                  ? `${underwriting.powerPriceKrwPerKwh.toFixed(0)} KRW/kWh`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="PUE target">
                {underwriting.pueTarget !== null ? underwriting.pueTarget.toFixed(2) : '—'}
              </KeyValueRow>
            </dl>
          </div>

          <div className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
            <div className="fine-print">Tax stack</div>
            <dl className="mt-3 space-y-2 text-sm">
              <KeyValueRow variant="inline" label="Corporate tax">
                {underwriting.corporateTaxPct !== null
                  ? `${underwriting.corporateTaxPct.toFixed(1)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Property tax">
                {underwriting.propertyTaxPct !== null
                  ? `${underwriting.propertyTaxPct.toFixed(2)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Acquisition tax">
                {underwriting.acquisitionTaxPct !== null
                  ? `${underwriting.acquisitionTaxPct.toFixed(1)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Exit tax">
                {underwriting.exitTaxPct !== null ? `${underwriting.exitTaxPct.toFixed(1)}%` : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="VAT recovery">
                {underwriting.vatRecoveryPct !== null
                  ? `${underwriting.vatRecoveryPct.toFixed(0)}%`
                  : '—'}
              </KeyValueRow>
            </dl>
          </div>

          <div className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
            <div className="fine-print">SPV & promote</div>
            <dl className="mt-3 space-y-2 text-sm">
              <KeyValueRow variant="inline" label="Mgmt fee">
                {underwriting.managementFeePct !== null
                  ? `${underwriting.managementFeePct.toFixed(2)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Performance fee">
                {underwriting.performanceFeePct !== null
                  ? `${underwriting.performanceFeePct.toFixed(1)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Promote hurdle">
                {underwriting.promoteThresholdPct !== null
                  ? `${underwriting.promoteThresholdPct.toFixed(1)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Promote share">
                {underwriting.promoteSharePct !== null
                  ? `${underwriting.promoteSharePct.toFixed(1)}%`
                  : '—'}
              </KeyValueRow>
              <KeyValueRow variant="inline" label="Reserve target">
                {underwriting.reserveTargetMonths !== null
                  ? `${underwriting.reserveTargetMonths.toFixed(0)} mo`
                  : '—'}
              </KeyValueRow>
            </dl>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-slate-500">
          Stage / location / permit / flood / wildfire multipliers applied during scenario
          generation:&nbsp; stage{' '}
          {underwriting.stageFactor !== null ? underwriting.stageFactor.toFixed(2) : '—'} · location
          ×{underwriting.locationPremium !== null ? underwriting.locationPremium.toFixed(2) : '—'} ·
          permit ×
          {underwriting.permitPenalty !== null ? underwriting.permitPenalty.toFixed(2) : '—'} ·
          flood ×{underwriting.floodPenalty !== null ? underwriting.floodPenalty.toFixed(3) : '—'} ·
          wildfire ×
          {underwriting.wildfirePenalty !== null ? underwriting.wildfirePenalty.toFixed(3) : '—'}.
        </p>

        {capRateDecomp ? (
          <div className="mt-5 rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="fine-print">Cap rate decomposition</div>
                <p className="mt-1 max-w-3xl text-xs text-slate-400">
                  Bridges the headline cap rate into 6 components so the LP can see what is driving
                  the price. RFR and growth from the macro feed; submarket spread from comp
                  regression; obsolescence from vintage age. The sector premium (ERP × beta) uses
                  standard assumptions, and any leg shown at 0 bps reflects a missing input rather
                  than a market reading — see each component note.
                </p>
              </div>
              <Badge>{capRateDecomp.capRatePct.toFixed(2)}% implied</Badge>
            </div>
            <div className="mt-4 overflow-x-auto rounded-[12px] border border-[hsl(var(--border))]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2 font-semibold">Component</th>
                    <th className="px-2 py-2 text-right font-semibold">Sign</th>
                    <th className="px-2 py-2 text-right font-semibold">pct</th>
                    <th className="px-2 py-2 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))] text-slate-200">
                  {capRateDecomp.components.map((c) => (
                    <tr key={c.key}>
                      <td className="px-2 py-2 text-slate-300">{c.label}</td>
                      <td
                        className={`px-2 py-2 text-right font-mono ${
                          c.sign === '+' ? 'text-amber-300' : 'text-emerald-300'
                        }`}
                      >
                        {c.sign}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{c.pct.toFixed(2)}%</td>
                      <td className="px-2 py-2 text-[10px] text-slate-400">{c.notes}</td>
                    </tr>
                  ))}
                  <tr className="bg-[hsl(var(--surface-hover))] font-semibold">
                    <td className="px-2 py-2 text-white">Implied cap rate</td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-right font-mono text-white">
                      {capRateDecomp.capRatePct.toFixed(2)}%
                    </td>
                    <td className="px-2 py-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <ProvenancePill entries={provenanceByCard.scenarioEngine} />
      </Card>
    </section>
  );
}
