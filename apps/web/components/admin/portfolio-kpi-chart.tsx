'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type KpiRow = {
  assetName: string;
  assetCode: string;
  metric: string;
  value: number;
  target: number;
  unit: string;
};

type Props = {
  title: string;
  subtitle: string;
  rows: KpiRow[];
  maxValue?: number;
};

function getTone(value: number, target: number): 'good' | 'warn' | 'danger' {
  const ratio = value / target;
  if (ratio >= 0.95) return 'good';
  if (ratio >= 0.8) return 'warn';
  return 'danger';
}

function getBarColor(tone: 'good' | 'warn' | 'danger') {
  if (tone === 'good') return 'bg-emerald-400';
  if (tone === 'warn') return 'bg-amber-400';
  return 'bg-rose-400';
}

export function PortfolioKpiChart({ title, subtitle, rows, maxValue }: Props) {
  const chartMax = maxValue ?? Math.max(...rows.map((r) => Math.max(r.value, r.target)), 1) * 1.15;

  return (
    <Card className="space-y-4">
      <div>
        <div className="eyebrow">{subtitle}</div>
        <h3 className="mt-2 text-2xl font-semibold text-white">{title}</h3>
      </div>
      <div className="space-y-3">
        {rows.map((row) => {
          const tone = getTone(row.value, row.target);
          const valuePct = Math.min((row.value / chartMax) * 100, 100);
          const targetPct = Math.min((row.target / chartMax) * 100, 100);
          return (
            <div key={row.assetCode} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-white">{row.assetName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{row.value.toFixed(1)}{row.unit}</span>
                  <Badge tone={tone}>{tone === 'good' ? 'On track' : tone === 'warn' ? 'Watch' : 'Risk'}</Badge>
                </div>
              </div>
              <div className="relative h-6 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${getBarColor(tone)} transition-all duration-500`}
                  style={{ width: `${valuePct}%` }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-white/40"
                  style={{ left: `${targetPct}%` }}
                  title={`Target: ${row.target.toFixed(1)}${row.unit}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      {rows.length === 0 && (
        <div className="text-sm text-slate-400">No KPI data available for this portfolio.</div>
      )}
    </Card>
  );
}
