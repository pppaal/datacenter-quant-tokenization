import { Section, krw, pct } from './shared';

export function GpLpWaterfallSection({ wf }: { wf: any }) {
  return (
    <Section title="GP/LP Promote Waterfall" collapsible defaultOpen={false}>
      <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
        Illustrative promote structure (standard 8% pref / catch-up / 80-20 carry defaults), not the
        actual negotiated LPA terms for this deal.
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs text-zinc-500">LP Commitment</div>
          <div className="font-mono">{krw(wf.lpCommittedKrw)}</div>
          <div className="text-xs text-zinc-500">
            {(wf.config.lpCommitmentPct * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">GP Commitment</div>
          <div className="font-mono">{krw(wf.gpCommittedKrw)}</div>
          <div className="text-xs text-zinc-500">
            {(wf.config.gpCommitmentPct * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Pref Return</div>
          <div className="font-mono">{wf.config.preferredReturnPct.toFixed(1)}%</div>
          <div className="text-xs text-zinc-500">Compounded, 100% LP</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Catch-up / Promote</div>
          <div className="font-mono">
            {(wf.config.catchUpLpSplit * 100).toFixed(0)}/
            {(wf.config.catchUpGpSplit * 100).toFixed(0)}
          </div>
          <div className="text-xs text-zinc-500">
            Residual {(wf.config.residualLpSplit * 100).toFixed(0)}/
            {(wf.config.residualGpSplit * 100).toFixed(0)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[640px] text-sm font-mono"
          aria-label="GP/LP waterfall tiers"
        >
          <thead>
            <tr className="text-zinc-400">
              <th scope="col" className="p-2 text-left">
                Tier
              </th>
              <th scope="col" className="p-2 text-right">
                Distributed
              </th>
              <th scope="col" className="p-2 text-right">
                LP
              </th>
              <th scope="col" className="p-2 text-right">
                GP
              </th>
              <th scope="col" className="p-2 text-right">
                Cum. LP
              </th>
              <th scope="col" className="p-2 text-right">
                Cum. GP
              </th>
            </tr>
          </thead>
          <tbody>
            {wf.tiers.map((t: any) => (
              <tr key={t.name} className="border-t border-zinc-800">
                <td className="p-2 text-zinc-200">{t.name}</td>
                <td className="p-2 text-right">{krw(t.distributedKrw)}</td>
                <td className="p-2 text-right">{krw(t.lpKrw)}</td>
                <td className="p-2 text-right">{krw(t.gpKrw)}</td>
                <td className="p-2 text-right text-zinc-400">{krw(t.cumulativeLpKrw)}</td>
                <td className="p-2 text-right text-zinc-400">{krw(t.cumulativeGpKrw)}</td>
              </tr>
            ))}
            <tr className="border-t border-zinc-700 font-semibold">
              <td className="p-2 text-zinc-100">Total</td>
              <td className="p-2 text-right">{krw(wf.totalDistributionsKrw)}</td>
              <td className="p-2 text-right">{krw(wf.lpTotalKrw)}</td>
              <td className="p-2 text-right">{krw(wf.gpTotalKrw)}</td>
              <td className="p-2 text-right text-zinc-400">—</td>
              <td className="p-2 text-right text-zinc-400">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs text-zinc-500">LP IRR</div>
          <div className="font-mono text-emerald-300">{pct(wf.lpIrrPct)}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">LP MOIC</div>
          <div className="font-mono">{wf.lpMoic.toFixed(2)}x</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">GP IRR</div>
          <div className="font-mono text-emerald-300">{pct(wf.gpIrrPct)}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">GP MOIC</div>
          <div className="font-mono">{wf.gpMoic.toFixed(2)}x</div>
        </div>
      </div>

      <div className="mt-4 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-zinc-500">GP Promote (Carry)</div>
        <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-3">
          <div>
            <div className="text-xs text-zinc-500">Pro-rata LP (reference)</div>
            <div className="font-mono">{krw(wf.proRataLpKrw)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Pro-rata GP (reference)</div>
            <div className="font-mono">{krw(wf.proRataGpKrw)}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">GP Promote Earned</div>
            <div className="font-mono text-amber-300">{krw(wf.gpPromoteEarnedKrw)}</div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        American (deal-by-deal) waterfall on after-tax distributions + net exit proceeds. Tier 1
        returns capital pro-rata; Tier 2 pays the compounded preferred return 100% to LP; Tier 3
        catches GP up to the promote split; Tier 4 splits residual profits. GP Promote = GP total
        minus pro-rata share (the carry earned above passive participation).
      </p>
    </Section>
  );
}
