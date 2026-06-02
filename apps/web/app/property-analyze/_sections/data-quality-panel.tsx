import { Section, SourcePill } from './shared';

type DataQuality = {
  fields: Array<{
    field: string;
    label: string;
    value: string;
    tier: string;
    source: string;
    freshness?: string | null;
    note: string;
  }>;
  connectorFailures: Array<{ label: string; message: string }>;
  estimatedCount: number;
  totalCount: number;
  trustHint: string;
  confidence: string;
};

export function DataQualityPanel({ dq }: { dq: DataQuality }) {
  const estimated = dq.estimatedCount > 0;
  return (
    <Section title="Data quality / assumptions">
      <div
        className={`mb-4 rounded border px-3 py-2 text-sm ${
          estimated
            ? 'border-amber-700 bg-amber-950/40 text-amber-200'
            : 'border-emerald-800 bg-emerald-950/30 text-emerald-200'
        }`}
      >
        {estimated ? '⚠ ' : '✓ '}
        {dq.trustHint}
        <span className="ml-2 text-xs uppercase tracking-wide text-zinc-400">
          confidence: {dq.confidence}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th scope="col" className="py-2 pr-4 text-left">
                Input
              </th>
              <th scope="col" className="py-2 px-2 text-left">
                Value
              </th>
              <th scope="col" className="py-2 px-2 text-left">
                Source
              </th>
              <th scope="col" className="py-2 pl-2 text-left">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {dq.fields.map((f) => (
              <tr key={f.field} className="border-b border-zinc-900 align-top">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <SourcePill tier={f.tier} />
                    <span className="text-zinc-200">{f.label}</span>
                  </div>
                </td>
                <td className="py-2 px-2 font-mono text-zinc-300">{f.value}</td>
                <td className="py-2 px-2 text-xs text-zinc-400">
                  {f.source}
                  {f.freshness ? <span className="ml-1 text-zinc-500">· {f.freshness}</span> : null}
                </td>
                <td className="py-2 pl-2 text-xs text-zinc-500">{f.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dq.connectorFailures.length > 0 && (
        <div className="mt-4 rounded border border-rose-900 bg-rose-950/30 p-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-rose-400">
            Connector failures ({dq.connectorFailures.length})
          </div>
          <ul className="space-y-1 text-xs text-rose-300">
            {dq.connectorFailures.map((cf, i) => (
              <li key={i} className="font-mono">
                · {cf.label}: {cf.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
