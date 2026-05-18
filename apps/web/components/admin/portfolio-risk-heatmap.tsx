'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type RiskAsset = {
  id: string;
  name: string;
  assetCode: string;
  occupancyRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  marketRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  overallHealth: 'good' | 'warn' | 'danger';
};

type Props = {
  assets: RiskAsset[];
};

const riskLevels = ['LOW', 'MEDIUM', 'HIGH'] as const;
const axisLabels: Record<(typeof riskLevels)[number], string> = {
  LOW: 'LOW',
  MEDIUM: 'MED',
  HIGH: 'HIGH'
};

function healthDot(health: 'good' | 'warn' | 'danger') {
  if (health === 'good') return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]';
  if (health === 'warn') return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]';
  return 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]';
}

function cellBg(occupancy: string, market: string) {
  const riskScore =
    (occupancy === 'HIGH' ? 2 : occupancy === 'MEDIUM' ? 1 : 0) +
    (market === 'HIGH' ? 2 : market === 'MEDIUM' ? 1 : 0);
  if (riskScore >= 3) return 'bg-rose-500/[0.08] border-rose-500/15';
  if (riskScore >= 2) return 'bg-amber-500/[0.08] border-amber-500/15';
  return 'bg-emerald-500/5 border-emerald-500/10';
}

export function PortfolioRiskHeatmap({ assets }: Props) {
  return (
    <Card className="space-y-4">
      <div>
        <div className="eyebrow">Risk Surface</div>
        <h3 className="mt-2 text-2xl font-semibold text-white">Portfolio risk heatmap</h3>
        <p className="mt-2 text-sm text-slate-400">
          Occupancy risk vs market risk. Each dot is an active portfolio asset.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col items-stretch justify-between py-1 pr-2 text-right font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          {[...riskLevels].reverse().map((level) => (
            <span key={`y-${level}`} className="flex h-full items-center justify-end">
              {axisLabels[level]}
            </span>
          ))}
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-3 grid-rows-3 gap-1">
            {[...riskLevels].reverse().map((marketLevel) =>
              riskLevels.map((occupancyLevel) => {
                const cellAssets = assets.filter(
                  (a) => a.occupancyRisk === occupancyLevel && a.marketRisk === marketLevel
                );
                const isEmpty = cellAssets.length === 0;
                return (
                  <div
                    key={`${marketLevel}-${occupancyLevel}`}
                    className={`flex min-h-[80px] flex-wrap content-center items-center justify-center gap-2 rounded-[16px] border p-3 transition-colors hover:bg-white/[0.05] ${cellBg(occupancyLevel, marketLevel)}`}
                  >
                    {isEmpty ? (
                      <span className="font-mono text-lg text-slate-600/60">&mdash;</span>
                    ) : (
                      cellAssets.map((asset) => (
                        <div
                          key={asset.id}
                          className={`h-4 w-4 rounded-full ${healthDot(asset.overallHealth)}`}
                          title={`${asset.name} (${asset.assetCode})`}
                        />
                      ))
                    )}
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
            {riskLevels.map((level) => (
              <span key={`x-${level}`}>{axisLabels[level]}</span>
            ))}
          </div>
          <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
            Occupancy risk &rarr;
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
          Healthy
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
          Watch
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.5)]" />
          At risk
        </span>
      </div>

      {assets.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {assets.map((asset) => (
            <Badge key={asset.id} tone={asset.overallHealth}>
              {asset.assetCode}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
