import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatNumber } from '@/lib/utils';

type FeatureValueLike = {
  id: string;
  key: string;
  numberValue: number | null;
  textValue: string | null;
  unit: string | null;
};

type FeatureSnapshotLike = {
  id: string;
  featureNamespace: string;
  sourceVersion: string | null;
  snapshotDate: Date | string;
  values: FeatureValueLike[];
};

type Props = {
  snapshots: FeatureSnapshotLike[];
  title?: string;
  emptyMessage?: string;
};

function formatFeatureValue(value: FeatureValueLike) {
  if (value.textValue) return value.textValue;
  if (value.numberValue !== null && value.numberValue !== undefined) {
    return `${formatNumber(value.numberValue, 2)}${value.unit ? ` ${value.unit}` : ''}`;
  }
  return 'N/A';
}

function toLabel(namespace: string) {
  return namespace.replace(/_/g, ' ');
}

export function FeatureSnapshotPanel({
  snapshots,
  title = 'Feature Snapshots',
  emptyMessage = 'No promoted feature snapshots yet.'
}: Props) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow">{title}</div>
        <Badge>{formatNumber(snapshots.length, 0)} namespaces</Badge>
      </div>
      {snapshots.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{toLabel(snapshot.featureNamespace)}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {snapshot.sourceVersion ?? 'manual snapshot'}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>{formatDate(snapshot.snapshotDate)}</div>
                  <div className="mt-1">{formatNumber(snapshot.values.length, 0)} values</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {snapshot.values.slice(0, 4).map((value) => (
                  <div key={value.id} className="rounded-2xl border border-border bg-slate-950/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{value.key}</div>
                    <div className="mt-2 text-sm text-white">{formatFeatureValue(value)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
