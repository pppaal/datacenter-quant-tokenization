import { Card } from '@/components/ui/card';
import type { CapRateDecomposition } from '@/lib/services/research/cap-rate-decomposition';
import { formatNumber } from '@/lib/utils';

type Props = {
  decomposition: CapRateDecomposition | null;
  /** True when the risk-free leg used the base-rate proxy (no 10Y series). */
  usesPolicyProxy?: boolean;
};

export function CapRateBuildupPanel({ decomposition, usesPolicyProxy }: Props) {
  if (!decomposition || decomposition.components.length === 0) return null;
  const { components, componentSumPct } = decomposition;
  const maxAbs = Math.max(...components.map((c) => Math.abs(c.pct)), 0.01);

  return (
    <Card data-testid="cap-rate-buildup-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Cap Rate Build-Up</div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            How the cap rate is constructed
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
            The going-in yield decomposed into a transparent build-up — risk-free rate plus a sector
            risk premium and submarket spread, less expected income growth, plus liquidity and
            obsolescence — so the committee can see what drives it, not just a single number.
          </p>
        </div>
        <div className="text-right">
          <div className="fine-print">Implied Cap</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatNumber(componentSumPct, 2)}%
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2.5">
        {components.map((component) => {
          const widthPct = (Math.abs(component.pct) / maxAbs) * 100;
          const subtracts = component.sign === '-';
          return (
            <div key={component.key} className="grid grid-cols-[180px_1fr_72px] items-center gap-3">
              <div className="text-sm text-foreground" title={component.notes}>
                {component.label}
              </div>
              <div className="h-2.5 rounded-full bg-[hsl(var(--panel-alt))]">
                <div
                  className={`h-full rounded-full ${
                    subtracts ? 'bg-[hsl(var(--success))]' : 'bg-accent'
                  }`}
                  style={{ width: `${Math.max(widthPct, 2)}%` }}
                />
              </div>
              <div
                className={`text-right text-sm font-semibold tabular-nums ${
                  subtracts ? 'text-[hsl(var(--success))]' : 'text-foreground'
                }`}
              >
                {subtracts ? '−' : '+'}
                {formatNumber(Math.abs(component.pct), 2)}%
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted">
        Green legs subtract from the yield (tightening). The build-up sums to{' '}
        {formatNumber(componentSumPct, 2)}%.
        {usesPolicyProxy
          ? ' Risk-free leg proxied by the BOK base rate until the 10Y govt-bond series is ingested.'
          : ''}
      </p>
    </Card>
  );
}
