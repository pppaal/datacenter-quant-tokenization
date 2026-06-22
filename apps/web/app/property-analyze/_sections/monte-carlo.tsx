import { Section, pct } from './shared';

export function MonteCarloSection({
  mc,
  insight
}: {
  mc: any;
  insight?: { bullets: string[]; optimismGapPct: number | null };
}) {
  return (
    <Section title={`5b. Monte Carlo (${mc.iterations} iter, seed ${mc.seed})`}>
      {insight && insight.bullets.length > 0 ? (
        <div className="mb-3 rounded-md border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs text-zinc-300">
          <div className="mb-1 font-semibold text-zinc-200">리스크 인사이트</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {insight.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mb-2 text-xs text-zinc-400">
        Correlated truncated-normal draws on entry cap / exit cap / rent growth / interest rate via
        Cholesky decomposition. Joint-stress tails (rates ↑ &amp; caps ↑ &amp; growth ↓) are modeled
        — P10 reflects co-movement risk.
      </div>
      <table
        className="w-full text-sm font-mono"
        aria-label="Monte Carlo return metric percentiles"
      >
        <thead>
          <tr className="text-zinc-400">
            <th scope="col" className="p-2 text-left">
              Metric
            </th>
            <th scope="col" className="p-2 text-right">
              Base
            </th>
            <th scope="col" className="p-2 text-right">
              P10
            </th>
            <th scope="col" className="p-2 text-right">
              P50
            </th>
            <th scope="col" className="p-2 text-right">
              P90
            </th>
            <th scope="col" className="p-2 text-right">
              Mean
            </th>
            <th scope="col" className="p-2 text-right">
              σ
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-zinc-800">
            <td className="p-2">Equity IRR</td>
            <td className="p-2 text-right">{pct(mc.baseLeveredIrr)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.p10)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.p50)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.p90)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.mean)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.stdDev)}</td>
          </tr>
          <tr className="border-t border-zinc-800">
            <td className="p-2">Unlevered IRR</td>
            <td className="p-2 text-right">{pct(mc.baseUnleveredIrr)}</td>
            <td className="p-2 text-right">{pct(mc.unleveredIrr.p10)}</td>
            <td className="p-2 text-right">{pct(mc.unleveredIrr.p50)}</td>
            <td className="p-2 text-right">{pct(mc.unleveredIrr.p90)}</td>
            <td className="p-2 text-right">{pct(mc.unleveredIrr.mean)}</td>
            <td className="p-2 text-right">{pct(mc.unleveredIrr.stdDev)}</td>
          </tr>
          <tr className="border-t border-zinc-800">
            <td className="p-2">MOIC</td>
            <td className="p-2 text-right">{mc.baseMoic.toFixed(2)}x</td>
            <td className="p-2 text-right">
              {mc.moic.p10 !== null ? `${mc.moic.p10.toFixed(2)}x` : 'N/A'}
            </td>
            <td className="p-2 text-right">
              {mc.moic.p50 !== null ? `${mc.moic.p50.toFixed(2)}x` : 'N/A'}
            </td>
            <td className="p-2 text-right">
              {mc.moic.p90 !== null ? `${mc.moic.p90.toFixed(2)}x` : 'N/A'}
            </td>
            <td className="p-2 text-right">
              {mc.moic.mean !== null ? `${mc.moic.mean.toFixed(2)}x` : 'N/A'}
            </td>
            <td className="p-2 text-right">
              {mc.moic.stdDev !== null ? mc.moic.stdDev.toFixed(2) : 'N/A'}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Probability Equity IRR Below Target
      </div>
      <table className="text-sm font-mono" aria-label="Probability equity IRR below target">
        <thead>
          <tr className="text-zinc-400">
            {mc.probLeveredIrrBelow.map((p: any) => (
              <th scope="col" key={p.targetPct} className="p-2 text-right">
                &lt; {p.targetPct}%
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {mc.probLeveredIrrBelow.map((p: any) => (
              <td key={p.targetPct} className="p-2 text-right">
                {(p.probability * 100).toFixed(1)}%
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Equity IRR Downside Tail Risk
      </div>
      <table className="w-full text-sm font-mono" aria-label="Equity IRR downside tail risk">
        <thead>
          <tr className="text-zinc-400">
            <th scope="col" className="p-2 text-right">
              VaR 95 (P5)
            </th>
            <th scope="col" className="p-2 text-right">
              VaR 99 (P1)
            </th>
            <th scope="col" className="p-2 text-right">
              ES 95
            </th>
            <th scope="col" className="p-2 text-right">
              ES 99
            </th>
            <th scope="col" className="p-2 text-right">
              Downside σ
            </th>
            <th scope="col" className="p-2 text-right">
              Worst
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-zinc-800">
            <td className="p-2 text-right">{pct(mc.leveredIrr.tail.p5)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.tail.p1)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.tail.expectedShortfall95)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.tail.expectedShortfall99)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.tail.downsideDeviation)}</td>
            <td className="p-2 text-right">{pct(mc.leveredIrr.tail.worstObserved)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-1 text-xs text-zinc-500">
        VaR = percentile boundary; ES (Expected Shortfall) = mean of realizations below that
        boundary. Downside σ is the semi-deviation below a {pct(mc.leveredIrr.tail.downsideTarget)}{' '}
        target across {mc.leveredIrr.tail.sampleCount} samples.
      </div>

      <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Driver Draws (base ± σ, min/mean/max observed)
      </div>
      <table className="w-full text-sm font-mono" aria-label="Monte Carlo driver draws">
        <thead>
          <tr className="text-zinc-400">
            <th scope="col" className="p-2 text-left">
              Driver
            </th>
            <th scope="col" className="p-2 text-right">
              Base
            </th>
            <th scope="col" className="p-2 text-right">
              σ
            </th>
            <th scope="col" className="p-2 text-right">
              Min
            </th>
            <th scope="col" className="p-2 text-right">
              Mean
            </th>
            <th scope="col" className="p-2 text-right">
              Max
            </th>
          </tr>
        </thead>
        <tbody>
          {mc.drivers.map((d: any) => (
            <tr key={d.name} className="border-t border-zinc-800">
              <td className="p-2">{d.name}</td>
              <td className="p-2 text-right">{d.basePct.toFixed(2)}%</td>
              <td className="p-2 text-right">±{d.stdDevPct.toFixed(2)}pp</td>
              <td className="p-2 text-right">{d.minDrawnPct.toFixed(2)}%</td>
              <td className="p-2 text-right">{d.meanDrawnPct.toFixed(2)}%</td>
              <td className="p-2 text-right">{d.maxDrawnPct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {mc.leveredIrr.histogram && mc.leveredIrr.histogram.length > 0 && (
        <>
          <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
            Equity IRR Histogram
          </div>
          <div className="flex items-end gap-1 h-24">
            {mc.leveredIrr.histogram.map((b: any, i: number) => {
              const maxCount = Math.max(...mc.leveredIrr.histogram.map((x: any) => x.count));
              const h = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 bg-indigo-500/70 min-w-[4px]"
                  style={{ height: `${h}%` }}
                  title={`${b.binStart.toFixed(1)}% – ${b.binEnd.toFixed(1)}%: ${b.count}`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-zinc-500 font-mono">
            <span>{mc.leveredIrr.min !== null ? `${mc.leveredIrr.min.toFixed(1)}%` : ''}</span>
            <span>{mc.leveredIrr.max !== null ? `${mc.leveredIrr.max.toFixed(1)}%` : ''}</span>
          </div>
        </>
      )}

      <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
        Correlation — Assumed (lower-triangular) vs Realized
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs font-mono">
          <thead>
            <tr className="text-zinc-500">
              <th className="p-1.5"></th>
              {mc.driverOrder.map((name: string) => (
                <th key={name} className="p-1.5 text-right">
                  {name.split(' ')[0]}
                </th>
              ))}
              <th className="p-1.5 text-zinc-600 pl-3">│</th>
              {mc.driverOrder.map((name: string) => (
                <th key={`r-${name}`} className="p-1.5 text-right">
                  {name.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mc.driverOrder.map((rowName: string, i: number) => (
              <tr key={rowName} className="border-t border-zinc-800/50">
                <td className="p-1.5 text-zinc-500">{rowName.split(' ')[0]}</td>
                {mc.correlationMatrix[i].map((v: number, j: number) => (
                  <td
                    key={`a-${j}`}
                    className={`p-1.5 text-right ${
                      j > i
                        ? 'text-zinc-600'
                        : v > 0
                          ? 'text-emerald-300'
                          : v < 0
                            ? 'text-rose-300'
                            : 'text-zinc-400'
                    }`}
                  >
                    {j > i ? '·' : v.toFixed(2)}
                  </td>
                ))}
                <td className="p-1.5 text-zinc-600 pl-3">│</td>
                {mc.realizedCorrelation[i].map((v: number, j: number) => (
                  <td
                    key={`r-${j}`}
                    className={`p-1.5 text-right ${
                      i === j
                        ? 'text-zinc-500'
                        : v > 0
                          ? 'text-emerald-300/80'
                          : v < 0
                            ? 'text-rose-300/80'
                            : 'text-zinc-400'
                    }`}
                  >
                    {i === j ? '1.00' : v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        Left: assumed (from literature). Right: realized Pearson ρ across {mc.validIterations} valid
        iterations (clamping slightly attenuates tails). Green = positive, red = negative
        co-movement.
      </div>

      <div className="mt-4 text-xs text-zinc-500">
        {mc.validIterations}/{mc.iterations} iterations produced valid IRRs.
      </div>
    </Section>
  );
}
