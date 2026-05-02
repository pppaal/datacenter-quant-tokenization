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

function getBarGlow(tone: 'good' | 'warn' | 'danger') {
  if (tone === 'good') return 'group-hover:shadow-[0_0_18px_rgba(52,211,153,0.25)]';
  if (tone === 'warn') return 'group-hover:shadow-[0_0_18px_rgba(251,191,36,0.25)]';
  return 'group-hover:shadow-[0_0_18px_rgba(251,113,133,0.25)]';
}

export function PortfolioKpiChart({ title, subtitle, rows, maxValue }: Props) {
  const chartMax =
    rows.length > 0
      ? (maxValue ?? Math.max(...rows.map((r) => Math.max(r.value, r.target)), 1) * 1.15)
      : 1;

  return (
    <Card className="space-y-4">
      <div>
        <div className="eyebrow">{subtitle}</div>
        <h3 className="mt-2 text-2xl font-semibold text-white">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 stroke-slate-400"
              fill="none"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 20V10" />
              <path d="M10 20V4" />
              <path d="M16 20v-8" />
              <path d="M22 20H2" />
            </svg>
          </div>
          <div className="text-sm font-medium text-slate-200">No KPI rows yet</div>
          <div className="fine-print max-w-[260px]">
            KPI performance against target will render here once portfolio metrics are ingested.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const tone = getTone(row.value, row.target);
            const valuePct = Math.min((row.value / chartMax) * 100, 100);
            const targetPct = Math.min((row.target / chartMax) * 100, 100);
            return (
              <div
                key={row.assetCode}
                className="group space-y-1 rounded-[16px] px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-white">{row.assetName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      {row.value.toFixed(1)}
                      {row.unit}
                    </span>
                    <Badge tone={tone}>
                      {tone === 'good' ? 'On track' : tone === 'warn' ? 'Watch' : 'Risk'}
                    </Badge>
                  </div>
                </div>
                <div className="relative h-6 overflow-visible rounded-full bg-white/[0.06]">
                  <div className="absolute inset-0 overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ease-out ${getBarColor(tone)} ${getBarGlow(tone)}`}
                      style={{ width: `${valuePct}%` }}
                    />
                  </div>
                  <div
                    className="pointer-events-none absolute -top-1 bottom-[-4px] w-0.5 bg-white/50 transition-opacity group-hover:bg-white/80"
                    style={{ left: `${targetPct}%` }}
                  />
                  <div
                    className="pointer-events-none absolute -top-4 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-slate-900/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-300 opacity-80 transition-opacity group-hover:opacity-100"
                    style={{ left: `${targetPct}%` }}
                  >
                    Tgt {row.target.toFixed(1)}
                    {row.unit}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
