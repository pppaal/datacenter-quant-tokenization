import { Section, krw, pct } from './shared';

export function DebtScheduleSection({ pf, pfYears }: { pf: any; pfYears: any[] }) {
  return (
    <Section title="4g. Debt Schedule (10-year)" collapsible defaultOpen={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm font-mono" aria-label="Annual debt schedule">
          <thead>
            <tr className="text-zinc-400">
              <th scope="col" className="p-2 text-left">
                Line
              </th>
              {pfYears.map((y) => (
                <th scope="col" key={`ds-h-${y.year}`} className="p-2 text-right">
                  Y{y.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const termNoi = pfYears[pfYears.length - 1]?.noiKrw ?? pf.stabilizedNoiKrw;
              const exitCapProxy = pf.terminalValueKrw > 0 ? termNoi / pf.terminalValueKrw : null;
              const rows = pfYears.map((y, i) => {
                const opening =
                  i === 0
                    ? pf.initialDebtFundingKrw - y.drawAmountKrw
                    : pfYears[i - 1]!.endingDebtBalanceKrw;
                const impliedValue =
                  exitCapProxy && exitCapProxy > 0 ? y.noiKrw / exitCapProxy : null;
                const ltv =
                  impliedValue && impliedValue > 0
                    ? (y.endingDebtBalanceKrw / impliedValue) * 100
                    : null;
                const icr = y.interestKrw > 0 ? y.noiKrw / y.interestKrw : null;
                return {
                  year: y.year,
                  opening,
                  draw: y.drawAmountKrw,
                  interest: y.interestKrw,
                  principal: y.principalKrw,
                  debtService: y.debtServiceKrw,
                  ending: y.endingDebtBalanceKrw,
                  impliedValue,
                  ltv,
                  dscr: y.dscr,
                  icr
                };
              });
              const DSCR_FLOOR = 1.15;
              const defs: {
                label: string;
                bold?: boolean;
                kind: 'krw' | 'pct' | 'ratio';
                breach?: boolean;
                pick: (r: (typeof rows)[number]) => number | null;
              }[] = [
                { label: 'Opening Balance', kind: 'krw', pick: (r) => r.opening },
                { label: '  (+) Draw', kind: 'krw', pick: (r) => r.draw },
                { label: '  (–) Principal', kind: 'krw', pick: (r) => -r.principal },
                {
                  label: 'Ending Balance',
                  kind: 'krw',
                  bold: true,
                  pick: (r) => r.ending
                },
                { label: 'Interest', kind: 'krw', pick: (r) => r.interest },
                { label: 'Total Debt Service', kind: 'krw', pick: (r) => r.debtService },
                {
                  label: 'Implied Property Value',
                  kind: 'krw',
                  pick: (r) => r.impliedValue
                },
                { label: 'LTV', kind: 'pct', pick: (r) => r.ltv },
                {
                  label: 'DSCR (vs 1.15x floor)',
                  kind: 'ratio',
                  breach: true,
                  pick: (r) => r.dscr
                },
                { label: 'ICR (NOI / Interest)', kind: 'ratio', pick: (r) => r.icr }
              ];
              return defs.map((def) => (
                <tr key={`ds-${def.label}`} className="border-t border-zinc-800">
                  <td
                    className={`p-2 ${def.bold ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}
                  >
                    {def.label}
                  </td>
                  {rows.map((r) => {
                    const val = def.pick(r);
                    let txt: string;
                    if (def.kind === 'krw') txt = krw(val);
                    else if (def.kind === 'pct') txt = pct(val);
                    else txt = val == null ? 'N/A' : `${val.toFixed(2)}x`;
                    const isBreach = def.breach && val != null && val < DSCR_FLOOR;
                    return (
                      <td
                        key={`ds-${def.label}-${r.year}`}
                        className={`p-2 text-right ${def.bold ? 'font-semibold' : ''} ${isBreach ? 'text-rose-400' : ''}`}
                      >
                        {txt}
                      </td>
                    );
                  })}
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Implied value uses a constant exit-cap proxy (terminal NOI / terminal value) applied to each
        year's NOI. DSCR below 1.15× is flagged in red.
      </p>
    </Section>
  );
}
