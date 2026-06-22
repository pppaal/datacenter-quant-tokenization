import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import type { SampleReportData } from './types';

export function FeaturesSection({ data }: { data: SampleReportData }) {
  const { asset } = data;
  if (!(asset.featureSnapshots && asset.featureSnapshots.length > 0)) {
    return null;
  }
  return (
    <section id="im-features" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">Feature snapshots</div>
          <Badge>{asset.featureSnapshots.length}</Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
          Underwriting input bundles by namespace (site, power, revenue, legal, permit, market,
          readiness, satellite). Each snapshot captures the inputs read at run time, supporting
          exact reproducibility on re-run.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {asset.featureSnapshots.map((s) => (
            <div
              key={s.id}
              className="rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3"
            >
              <div className="text-[11px] uppercase tracking-wide text-[hsl(var(--muted))]">
                {s.featureNamespace}
              </div>
              <div className="mt-2 font-mono text-xs text-[hsl(var(--foreground-muted))]">
                {s.values?.length ?? 0} value{(s.values?.length ?? 0) === 1 ? '' : 's'}
              </div>
              <div className="mt-1 text-[10px] text-[hsl(var(--muted))]">
                {formatDate(s.snapshotDate)}
              </div>
              {s.sourceVersion ? (
                <div
                  className="mt-1 truncate text-[10px] text-[hsl(var(--muted))]"
                  title={s.sourceVersion}
                >
                  v{s.sourceVersion}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
