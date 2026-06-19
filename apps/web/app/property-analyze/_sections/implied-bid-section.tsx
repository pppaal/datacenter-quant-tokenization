import { Section, krw, pct } from './shared';

export function ImpliedBidSection({ bid }: { bid: any }) {
  return (
    <Section title="Implied Bid Prices">
      <div className="text-xs text-zinc-400 mb-3">
        Bisection on purchase price, holding all other assumptions constant. Base price:{' '}
        <span className="font-mono text-zinc-200">{krw(bid.basePriceKrw)}</span>
        {bid.baseBaseIrrPct !== null && (
          <>
            {' '}
            · Base-case IRR at that price:{' '}
            <span className="font-mono text-zinc-200">{pct(bid.baseBaseIrrPct)}</span>
          </>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono" aria-label="Implied bid prices">
          <thead>
            <tr className="text-zinc-400 text-xs">
              <th scope="col" className="p-1.5 text-left">
                Target
              </th>
              <th scope="col" className="p-1.5 text-right">
                Bid Price
              </th>
              <th scope="col" className="p-1.5 text-right">
                vs Base
              </th>
              <th scope="col" className="p-1.5 text-right">
                Achieved
              </th>
              <th scope="col" className="p-1.5 text-left">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              {
                label: `Base IRR = ${bid.targetIrrPct}% (recommended bid)`,
                sol: bid.atTargetIrr,
                highlight: true
              },
              {
                label: `MC P50 IRR = ${bid.targetIrrPct}% (conservative)`,
                sol: bid.atP50TargetIrr
              },
              {
                label: `MC P10 IRR = ${bid.floorIrrPct}% (stress-resilient max)`,
                sol: bid.atP10FloorIrr
              },
              { label: 'Break-even (IRR = 0%)', sol: bid.breakEven }
            ].map(({ label, sol, highlight }: any) => (
              <tr
                key={label}
                className={`border-t border-zinc-800 ${highlight ? 'bg-indigo-950/30' : ''}`}
              >
                <td className="p-1.5">{label}</td>
                <td className="p-1.5 text-right">{krw(sol.bidPriceKrw)}</td>
                <td
                  className={`p-1.5 text-right ${
                    sol.discountPct > 0
                      ? 'text-emerald-300'
                      : sol.discountPct < 0
                        ? 'text-rose-300'
                        : 'text-zinc-400'
                  }`}
                >
                  {sol.discountPct > 0 ? '+' : sol.discountPct < 0 ? '-' : ''}
                  {Math.abs(sol.discountPct).toFixed(1)}%
                </td>
                <td className="p-1.5 text-right">
                  {sol.achievedIrrPct !== null ? pct(sol.achievedIrrPct) : 'N/A'}
                </td>
                <td className="p-1.5 text-xs text-zinc-500">
                  {sol.noteIfUnbounded ??
                    `${sol.iterations} iter${sol.converged ? '' : ' (unconverged)'}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-zinc-500">
        Positive % = discount below base price. "Base IRR" uses the deterministic pro-forma; MC
        variants run 400-iteration Monte Carlo per bisection step.
      </div>
    </Section>
  );
}
