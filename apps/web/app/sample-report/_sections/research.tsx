import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FreshnessDot } from './helpers';
import { formatDate } from '@/lib/utils';
import type { SampleReportData } from './types';

export function ResearchSection({ data }: { data: SampleReportData }) {
  const { asset } = data;
  if (
    !(
      (asset.researchSnapshots && asset.researchSnapshots.length > 0) ||
      (asset.coverageTasks && asset.coverageTasks.length > 0) ||
      (asset.aiInsights && asset.aiInsights.length > 0)
    )
  ) {
    return null;
  }
  return (
    <section id="im-research" className="app-shell py-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {asset.researchSnapshots && asset.researchSnapshots.length > 0 ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Research desk publications</div>
              <Badge>{asset.researchSnapshots.length}</Badge>
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
              Approved research snapshots anchoring the asset macro context. Each snapshot freshness
              status determines whether the underwriting may rely on it without a refresh.
            </p>
            <ul className="mt-5 space-y-2">
              {asset.researchSnapshots.slice(0, 6).map((s) => (
                <li
                  key={s.id}
                  className="rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[hsl(var(--foreground))]">{s.title}</span>
                    <div className="flex items-center gap-2">
                      <FreshnessDot observedAt={s.snapshotDate} />
                      <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">
                        {s.freshnessStatus ?? 'n/a'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                    {formatDate(s.snapshotDate)} · {s.snapshotType}
                    {s.sourceSystem ? ` · ${s.sourceSystem}` : ''}
                  </div>
                  {s.summary ? (
                    <p className="mt-2 text-xs leading-5 text-[hsl(var(--foreground-muted))]">
                      {s.summary}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {asset.coverageTasks && asset.coverageTasks.length > 0 ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">Research coverage queue</div>
              <Badge>{asset.coverageTasks.filter((t) => t.status === 'OPEN').length} open</Badge>
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
              Outstanding research coverage items for the asset. HIGH-priority open items reduce
              confidence and require closure prior to investment committee.
            </p>
            <ul className="mt-5 space-y-2">
              {asset.coverageTasks.slice(0, 8).map((t) => {
                const priorityTone =
                  t.priority === 'HIGH'
                    ? 'border-rose-300/20 bg-rose-300/[0.04]'
                    : t.priority === 'LOW'
                      ? 'border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))]'
                      : 'border-amber-300/15 bg-amber-300/[0.03]';
                return (
                  <li
                    key={t.id}
                    className={`rounded-[14px] border px-3 py-2 text-sm ${priorityTone}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[hsl(var(--foreground))]">{t.title}</span>
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                        <span className="text-[hsl(var(--muted))]">{t.taskType}</span>
                        <span className="text-[hsl(var(--foreground-muted))]">{t.priority}</span>
                        <span
                          className={
                            t.status === 'OPEN'
                              ? 'text-[hsl(var(--danger))]'
                              : 'text-[hsl(var(--success))]'
                          }
                        >
                          {t.status}
                        </span>
                      </div>
                    </div>
                    {t.notes ? (
                      <p className="mt-1 text-[11px] leading-5 text-[hsl(var(--foreground-muted))]">
                        {t.notes}
                      </p>
                    ) : null}
                    {t.dueDate ? (
                      <div className="mt-1 text-[10px] text-[hsl(var(--muted))]">
                        due {formatDate(t.dueDate)}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null}

        {asset.aiInsights && asset.aiInsights.length > 0 ? (
          <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="eyebrow">AI insights</div>
              <Badge>{asset.aiInsights.length}</Badge>
            </div>
            <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
              Model-generated commentary on the asset and its valuation runs. Each insight carries
              model attribution and an evidence reference.
            </p>
            <ul className="mt-5 space-y-2">
              {asset.aiInsights.slice(0, 6).map((insight) => (
                <li
                  key={insight.id}
                  className="rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[hsl(var(--foreground))]">
                      {insight.title ?? insight.insightType}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">
                      {insight.modelName} · {insight.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[hsl(var(--foreground-muted))]">
                    {insight.content}
                  </p>
                  <div className="mt-1 text-[10px] text-[hsl(var(--muted))]">
                    {formatDate(insight.createdAt)} · {insight.insightType}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
