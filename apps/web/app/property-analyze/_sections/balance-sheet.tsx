import { Section, krw, pct } from './shared';

export function BalanceSheetSection({ pfx, pfYears }: { pfx: any; pfYears: any[] }) {
  return (
    <Section title="Balance Sheet (10-year)" collapsible defaultOpen={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm font-mono" aria-label="Annual balance sheet">
          <thead>
            <tr className="text-zinc-400">
              <th scope="col" className="p-2 text-left">
                Line
              </th>
              {pfYears.map((y) => (
                <th scope="col" key={`bs-h-${y.year}`} className="p-2 text-right">
                  Y{y.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const basis = pfx.totalBasisKrw;
              const annualDep = pfx.annualDepreciationKrw;
              let cumulativeReserve = 0;
              let cumulativeRetained = 0;
              const rows = pfYears.map((y) => {
                // Both the operating reserve and the capex reserve accumulate as
                // restricted cash on the balance sheet — and both are released to
                // equity at exit — so the cash line must carry both, not just the
                // operating reserve contribution.
                cumulativeReserve += y.reserveContributionKrw + y.capexReserveKrw;
                cumulativeRetained += y.afterTaxDistributionKrw;
                const accumDep = annualDep * y.year;
                const netProperty = Math.max(basis - accumDep, 0);
                const cashReserves = cumulativeReserve;
                const totalAssets = netProperty + cashReserves;
                const debt = y.endingDebtBalanceKrw;
                const equity = totalAssets - debt;
                const ltv = netProperty > 0 ? (debt / netProperty) * 100 : null;
                return {
                  year: y.year,
                  basis,
                  accumDep,
                  netProperty,
                  cashReserves,
                  totalAssets,
                  debt,
                  equity,
                  retained: cumulativeRetained,
                  ltv
                };
              });
              const defs: {
                label: string;
                bold?: boolean;
                isPct?: boolean;
                pick: (r: (typeof rows)[number]) => number | null;
              }[] = [
                { label: 'Property at Cost (basis)', pick: (r) => r.basis },
                { label: '  (–) Accumulated Depreciation', pick: (r) => -r.accumDep },
                { label: 'Net Property', pick: (r) => r.netProperty, bold: true },
                {
                  label: 'Cash / Reserve Balance (operating + capex)',
                  pick: (r) => r.cashReserves
                },
                { label: 'TOTAL ASSETS', pick: (r) => r.totalAssets, bold: true },
                { label: 'Debt (senior)', pick: (r) => r.debt },
                { label: 'Equity (plug)', pick: (r) => r.equity, bold: true },
                { label: '  Cumulative Distributions Paid', pick: (r) => r.retained },
                { label: 'LTV (debt / net property)', pick: (r) => r.ltv, isPct: true }
              ];
              return defs.map((def) => (
                <tr key={`bs-${def.label}`} className="border-t border-zinc-800">
                  <td
                    className={`p-2 ${def.bold ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}
                  >
                    {def.label}
                  </td>
                  {rows.map((r) => {
                    const val = def.pick(r);
                    const txt = def.isPct ? pct(val) : krw(val);
                    return (
                      <td
                        key={`bs-${def.label}-${r.year}`}
                        className={`p-2 text-right ${def.bold ? 'font-semibold' : ''}`}
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
        Depreciation runs off total basis. Cash/Reserve = cumulative operating + capex reserves
        (both released to equity at exit); operating distributions are assumed paid out, so they are
        not retained on the balance sheet. Equity = Assets − Debt, which equals contributed equity
        grown by debt amortization and reserve accretion less depreciation.
      </p>
    </Section>
  );
}
