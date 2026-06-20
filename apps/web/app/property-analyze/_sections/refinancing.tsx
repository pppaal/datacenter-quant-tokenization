import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw } from './shared';

export function RefinancingSection({ refi }: { refi: any }) {
  return (
    <Section title="Refinancing Analysis" collapsible defaultOpen={false}>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Triggers detected"
      >
        {refi.triggers.length}
      </KeyValueRow>
      <ul className="mt-2 space-y-1 text-sm text-zinc-300">
        {refi.triggers.slice(0, 5).map((t: any, i: number) => (
          <li key={i}>
            [{t.severity}] Y{t.year} — {t.reason}
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2 text-sm">
        {refi.scenarios.slice(0, 4).map((s: any) => (
          <div key={s.refiYear} className="border-t border-zinc-800 pt-2">
            refi Y{s.refiYear} @ {s.newRatePct.toFixed(2)}% · DS savings{' '}
            {krw(s.annualDebtServiceSavingKrw)}/yr · break-even{' '}
            {s.breakEvenYears ? `${s.breakEvenYears.toFixed(1)}y` : 'never'}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-indigo-300">⇒ {refi.recommendation}</p>
    </Section>
  );
}
