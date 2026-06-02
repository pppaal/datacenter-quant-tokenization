import { Section, krw } from './shared';

export function ThreeApproachSection({ a }: { a: any }) {
  return (
    <Section title="감정평가 3방식 (3-Approach Reconciliation)">
      <div className="mb-3 text-xs text-zinc-500 leading-relaxed">
        {a.threeApproach.methodology}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th scope="col" className="text-left py-2 pr-4">
                Approach
              </th>
              <th scope="col" className="text-right py-2 px-2">
                Value (KRW)
              </th>
              <th scope="col" className="text-right py-2 px-2">
                Per sqm
              </th>
              <th scope="col" className="text-right py-2 px-2">
                Weight
              </th>
              <th scope="col" className="text-left py-2 pl-2">
                Data quality
              </th>
            </tr>
          </thead>
          <tbody>
            {a.threeApproach.approaches.map((ap: any) => (
              <tr key={ap.approach} className="border-b border-zinc-900">
                <td className="py-2 pr-4">
                  <div className="text-zinc-100">{ap.labelKo}</div>
                  <div className="text-xs text-zinc-500">{ap.labelEn}</div>
                </td>
                <td className="py-2 px-2 text-right font-mono text-zinc-100">
                  {ap.valueKrw === null ? '—' : krw(ap.valueKrw)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-zinc-300">
                  {ap.valuePerSqmKrw === null ? '—' : krw(ap.valuePerSqmKrw)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-zinc-300">
                  {ap.weight === 0 ? '—' : `${(ap.weight * 100).toFixed(0)}%`}
                </td>
                <td className="py-2 pl-2 text-xs text-zinc-400 uppercase tracking-wide">
                  {ap.dataQuality}
                </td>
              </tr>
            ))}
            <tr className="bg-zinc-900/60">
              <td className="py-2 pr-4 font-semibold text-zinc-100">Reconciled</td>
              <td className="py-2 px-2 text-right font-mono font-semibold text-emerald-300">
                {a.threeApproach.reconciledValueKrw === null
                  ? '—'
                  : krw(a.threeApproach.reconciledValueKrw)}
              </td>
              <td className="py-2 px-2 text-right font-mono text-emerald-300">
                {a.threeApproach.reconciledValuePerSqmKrw === null
                  ? '—'
                  : krw(a.threeApproach.reconciledValuePerSqmKrw)}
              </td>
              <td className="py-2 px-2 text-right font-mono text-zinc-500">100%</td>
              <td className="py-2 pl-2 text-xs text-zinc-500">weighted</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-zinc-500">
        {a.threeApproach.approaches.map((ap: any) => (
          <div key={ap.approach}>
            <span className="text-zinc-400">{ap.labelKo}:</span> {ap.note}
          </div>
        ))}
      </div>
      {a.threeApproach.rulesApplied.length > 0 && (
        <div className="mt-4 rounded border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-indigo-400">Rules applied</div>
          <ul className="space-y-1 text-xs text-zinc-400">
            {a.threeApproach.rulesApplied.map((rule: string, i: number) => (
              <li key={i} className="font-mono">
                · {rule}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
