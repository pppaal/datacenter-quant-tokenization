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

type ChartGeometry = {
  linePath: string;
  areaPath: string;
  latestX: number;
  latestY: number;
  midY: number;
};

function buildGeometry(points: DataPoint[], chartWidth: number, chartHeight: number): ChartGeometry | null {
  if (points.length < 2) return null;
  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const innerW = chartWidth - CHART_PADDING * 2;
  const innerH = chartHeight - CHART_PADDING * 2;

  const coords = points.map((point, i) => {
    const x = CHART_PADDING + (i / (points.length - 1)) * innerW;
    const y = CHART_PADDING + innerH - ((point.value - minVal) / range) * innerH;
    return { x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  const baselineY = chartHeight - CHART_PADDING;
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const areaPath =
    `M${first.x.toFixed(1)},${baselineY.toFixed(1)} ` +
    coords.map((c) => `L${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ') +
    ` L${last.x.toFixed(1)},${baselineY.toFixed(1)} Z`;

  return {
    linePath,
    areaPath,
    latestX: last.x,
    latestY: last.y,
    midY: CHART_PADDING + innerH / 2,
  };
}

function directionArrow(direction: 'up' | 'down' | 'flat') {
  if (direction === 'up') return '\u2191';
  if (direction === 'down') return '\u2193';
  return '\u2192';
}

type Tone = 'good' | 'warn' | 'danger' | 'neutral';

function directionTone(direction: 'up' | 'down' | 'flat', seriesKey: string): Tone {
  const upIsBad = seriesKey.includes('vacancy') || seriesKey.includes('cap_rate');
  if (direction === 'flat') return 'neutral';
  if (direction === 'up') return upIsBad ? 'danger' : 'good';
  return upIsBad ? 'good' : 'warn';
}

function toneStrokeClass(tone: Tone) {
  if (tone === 'good') return 'stroke-emerald-400';
  if (tone === 'danger') return 'stroke-rose-400';
  if (tone === 'warn') return 'stroke-amber-400';
  return 'stroke-slate-400';
}

function toneFillClass(tone: Tone) {
  if (tone === 'good') return 'fill-emerald-400';
  if (tone === 'danger') return 'fill-rose-400';
  if (tone === 'warn') return 'fill-amber-400';
  return 'fill-slate-400';
}

function toneGradientStop(tone: Tone) {
  if (tone === 'good') return 'rgb(52,211,153)';
  if (tone === 'danger') return 'rgb(251,113,133)';
  if (tone === 'warn') return 'rgb(251,191,36)';
  return 'rgb(148,163,184)';
}

export function MacroTrendChart({ title, subtitle, series }: Props) {
  return (
    <Card className="space-y-4">
      <div>
        <div className="eyebrow">{subtitle}</div>
        <h3 className="mt-2 text-2xl font-semibold text-white">{title}</h3>
      </div>
      {series.length === 0 ? (
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
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M14 7h7v7" />
            </svg>
          </div>
          <div className="text-sm font-medium text-slate-200">No data yet</div>
          <div className="fine-print max-w-[260px]">
            Macro trend series will appear here once indicators are published.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {series.map((s) => {
            const tone = directionTone(s.changeDirection, s.seriesKey);
            const geometry = buildGeometry(s.points, CHART_WIDTH, CHART_HEIGHT);
            const gradientId = `macro-trend-grad-${s.seriesKey}`;
            return (
              <div
                key={s.seriesKey}
                className="space-y-2 rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="fine-print">{s.label}</div>
                  <Badge tone={tone}>
                    {directionArrow(s.changeDirection)} {Math.abs(s.changePct).toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-2xl font-semibold text-white">
                  {s.latestValue.toFixed(s.unit === '%' ? 1 : 2)}
                  {s.unit}
                </div>
                {geometry ? (
                  <svg
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                    className="h-16 w-full overflow-visible"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={toneGradientStop(tone)} stopOpacity="0.35" />
                        <stop offset="100%" stopColor={toneGradientStop(tone)} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <line
                      x1={CHART_PADDING}
                      x2={CHART_WIDTH - CHART_PADDING}
                      y1={geometry.midY}
                      y2={geometry.midY}
                      className="stroke-white/10"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path d={geometry.areaPath} fill={`url(#${gradientId})`} stroke="none" />
                    <path
                      d={geometry.linePath}
                      fill="none"
                      className={`${toneStrokeClass(tone)} opacity-90`}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={geometry.latestX}
                      cy={geometry.latestY}
                      r="3"
                      className={toneFillClass(tone)}
                    />
                    <circle
                      cx={geometry.latestX}
                      cy={geometry.latestY}
                      r="5"
                      className={`${toneFillClass(tone)} opacity-25`}
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
            );
          })}
        </div>
      )}
    </Card>
  );
}
