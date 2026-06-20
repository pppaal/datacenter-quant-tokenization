import { Section, krw } from './shared';

export function CashFlowSection({ pfYears }: { pfYears: any[] }) {
  return (
    <Section title="Cash Flow (10-year)" collapsible defaultOpen={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm font-mono" aria-label="Annual cash flow">
          <thead>
            <tr className="text-zinc-400">
              <th scope="col" className="p-2 text-left">
                Line
              </th>
              {pfYears.map((y) => (
                <th scope="col" key={`cf-h-${y.year}`} className="p-2 text-right">
                  Y{y.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'NOI', pick: (y: any) => y.noiKrw },
              {
                label: 'Tenant Improvement (TI)',
                pick: (y: any) => -y.tenantImprovementKrw
              },
              {
                label: 'Leasing Commission (LC)',
                pick: (y: any) => -y.leasingCommissionKrw
              },
              {
                label: 'Renewal Tenant Capital',
                pick: (y: any) => -y.renewalTenantCapitalCostKrw
              },
              {
                label: 'Fit-Out Cost',
                pick: (y: any) => -y.fitOutCostKrw
              },
              {
                label: 'Debt Draw',
                pick: (y: any) => y.drawAmountKrw
              },
              {
                label: 'Interest',
                pick: (y: any) => -y.interestKrw
              },
              {
                label: 'Principal',
                pick: (y: any) => -y.principalKrw
              },
              {
                label: 'Debt Service (total)',
                pick: (y: any) => -y.debtServiceKrw
              },
              {
                label: 'Ending Debt Balance',
                pick: (y: any) => y.endingDebtBalanceKrw
              },
              {
                label: 'Property Tax',
                pick: (y: any) => -y.propertyTaxKrw
              },
              {
                label: '종합부동산세 (Jongbuse)',
                pick: (y: any) => -y.jongbuseKrw
              },
              {
                label: 'Insurance',
                pick: (y: any) => -y.insuranceKrw
              },
              {
                label: 'Management Fee',
                pick: (y: any) => -y.managementFeeKrw
              },
              {
                label: 'Reserve Contribution',
                pick: (y: any) => -y.reserveContributionKrw
              },
              {
                label: 'Capex Reserve',
                pick: (y: any) => -y.capexReserveKrw
              },
              {
                label: 'Corporate Tax',
                pick: (y: any) => -y.corporateTaxKrw
              },
              {
                label: 'After-Tax Distribution',
                pick: (y: any) => y.afterTaxDistributionKrw,
                bold: true
              },
              {
                label: 'DSCR',
                pick: (y: any) => y.dscr,
                isRatio: true
              }
            ].map((row) => (
              <tr key={`cf-${row.label}`} className="border-t border-zinc-800">
                <td className={`p-2 ${row.bold ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}>
                  {row.label}
                </td>
                {pfYears.map((y) => {
                  const val = row.pick(y);
                  return (
                    <td
                      key={`cf-${row.label}-${y.year}`}
                      className={`p-2 text-right ${row.bold ? 'font-semibold' : ''}`}
                    >
                      {row.isRatio
                        ? val == null
                          ? 'N/A'
                          : `${(val as number).toFixed(2)}x`
                        : krw(val as number)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
