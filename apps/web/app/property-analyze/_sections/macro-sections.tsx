import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, pct } from './shared';

export function MacroRegimeSection({ macro }: { macro: any }) {
  return (
    <Section title="1. Macro Regime Interpretation" collapsible defaultOpen={false}>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Label"
      >
        {macro?.regime?.label ?? '(n/a)'}
      </KeyValueRow>
      <ul className="mt-2 space-y-1 text-sm text-zinc-300">
        {(macro?.regime?.summary ?? []).slice(0, 5).map((l: string, i: number) => (
          <li key={i}>· {l}</li>
        ))}
        {(!macro?.regime?.summary || macro.regime.summary.length === 0) && (
          <li className="text-zinc-500">(empty)</li>
        )}
      </ul>
    </Section>
  );
}

export function MacroExposureSection({ macro }: { macro: any }) {
  return (
    <Section title="2. Deal Macro Exposure (0-100, higher = worse)">
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Overall"
      >
        {`${macro.dealExposure.overallScore} [${macro.dealExposure.band}] (raw ${macro.dealExposure.rawScore})`}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Correlation penalty"
      >
        {`+${macro.dealExposure.correlationPenalty.appliedPenaltyPct.toFixed(1)}%`}
      </KeyValueRow>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {macro.dealExposure.dimensions.map((d: any) => (
            <tr key={d.label} className="border-t border-zinc-800">
              <td className="py-1.5 pr-4 text-zinc-400">{d.label}</td>
              <td className="py-1.5 pr-4 text-right font-mono">{d.score}</td>
              <td className="py-1.5 text-zinc-300">{d.commentary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-zinc-300">⇒ {macro.dealExposure.summary}</p>
    </Section>
  );
}

export function MacroStressSection({ macro }: { macro: any }) {
  return (
    <Section title="3. Macro Stress Tests" collapsible defaultOpen={false}>
      <div className="space-y-3">
        {macro.stressTests.map((s: any) => (
          <div key={s.scenario.name} className="rounded border border-zinc-800 p-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="font-medium">{s.scenario.name}</span>
              <span className="text-zinc-400">{s.verdict}</span>
              <span className="text-zinc-400">
                ΔCap{' '}
                {pct(
                  s.stressedCapRate && s.baselineCapRate
                    ? s.stressedCapRate - s.baselineCapRate
                    : null
                )}
              </span>
              <span className="text-zinc-400">Value impact {pct(s.valuationImpactPct)}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-300">→ {s.commentary}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
