import { Section, VerdictBadge } from './shared';

export function VerdictSection({ v }: { v: any }) {
  return (
    <Section title="Investment Verdict (deterministic rubric)">
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <VerdictBadge tier={v.tier} />
        <div className="text-sm text-zinc-300">{v.headline}</div>
      </div>
      <div className="text-xs text-zinc-500 mb-3 font-mono">
        Score {v.totalScore}/{v.maxPossibleScore} (normalized {v.normalizedScore.toFixed(2)}) ·
        target IRR {v.hurdlesUsed.targetLeveredIrrPct}% · floor P10 {v.hurdlesUsed.floorP10IrrPct}%
        · max Prob(&lt;8%) {(v.hurdlesUsed.maxProbBelow8Pct * 100).toFixed(0)}%
      </div>

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm font-mono" aria-label="Verdict dimension scoring">
          <thead>
            <tr className="text-zinc-400 text-xs">
              <th scope="col" className="p-1.5 text-left">
                Dimension
              </th>
              <th scope="col" className="p-1.5 text-left">
                Observed
              </th>
              <th scope="col" className="p-1.5 text-left">
                Threshold
              </th>
              <th scope="col" className="p-1.5 text-right">
                Score
              </th>
              <th scope="col" className="p-1.5 text-right">
                Weight
              </th>
              <th scope="col" className="p-1.5 text-right">
                Contrib
              </th>
            </tr>
          </thead>
          <tbody>
            {v.dimensions.map((d: any) => (
              <tr key={d.dimension} className="border-t border-zinc-800">
                <td className="p-1.5">{d.dimension}</td>
                <td className="p-1.5 text-zinc-300">{d.observed}</td>
                <td className="p-1.5 text-zinc-500">{d.threshold}</td>
                <td
                  className={`p-1.5 text-right ${
                    d.score > 0
                      ? 'text-emerald-300'
                      : d.score < 0
                        ? 'text-rose-300'
                        : 'text-zinc-500'
                  }`}
                >
                  {d.score > 0 ? '+' : ''}
                  {d.score}
                </td>
                <td className="p-1.5 text-right text-zinc-500">×{d.weight}</td>
                <td
                  className={`p-1.5 text-right ${
                    d.contribution > 0
                      ? 'text-emerald-300'
                      : d.contribution < 0
                        ? 'text-rose-300'
                        : 'text-zinc-500'
                  }`}
                >
                  {d.contribution > 0 ? '+' : ''}
                  {d.contribution}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {v.redFlags.length > 0 && (
        <div className="mb-3 rounded border border-rose-900/60 bg-rose-950/30 p-3">
          <div className="text-xs uppercase tracking-wide text-rose-400 mb-1">Red Flags</div>
          <ul className="text-sm text-rose-200 space-y-1">
            {v.redFlags.map((r: string, i: number) => (
              <li key={i}>· {r}</li>
            ))}
          </ul>
        </div>
      )}
      {v.positives.length > 0 && (
        <div className="mb-2">
          <div className="text-xs uppercase tracking-wide text-emerald-400 mb-1">Positives</div>
          <ul className="text-sm text-emerald-200 space-y-1">
            {v.positives.map((p: string, i: number) => (
              <li key={i}>+ {p}</li>
            ))}
          </ul>
        </div>
      )}
      {v.negatives.length > 0 && (
        <div className="mb-2">
          <div className="text-xs uppercase tracking-wide text-amber-400 mb-1">Concerns</div>
          <ul className="text-sm text-amber-200 space-y-1">
            {v.negatives.map((n: string, i: number) => (
              <li key={i}>− {n}</li>
            ))}
          </ul>
        </div>
      )}
      {v.conditions.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-indigo-400 mb-1">
            Conditions to Proceed
          </div>
          <ul className="text-sm text-indigo-200 space-y-1">
            {v.conditions.map((c: string, i: number) => (
              <li key={i}>→ {c}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
