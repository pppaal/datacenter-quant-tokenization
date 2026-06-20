import { Section, krw } from './shared';

export function IncomeStatementSection({ pfYears }: { pfYears: any[] }) {
  // Capacity (kW) rows are data-center-specific; for office/retail/etc. every
  // year is 0, so only show them when the pro forma actually carries capacity.
  const hasCapacityData = pfYears.some((y) => (y.occupiedKw ?? 0) > 0 || (y.contractedKw ?? 0) > 0);
  return (
    <Section title="Income Statement (10-year)" collapsible defaultOpen={false}>
      <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
        Line items below the revenue and NOI subtotals are a synthetic decomposition (fixed
        contracted/renewal/residual and recovery/opex ratios) for transparency — not a parsed rent
        roll. The bolded subtotals (Total Operating Revenue, NOI, CFADS) are the model outputs.
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full min-w-[720px] text-sm font-mono"
          aria-label="Annual income statement"
        >
          <thead>
            <tr className="text-zinc-400">
              <th scope="col" className="p-2 text-left">
                Line
              </th>
              {pfYears.map((y) => (
                <th scope="col" key={`is-h-${y.year}`} className="p-2 text-right">
                  Y{y.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              {
                label: 'Gross Potential Revenue',
                pick: (y: any) => y.grossPotentialRevenueKrw
              },
              {
                label: '  (–) Downtime Loss',
                pick: (y: any) => -(y.downtimeLossKrw + y.renewalDowntimeLossKrw)
              },
              {
                label: '  (–) Rent-Free Loss',
                pick: (y: any) => -(y.rentFreeLossKrw + y.renewalRentFreeLossKrw)
              },
              {
                label: '  Contracted Rent (net)',
                pick: (y: any) => y.contractedRevenueKrw
              },
              {
                label: '  Renewal Rent (net)',
                pick: (y: any) => y.renewalRevenueKrw
              },
              {
                label: '  Residual / Market Rent',
                pick: (y: any) => y.residualRevenueKrw
              },
              {
                label: '  Fixed Recoveries',
                pick: (y: any) => y.fixedRecoveriesKrw
              },
              {
                label: '  Site Recoveries',
                pick: (y: any) => y.siteRecoveriesKrw
              },
              {
                label: '  Utility Pass-Through',
                pick: (y: any) => y.utilityPassThroughRevenueKrw
              },
              {
                label: '  Total Reimbursements (subtotal)',
                pick: (y: any) => y.reimbursementRevenueKrw
              },
              {
                label: 'Total Operating Revenue',
                pick: (y: any) => y.totalOperatingRevenueKrw,
                bold: true
              },
              {
                label: 'Operating Expenses',
                pick: (y: any) => -y.operatingExpenseKrw
              },
              {
                label: '  Power Cost',
                pick: (y: any) => -y.powerCostKrw
              },
              {
                label: '  Site Opex',
                pick: (y: any) => -y.siteOperatingExpenseKrw
              },
              {
                label: '  Non-Recoverable',
                pick: (y: any) => -y.nonRecoverableOperatingExpenseKrw
              },
              {
                label: '  Maintenance Reserve',
                pick: (y: any) => -y.maintenanceReserveKrw
              },
              {
                label: 'NOI',
                pick: (y: any) => y.noiKrw,
                bold: true
              },
              {
                label: 'Tenant Improvement (TI)',
                pick: (y: any) => -y.tenantImprovementKrw
              },
              {
                label: 'Leasing Commission (LC)',
                pick: (y: any) => -y.leasingCommissionKrw
              },
              {
                label: '  Tenant Capital (TI+LC subtotal)',
                pick: (y: any) => -y.tenantCapitalCostKrw
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
                label: 'CFADS (pre-debt)',
                pick: (y: any) => y.cfadsBeforeDebtKrw,
                bold: true
              },
              {
                label: 'Occupied (kW)',
                pick: (y: any) => y.occupiedKw,
                isKw: true
              },
              {
                label: 'Contracted (kW)',
                pick: (y: any) => y.contractedKw,
                isKw: true
              },
              {
                label: 'Residual Occupied (kW)',
                pick: (y: any) => y.residualOccupiedKw,
                isKw: true
              },
              {
                label: 'Active Renewal Leases',
                pick: (y: any) => y.activeRenewalLeaseCount,
                isCount: true
              },
              {
                label: 'Wtd Renewal Rate (KRW/kW)',
                pick: (y: any) => y.weightedRenewalRatePerKwKrw,
                isRatePerKw: true
              }
            ]
              .filter((row) => hasCapacityData || !((row as any).isKw || (row as any).isRatePerKw))
              .map((row) => (
                <tr key={`is-${row.label}`} className="border-t border-zinc-800">
                  <td
                    className={`p-2 ${row.bold ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}
                  >
                    {row.label}
                  </td>
                  {pfYears.map((y) => {
                    const val = row.pick(y);
                    const txt = row.isKw
                      ? `${Math.round(val as number).toLocaleString()} kW`
                      : row.isCount
                        ? `${val}`
                        : row.isRatePerKw
                          ? val == null
                            ? 'N/A'
                            : Math.round(val as number).toLocaleString()
                          : krw(val as number);
                    return (
                      <td
                        key={`is-${row.label}-${y.year}`}
                        className={`p-2 text-right ${row.bold ? 'font-semibold' : ''}`}
                      >
                        {txt}
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
