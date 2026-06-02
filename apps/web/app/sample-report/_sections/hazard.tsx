import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { describeHazard } from '@/lib/services/im/hazard';
import { FreshnessDot } from './helpers';
import type { SampleReportData } from './types';

export function HazardSection({ data }: { data: SampleReportData }) {
  const { asset } = data;
  if (!asset.siteProfile) {
    return null;
  }
  return (
    <section id="im-hazard" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Site hazard scores</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Per-asset physical-risk readings. Flood and wildfire each carry a confidence-score
              penalty (×0.05 and ×0.04 respectively). Insurance pricing and reserve sizing track the
              same readings.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <FreshnessDot observedAt={asset.siteProfile.sourceUpdatedAt} />
            <Badge>{asset.siteProfile.sourceStatus}</Badge>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {(
            [
              ['Flood risk', asset.siteProfile.floodRiskScore],
              ['Wildfire risk', asset.siteProfile.wildfireRiskScore],
              ['Seismic risk', asset.siteProfile.seismicRiskScore]
            ] as const
          ).map(([label, score]) => {
            const desc = describeHazard(score);
            const tone =
              desc.tone === 'good'
                ? 'border-emerald-300/30 bg-emerald-300/[0.04]'
                : desc.tone === 'warn'
                  ? 'border-amber-300/30 bg-amber-300/[0.04]'
                  : desc.tone === 'risk'
                    ? 'border-rose-300/30 bg-rose-300/[0.04]'
                    : 'border-white/10 bg-white/[0.02]';
            const dotTone =
              desc.tone === 'good'
                ? 'bg-emerald-300'
                : desc.tone === 'warn'
                  ? 'bg-amber-300'
                  : desc.tone === 'risk'
                    ? 'bg-rose-300'
                    : 'bg-slate-600';
            return (
              <div key={label} className={`rounded-[18px] border p-4 ${tone}`}>
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${dotTone}`} />
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
                </div>
                <div className="mt-3 text-2xl font-semibold text-white">
                  {score !== null && score !== undefined ? score.toFixed(1) : '—'}
                </div>
                <div className="mt-1 text-xs text-slate-400">{desc.label} band</div>
              </div>
            );
          })}
        </div>
        {asset.siteProfile.siteNotes ? (
          <p className="mt-4 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2 text-xs leading-5 text-slate-400">
            <span className="font-semibold text-slate-300">Notes: </span>
            {asset.siteProfile.siteNotes}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
