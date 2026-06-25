import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { MacroMonitor } from '@/lib/services/macro/monitor';
import { formatDate, formatNumber } from '@/lib/utils';

function stanceTone(stance: string) {
  if (stance === 'RISK_OFF' || stance === 'UNDERWEIGHT') return 'warn' as const;
  if (stance === 'RISK_ON' || stance === 'OVERWEIGHT') return 'good' as const;
  return 'neutral' as const;
}

export function MacroMonitorPanel({ monitor }: { monitor: MacroMonitor }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Macro Monitor</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            What changed across markets
          </h2>
        </div>
        <Badge tone={monitor.summary.missingDataMarkets > 0 ? 'warn' : 'good'}>
          {monitor.summary.latestAsOf
            ? `As of ${formatDate(monitor.summary.latestAsOf)}`
            : 'No macro factors yet'}
        </Badge>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {[
          [
            'Markets tracked',
            formatNumber(monitor.summary.marketCoverage, 0),
            'Latest factor snapshot coverage'
          ],
          [
            'Stressed',
            formatNumber(monitor.summary.stressedMarkets, 0),
            'Risk-off or underweight markets'
          ],
          [
            'Supportive',
            formatNumber(monitor.summary.supportiveMarkets, 0),
            'Risk-on or overweight markets'
          ],
          [
            'Missing data',
            formatNumber(monitor.summary.missingDataMarkets, 0),
            'Markets with incomplete factor sets'
          ]
        ].map(([label, value, subline]) => (
          <div
            key={label}
            className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5"
          >
            <div className="fine-print">{label}</div>
            <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">{value}</div>
            <p className="mt-2 text-sm text-[hsl(var(--muted))]">{subline}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3">
          {monitor.markets.length > 0 ? (
            monitor.markets.slice(0, 6).map((market) => (
              <div
                key={market.market}
                className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-[hsl(var(--foreground))]">
                      {market.market}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                      {market.asOf ? `as of ${formatDate(market.asOf)}` : 'latest'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={stanceTone(market.riskStance)}>
                      {market.riskStance.toLowerCase().replaceAll('_', ' ')}
                    </Badge>
                    <Badge tone={stanceTone(market.allocationStance)}>
                      {market.allocationStance.toLowerCase()}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr_1fr]">
                  <div className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
                    <div className="fine-print">Coverage</div>
                    <div className="mt-3 text-2xl font-semibold text-[hsl(var(--foreground))]">
                      {formatNumber(market.observedFactorCount, 0)} / 8
                    </div>
                    <p className="mt-2 text-xs text-[hsl(var(--muted))]">
                      {market.missingFactorCount > 0
                        ? `${formatNumber(market.missingFactorCount, 0)} factor gaps`
                        : 'Full factor set'}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
                    <div className="fine-print">Headwinds</div>
                    <div className="mt-3 text-base font-semibold text-[hsl(var(--foreground))]">
                      {market.strongestHeadwind ?? 'No major headwind'}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-[hsl(var(--muted))]">
                      {market.headwindDrivers.length > 0 ? (
                        market.headwindDrivers.map((driver) => <div key={driver}>{driver}</div>)
                      ) : (
                        <div>Negative factor transmission is limited.</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4">
                    <div className="fine-print">Tailwinds</div>
                    <div className="mt-3 text-base font-semibold text-[hsl(var(--foreground))]">
                      {market.strongestTailwind ?? 'No major tailwind'}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-[hsl(var(--muted))]">
                      {market.tailwindDrivers.length > 0 ? (
                        market.tailwindDrivers.map((driver) => <div key={driver}>{driver}</div>)
                      ) : (
                        <div>Positive factor transmission is limited.</div>
                      )}
                    </div>
                    {market.missingFactors.length > 0 ? (
                      <div className="mt-3 border-t border-[hsl(var(--border))] pt-3 text-xs text-[hsl(var(--muted))]">
                        Missing: {market.missingFactors.join(', ')}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5 text-sm text-[hsl(var(--muted))]">
              No persisted macro factors yet. Run source enrichment to populate the macro core.
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-5">
          <div className="fine-print">Driver Board</div>
          <h3 className="mt-2 text-xl font-semibold text-[hsl(var(--foreground))]">
            Most repeated macro drivers
          </h3>
          <div className="mt-4 grid gap-3">
            {monitor.driverBoard.length > 0 ? (
              monitor.driverBoard.map((driver) => (
                <div
                  key={driver.key}
                  className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      {driver.label}
                    </div>
                    <Badge tone={driver.type === 'HEADWIND' ? 'warn' : 'good'}>
                      {driver.type.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-[hsl(var(--muted))]">
                    {formatNumber(driver.marketCount, 0)} markets are currently transmitting this
                    driver.
                  </p>
                </div>
              ))
            ) : (
              <div className="text-sm text-[hsl(var(--muted))]">
                Driver frequency will appear after macro factors are persisted.
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
