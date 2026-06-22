import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw, pct } from './shared';

export function CapRateSensitivitySection({ capMatrix }: { capMatrix: any }) {
  return (
    <Section
      title="Sensitivity — Cap Rate × Exit Cap Rate (equity IRR)"
      collapsible
      defaultOpen={false}
    >
      <div className="overflow-x-auto">
        <table className="text-sm font-mono">
          <thead>
            <tr>
              <th className="p-2"></th>
              {capMatrix.colAxis.values.map((v: number) => (
                <th key={v} className="p-2 text-right text-zinc-400">
                  Exit {v.toFixed(1)}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capMatrix.cells.map((row: any[], r: number) => (
              <tr key={r} className={r === capMatrix.baseRowIndex ? 'bg-indigo-950/30' : ''}>
                <td className="p-2 text-zinc-400">Cap {capMatrix.rowAxis.values[r].toFixed(1)}%</td>
                {row.map((c: any, ci: number) => (
                  <td key={ci} className="p-2 text-right">
                    {c.equityIrr === null ? 'N/A' : `${c.equityIrr.toFixed(1)}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function InterestRateSensitivitySection({ irRows }: { irRows: any[] }) {
  return (
    <Section title="Sensitivity — Interest Rate Shift" collapsible defaultOpen={false}>
      <table className="text-sm font-mono" aria-label="Interest rate sensitivity">
        <thead>
          <tr className="text-zinc-400">
            <th scope="col" className="p-2 text-left">
              ΔRate
            </th>
            <th scope="col" className="p-2 text-right">
              Equity IRR
            </th>
            <th scope="col" className="p-2 text-right">
              MOIC
            </th>
            <th scope="col" className="p-2 text-right">
              Y1 DSCR
            </th>
          </tr>
        </thead>
        <tbody>
          {irRows.map((row: any) => (
            <tr key={row.shiftBps} className="border-t border-zinc-800">
              <td className="p-2">{row.shiftBps}bps</td>
              <td className="p-2 text-right">
                {row.equityIrr === null ? 'N/A' : pct(row.equityIrr)}
              </td>
              <td className="p-2 text-right">{row.equityMultiple.toFixed(2)}x</td>
              <td className="p-2 text-right">
                {row.dscrYear1 ? `${row.dscrYear1.toFixed(2)}x` : 'N/A'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

export function MacroDrivenSensitivitySection({ md }: { md: any }) {
  return (
    <Section
      title="Macro-Driven Sensitivity (axes from stress scenarios)"
      collapsible
      defaultOpen={false}
    >
      <div className="mb-2 text-xs text-zinc-400">
        Rate axis: {md.rateAxisSourceScenario} · Occupancy axis: {md.occupancyAxisSourceScenario}
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm font-mono">
          <thead>
            <tr>
              <th className="p-2"></th>
              {md.colAxis.values.map((v: number) => (
                <th key={v} className="p-2 text-right text-zinc-400">
                  +Vacancy {v.toFixed(1)}%
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {md.cells.map((row: any[], r: number) => (
              <tr key={r}>
                <td className="p-2 text-zinc-400">+{md.rowAxis.values[r]}bps</td>
                {row.map((c: any, ci: number) => (
                  <td key={ci} className="p-2 text-right">
                    {c.equityIrr === null ? 'N/A' : `${c.equityIrr.toFixed(1)}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function TornadoSensitivitySection({
  tornado,
  pfx,
  insight
}: {
  tornado: any;
  pfx: any;
  insight?: { bullets: string[]; concentrationFlag: boolean; topDriver: string | null };
}) {
  return (
    <Section
      title="Tornado — Driver Sensitivity (levered IRR swing)"
      collapsible
      defaultOpen={false}
    >
      {insight && insight.bullets.length > 0 ? (
        <div className="mb-3 rounded-md border border-indigo-500/30 bg-indigo-500/5 p-3 text-xs text-zinc-300">
          <div className="mb-1 font-semibold text-zinc-200">
            인사이트{insight.concentrationFlag ? ' · 민감도 집중' : ''}
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {insight.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mb-2 text-xs text-zinc-400">
        Base equity IRR: {tornado.baseEquityIrr === null ? 'N/A' : pct(tornado.baseEquityIrr)} ·
        drivers ranked by absolute IRR swing for a +/- shock.
      </div>
      <div className="space-y-2">
        {tornado.drivers.map((d: any) => {
          const maxSwing = tornado.drivers[0]?.irrSwing || 1;
          const widthPct = Math.max(2, Math.round((d.irrSwing / maxSwing) * 100));
          return (
            <div key={d.key} className="text-sm">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {d.label} <span className="text-zinc-600">({d.deltaLabel})</span>
                </span>
                <span className="font-mono">
                  {d.lowIrr === null ? 'N/A' : pct(d.lowIrr, 1)} →{' '}
                  {d.highIrr === null ? 'N/A' : pct(d.highIrr, 1)} · Δ {d.irrSwing.toFixed(2)}pp
                </span>
              </div>
              <div className="mt-1 h-3 w-full rounded bg-zinc-800">
                <div className="h-3 rounded bg-indigo-500" style={{ width: `${widthPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {pfx?.terminalValueCrossCheck && (
        <div className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <div className="mb-1 font-semibold text-zinc-300">Terminal Value Cross-Check</div>
          <KeyValueRow
            variant="divider"
            className="border-t py-1.5 text-sm first:border-t-0"
            label="Exit-Cap TV (primary)"
          >
            {krw(pfx.terminalValueCrossCheck.exitCapTerminalValueKrw)}
          </KeyValueRow>
          <KeyValueRow
            variant="divider"
            className="border-t py-1.5 text-sm first:border-t-0"
            label="Gordon-Growth TV"
          >
            {pfx.terminalValueCrossCheck.gordonTerminalValueKrw === null
              ? 'N/A (r ≤ g)'
              : krw(pfx.terminalValueCrossCheck.gordonTerminalValueKrw)}
          </KeyValueRow>
          <KeyValueRow
            variant="divider"
            className="border-t py-1.5 text-sm first:border-t-0"
            label="Divergence"
          >
            {pfx.terminalValueCrossCheck.divergencePct === null
              ? 'N/A'
              : `${pfx.terminalValueCrossCheck.divergencePct.toFixed(1)}%`}
          </KeyValueRow>
          {pfx.terminalValueCrossCheck.divergesBeyondThreshold && (
            <p className="mt-1 text-amber-400">
              ⚠ Exit-cap and Gordon TV diverge &gt;{' '}
              {pfx.terminalValueCrossCheck.divergenceThresholdPct}% — review exit assumptions.
            </p>
          )}
          {pfx.terminalValueCrossCheck.terminalSpreadInverted && (
            <p className="mt-1 text-amber-400">
              ⚠ Exit cap below going-in ({pfx.terminalValueCrossCheck.terminalCapSpreadBps}
              bps) — assumes cap compression at exit.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
