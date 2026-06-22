import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FreshnessDot } from './helpers';
import { formatDate } from '@/lib/utils';
import type { SampleReportData } from './types';

export function IcPacketSection({ data }: { data: SampleReportData }) {
  const { asset } = data;
  if (!(asset.committeePackets && asset.committeePackets.length > 0)) {
    return null;
  }
  return (
    <section id="im-ic-packet" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow">Investment committee packets</div>
          <Badge>
            {asset.committeePackets.length} packet
            {asset.committeePackets.length === 1 ? '' : 's'}
          </Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
          Investment committee packets prepared on the asset. Decision summary records the outcome
          (CONDITIONAL / APPROVED / DEFERRED / DECLINED); follow-up captures the resulting action
          items.
        </p>
        <ul className="mt-5 space-y-3">
          {asset.committeePackets.map((p) => {
            const statusTone =
              p.status === 'APPROVED'
                ? 'border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]'
                : p.status === 'DECLINED'
                  ? 'border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))] text-[hsl(var(--danger))]'
                  : 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] text-[hsl(var(--warning))]';
            return (
              <li
                key={p.id}
                className="rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[hsl(var(--foreground))]">{p.title}</span>
                      <FreshnessDot observedAt={p.scheduledFor ?? p.updatedAt} />
                    </div>
                    <div className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                      <span className="font-mono">{p.packetCode}</span>
                      {p.scheduledFor ? ` · scheduled ${formatDate(p.scheduledFor)}` : ''}
                      {p.preparedByLabel ? ` · prepared by ${p.preparedByLabel}` : ''}
                    </div>
                  </div>
                  <span
                    className={`rounded-[10px] border px-2 py-1 text-[10px] font-mono uppercase tracking-wide ${statusTone}`}
                  >
                    {p.status}
                  </span>
                </div>
                {p.decisionSummary ? (
                  <p className="mt-3 text-sm leading-6 text-[hsl(var(--foreground))]">
                    <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">
                      Decision ·{' '}
                    </span>
                    {p.decisionSummary}
                  </p>
                ) : null}
                {p.followUpSummary ? (
                  <p className="mt-2 text-sm leading-6 text-[hsl(var(--foreground-muted))]">
                    <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">
                      Follow-up ·{' '}
                    </span>
                    {p.followUpSummary}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
