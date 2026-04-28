import { Badge } from '@/components/ui/badge';
import { cn, formatNumber } from '@/lib/utils';
import {
  getSatelliteRiskLabel,
  getSatelliteRiskTone,
  type SatelliteRiskSnapshot
} from '@/lib/valuation/satellite-risk';

type Props = {
  snapshot?: SatelliteRiskSnapshot | null;
  title?: string | null;
  compact?: boolean;
  showOverlayMetrics?: boolean;
  className?: string;
};

export function SatelliteRiskSummary({
  snapshot,
  title = 'Satellite Risk',
  compact = false,
  showOverlayMetrics = !compact,
  className
}: Props) {
  const floodRiskScore = snapshot?.floodRiskScore ?? null;
  const wildfireRiskScore = snapshot?.wildfireRiskScore ?? null;
  const climateNote = snapshot?.climateNote ?? null;
  const recentSatellitePrecipMm = snapshot?.recentSatellitePrecipMm ?? null;
  const recentFireHotspots = snapshot?.recentFireHotspots ?? null;
  const recentMaxFireRadiativePowerMw = snapshot?.recentMaxFireRadiativePowerMw ?? null;

  return (
    <div className={cn('rounded-2xl border border-border bg-slate-950/40 p-4', className)}>
      {title ? <div className="text-slate-500">{title}</div> : null}
      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={getSatelliteRiskTone(floodRiskScore)}>
              Flood {getSatelliteRiskLabel(floodRiskScore)}
            </Badge>
            <Badge tone={getSatelliteRiskTone(wildfireRiskScore)}>
              Fire {getSatelliteRiskLabel(wildfireRiskScore)}
            </Badge>
          </div>
          {!compact && climateNote ? (
            <div className="mt-3 text-sm text-slate-400">{climateNote}</div>
          ) : null}
          {!compact && !climateNote ? (
            <div className="mt-3 text-sm text-slate-500">No satellite climate overlay yet.</div>
          ) : null}
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Flood {formatNumber(floodRiskScore, 1)}</div>
          <div className="mt-1">Fire {formatNumber(wildfireRiskScore, 1)}</div>
        </div>
      </div>
      {showOverlayMetrics && (recentSatellitePrecipMm !== null || recentFireHotspots !== null) && (
        <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
          <div>GPM precipitation {formatNumber(recentSatellitePrecipMm, 1)} mm/day</div>
          <div>
            FIRMS hotspots {formatNumber(recentFireHotspots, 0)}
            {recentMaxFireRadiativePowerMw !== null
              ? ` / max FRP ${formatNumber(recentMaxFireRadiativePowerMw, 1)} MW`
              : ''}
          </div>
        </div>
      )}
    </div>
  );
}
