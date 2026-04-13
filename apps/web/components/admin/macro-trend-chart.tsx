'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type DataPoint = {
  date: string;
  value: number;
};

type TrendSeries = {
  label: string;
  seriesKey: string;
  unit: string;
  points: DataPoint[];
  latestValue: number;
  changeDirection: 'up' | 'down' | 'flat';
  changePct: number;
};

type Props = {
  title: string;
  subtitle: string;
  series: TrendSeries[];
};

const CHART_WIDTH = 280;
const CHART_HEIGHT = 64;
const CHART_PADDING = 4;

function buildPathD(points: DataPoint[], chartWidth: number, chartHeight: number) {
  if (points.length < 2) return '';
  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const innerW = chartWidth - CHART_PADDING * 2;
  const innerH = chartHeight - CHART_PADDING * 2;

  return points
    .map((point, i) => {
      const x = CHART_PADDING + (i / (points.length - 1)) * innerW;
      const y = CHART_PADDING + innerH - ((point.value - minVal) / range) * innerH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function directionArrow(direction: 'up' | 'down' | 'flat') {
  if (direction === 'up') return '\u2191';
  if (direction === 'down') return '\u2193';
  return '\u2192';
}

function directionTone(direction: 'up' | 'down' | 'flat', seriesKey: string) {
  // For vacancy and cap rate, up is bad. For others, context-dependent.
  const upIsBad = seriesKey.includes('vacancy') || seriesKey.includes('cap_rate');
  if (direction === 'flat') return 'neutral' as const;
  if (direction === 'up') return upIsBad ? ('danger' as const) : ('good' as const);
  return upIsBad ? ('good' as const) : ('warn' as const);
}

function strokeColor(direction: 'up' | 'down' | 'flat', seriesKey: string) {
  const tone = directionTone(direction, seriesKey);
  if (tone === 'good') return 'stroke-emerald-400';
  if (tone === 'danger') return 'stroke-rose-400';
  if (tone === 'warn') return 'stroke-amber-400';
  return 'stroke-slate-400';
}

export function MacroTrendChart({ title, subtitle, series }: Props) {
  return (
    <Card className="space-y-4">
      <div>
        <div className="eyebrow">{subtitle}</div>
        <h3 className="mt-2 text-2xl font-semibold text-white">{title}</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {series.map((s) => (
          <div
            key={s.seriesKey}
            className="space-y-2 rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex items-center justify-between">
              <div className="fine-print">{s.label}</div>
              <Badge tone={directionTone(s.changeDirection, s.seriesKey)}>
                {directionArrow(s.changeDirection)} {Math.abs(s.changePct).toFixed(1)}%
              </Badge>
            </div>
            <div className="text-2xl font-semibold text-white">
              {s.latestValue.toFixed(s.unit === '%' ? 1 : 2)}
              {s.unit}
            </div>
            {s.points.length >= 2 ? (
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                className="h-16 w-full"
                preserveAspectRatio="none"
              >
                <path
                  d={buildPathD(s.points, CHART_WIDTH, CHART_HEIGHT)}
                  fill="none"
                  className={`${strokeColor(s.changeDirection, s.seriesKey)} opacity-80`}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div className="flex h-16 items-center justify-center text-xs text-slate-500">
                Insufficient data points
              </div>
            )}
            <div className="flex justify-between text-xs text-slate-500">
              <span>{s.points[0]?.date ?? '\u2014'}</span>
              <span>{s.points[s.points.length - 1]?.date ?? '\u2014'}</span>
            </div>
          </div>
        ))}
      </div>
      {series.length === 0 && (
        <div className="text-sm text-slate-400">No macro trend data is available yet.</div>
      )}
    </Card>
  );
}
