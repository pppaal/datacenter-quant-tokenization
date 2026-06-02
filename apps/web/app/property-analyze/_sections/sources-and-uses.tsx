import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw } from './shared';

export function SourcesAndUsesSection({ pf, pfx, pfYears }: { pf: any; pfx: any; pfYears: any[] }) {
  return (
    <Section title="4a. Sources & Uses at Entry" collapsible defaultOpen={false}>
      {(() => {
        const purchasePrice = pfx.totalBasisKrw - pfx.acquisitionTaxKrw;
        const y1 = pfYears[0]!;
        const initialTenantCapital = y1.tenantCapitalCostKrw + y1.fitOutCostKrw;
        const reserveFunding = pf.reserveRequirementKrw;
        const totalUses =
          purchasePrice + pfx.acquisitionTaxKrw + initialTenantCapital + reserveFunding;
        const totalSources = pf.initialDebtFundingKrw + pf.initialEquityKrw;
        const balanceCheck = totalSources - totalUses;
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
                Uses of Funds
              </div>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="Purchase Price"
              >
                {krw(purchasePrice)}
              </KeyValueRow>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="Acquisition Tax (4.6%)"
              >
                {krw(pfx.acquisitionTaxKrw)}
              </KeyValueRow>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="Initial TI + Fit-out (Y1)"
              >
                {krw(initialTenantCapital)}
              </KeyValueRow>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="Reserve Funding"
              >
                {krw(reserveFunding)}
              </KeyValueRow>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="Total Uses"
              >
                {krw(totalUses)}
              </KeyValueRow>
            </div>
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
                Sources of Funds
              </div>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label={`Senior Debt (${((pf.initialDebtFundingKrw / Math.max(purchasePrice, 1)) * 100).toFixed(1)}% LTV)`}
              >
                {krw(pf.initialDebtFundingKrw)}
              </KeyValueRow>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="Sponsor Equity"
              >
                {krw(pf.initialEquityKrw)}
              </KeyValueRow>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="Total Sources"
              >
                {krw(totalSources)}
              </KeyValueRow>
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="Balance (Sources − Uses)"
              >
                {krw(balanceCheck)}
              </KeyValueRow>
            </div>
          </div>
        );
      })()}
    </Section>
  );
}
