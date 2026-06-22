import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function EsgSection({ data }: { data: SampleReportData }) {
  const { asset, esgSummary, emissionsBreakdown } = data;
  if (!esgSummary) {
    return null;
  }
  return (
    <section id="im-esg" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">ESG &amp; sustainability</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Operational sustainability metrics anchoring LP-side ESG disclosure. PUE governs
              Scope-2 carbon intensity; renewable share governs Scope-2 reduction path; backup
              autonomy governs Tier-rated uptime and outage exposure.
            </p>
          </div>
          {esgSummary.composite ? (
            <Badge tone={esgSummary.composite === 'good' ? 'good' : 'warn'}>
              Composite:{' '}
              {esgSummary.composite === 'good'
                ? 'Strong'
                : esgSummary.composite === 'warn'
                  ? 'Moderate'
                  : 'Weak'}
            </Badge>
          ) : null}
        </div>
        {esgSummary.utility ? (
          <div className="mt-3 text-[11px] text-slate-500">
            Utility: <span className="text-slate-300">{esgSummary.utility}</span>
          </div>
        ) : null}
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {esgSummary.rows.map((row) => {
            const tone =
              row.tone === 'good'
                ? 'border-emerald-300/30 bg-emerald-300/[0.03]'
                : row.tone === 'warn'
                  ? 'border-amber-300/30 bg-amber-300/[0.03]'
                  : row.tone === 'risk'
                    ? 'border-rose-300/30 bg-rose-300/[0.03]'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))]';
            const dot =
              row.tone === 'good'
                ? 'bg-emerald-300'
                : row.tone === 'warn'
                  ? 'bg-amber-300'
                  : row.tone === 'risk'
                    ? 'bg-rose-300'
                    : 'bg-slate-600';
            return (
              <div key={row.key} className={`rounded-[16px] border ${tone} p-3`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">
                    {row.label}
                  </div>
                  {row.band ? (
                    <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                      {row.band}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 font-mono text-lg font-semibold text-white">
                  {row.value !== null
                    ? `${row.value.toFixed(row.unit === '%' ? 0 : 2)}${row.unit ? ` ${row.unit}` : ''}`
                    : '—'}
                </div>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">{row.interpretation}</p>
              </div>
            );
          })}
        </div>

        {asset.carbonRecords && asset.carbonRecords.length > 0
          ? (() => {
              // Pick a single primary line per (scope, category, vintage)
              // to avoid LBs and MBs being added together by readers.
              // Market-based wins where present (matches GHG Protocol
              // primary disclosure for purchased electricity).
              type R = (typeof asset.carbonRecords)[number];
              const buckets = new Map<string, R[]>();
              for (const r of asset.carbonRecords) {
                const k = `${r.scope}-${r.category}-${r.vintageYear}`;
                if (!buckets.has(k)) buckets.set(k, []);
                buckets.get(k)!.push(r);
              }
              const primary: R[] = [];
              const alternates: R[] = [];
              for (const arr of buckets.values()) {
                if (arr.length === 1) {
                  primary.push(arr[0]!);
                  continue;
                }
                const mb = arr.find((r) => r.methodology === 'GHG_PROTOCOL_MB');
                const lb = arr.find((r) => r.methodology === 'GHG_PROTOCOL_LB');
                if (mb) {
                  primary.push(mb);
                  for (const a of arr) if (a !== mb) alternates.push(a);
                } else if (lb) {
                  primary.push(lb);
                  for (const a of arr) if (a !== lb) alternates.push(a);
                } else {
                  primary.push(arr[0]!);
                  for (const a of arr.slice(1)) alternates.push(a);
                }
              }
              const totalPrimary = primary.reduce((s, r) => s + r.tco2e, 0);
              return (
                <div className="mt-5 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="fine-print">Carbon emissions register (verified)</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="good">{primary.length} primary</Badge>
                      <Badge>
                        Total{' '}
                        {totalPrimary.toLocaleString(undefined, {
                          maximumFractionDigits: 0
                        })}{' '}
                        tCO2e
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 overflow-x-auto rounded-[12px] border border-[hsl(var(--border))]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[hsl(var(--surface-hover))] text-left uppercase tracking-wide text-slate-500">
                          <th className="px-2 py-2 font-semibold">Scope</th>
                          <th className="px-2 py-2 font-semibold">Category</th>
                          <th className="px-2 py-2 text-right font-semibold">Vintage</th>
                          <th className="px-2 py-2 text-right font-semibold">tCO2e</th>
                          <th className="px-2 py-2 font-semibold">Methodology</th>
                          <th className="px-2 py-2 font-semibold">Verifier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--border))] text-slate-200">
                        {primary.map((rec) => (
                          <tr key={rec.id}>
                            <td className="px-2 py-2 font-mono text-slate-300">
                              Scope {rec.scope}
                            </td>
                            <td className="px-2 py-2 text-[11px] text-slate-300">
                              {rec.category.replace(/_/g, ' ').toLowerCase()}
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-slate-400">
                              {rec.vintageYear}
                            </td>
                            <td className="px-2 py-2 text-right font-mono">
                              {rec.tco2e.toLocaleString(undefined, {
                                maximumFractionDigits: 0
                              })}
                            </td>
                            <td className="px-2 py-2 text-[10px] text-slate-400">
                              {rec.methodology ?? '—'}
                            </td>
                            <td className="px-2 py-2 text-[10px] text-slate-400">
                              {rec.verifiedBy ?? '—'}
                              {rec.notes ? (
                                <div className="text-[9px] text-slate-500">{rec.notes}</div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {alternates.length > 0 ? (
                    <p className="mt-3 text-[10px] leading-5 text-slate-500">
                      <span className="font-semibold uppercase tracking-wide text-slate-400">
                        Alternate methodologies on file:{' '}
                      </span>
                      {alternates
                        .map(
                          (a) =>
                            `Scope ${a.scope} ${a.methodology ?? 'method n/a'} = ${a.tco2e.toLocaleString(
                              undefined,
                              { maximumFractionDigits: 0 }
                            )} tCO2e`
                        )
                        .join(' · ')}
                      . Per GHG Protocol Scope 2 dual-reporting, the market-based reading is shown
                      as primary (reflects executed PPAs / I-REC retirements); location-based is the
                      alternate. The figures should not be summed.
                    </p>
                  ) : null}
                </div>
              );
            })()
          : null}

        {emissionsBreakdown.totalAnnualtCO2e !== null ? (
          <div className="mt-5 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="fine-print">
                Scope 1 / 2 / 3 emissions estimate
                {(asset.carbonRecords?.length ?? 0) > 0
                  ? ' (derived — for comparison vs verified above)'
                  : ''}
              </div>
              <div className="text-[10px] text-slate-500">
                Total ≈{' '}
                <span className="font-mono text-slate-300">
                  {emissionsBreakdown.totalAnnualtCO2e.toLocaleString(undefined, {
                    maximumFractionDigits: 0
                  })}{' '}
                  tCO2e/yr
                </span>
                {emissionsBreakdown.carbonIntensitykgPerKwh !== null
                  ? ` · grid intensity ${emissionsBreakdown.carbonIntensitykgPerKwh.toFixed(3)} kgCO2e/kWh`
                  : ''}
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {[
                {
                  label: 'Scope 1 — direct',
                  value: emissionsBreakdown.scope1tCO2e,
                  sub: 'Backup generator combustion'
                },
                {
                  label: 'Scope 2 — purchased power',
                  value: emissionsBreakdown.scope2tCO2e,
                  sub: 'Grid kWh × KR factor × (1 − renewable)'
                },
                {
                  label: 'Scope 3 — embodied (amortized)',
                  value: emissionsBreakdown.scope3tCO2e,
                  sub: 'Construction carbon over hold'
                }
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-[12px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    {s.label}
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-white">
                    {s.value !== null
                      ? `${s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} tCO2e/yr`
                      : '—'}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">{s.sub}</div>
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-[10px] text-slate-500">
              {emissionsBreakdown.notes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
