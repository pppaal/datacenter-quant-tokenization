import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function MacroGuidanceSection({ data }: { data: SampleReportData }) {
  const { macroGuidance } = data;
  if (!macroGuidance) {
    return null;
  }
  return (
    <section id="im-macro-guidance" className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Macro regime overlay</div>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Per-driver overlay applied to the base scenario before the proforma runs. Discount and
              exit cap widen in tight capital markets; occupancy and growth tighten when leasing is
              soft; replacement cost steps up with construction inflation.
            </p>
          </div>
          <Badge>macro-regime-engine</Badge>
        </div>
        {macroGuidance.weightLine ? (
          <p className="mt-4 rounded-[14px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-3 py-2 text-xs text-slate-300">
            {macroGuidance.weightLine}
          </p>
        ) : null}
        <div className="mt-5 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ['Discount rate', macroGuidance.shifts.discountRateShiftPct, 'pts', 'add'],
              ['Exit cap rate', macroGuidance.shifts.exitCapRateShiftPct, 'pts', 'add'],
              ['Debt cost', macroGuidance.shifts.debtCostShiftPct, 'pts', 'add'],
              ['Occupancy', macroGuidance.shifts.occupancyShiftPct, 'pts', 'subtract'],
              ['Growth', macroGuidance.shifts.growthShiftPct, 'pts', 'subtract'],
              ['Replacement cost', macroGuidance.shifts.replacementCostShiftPct, '%', 'add']
            ] as const
          ).map(([label, value, unit, badShift]) => {
            if (value === null) return null;
            const isWiden =
              (badShift === 'add' && value > 0) || (badShift === 'subtract' && value < 0);
            const tone =
              value === 0 ? 'text-white' : isWiden ? 'text-rose-300' : 'text-emerald-300';
            const sign = value > 0 ? '+' : '';
            return (
              <div
                key={label}
                className="rounded-[16px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3"
              >
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
                <div className={`mt-2 font-mono text-sm ${tone}`}>
                  {sign}
                  {value.toFixed(2)} {unit}
                </div>
              </div>
            );
          })}
        </div>
        {macroGuidance.summary.length > 0 ? (
          <ul className="mt-5 space-y-1 text-xs leading-5 text-slate-400">
            {macroGuidance.summary.map((line) => (
              <li key={line} className="before:mr-2 before:text-slate-600 before:content-['→']">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </section>
  );
}
