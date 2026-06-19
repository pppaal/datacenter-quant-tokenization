import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw } from './shared';

export function BasisDepreciationSection({ pfx }: { pfx: any }) {
  // Derive the effective acquisition-tax rate from the actuals instead of
  // hardcoding "4.6%" — the underlying rate can be heavier (중과세) and the
  // label otherwise misrepresents the applied tax.
  const purchasePriceKrw = (pfx.totalBasisKrw ?? 0) - (pfx.acquisitionTaxKrw ?? 0);
  const acqTaxPct =
    purchasePriceKrw > 0 ? ((pfx.acquisitionTaxKrw ?? 0) / purchasePriceKrw) * 100 : null;
  return (
    <Section title="4b. Basis / Depreciation / Exit Costs" collapsible defaultOpen={false}>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label={`Acquisition Tax${acqTaxPct !== null ? ` (${acqTaxPct.toFixed(1)}%)` : ''}`}
      >
        {krw(pfx.acquisitionTaxKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Total Basis (price + 취득세)"
      >
        {krw(pfx.totalBasisKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Annual Depreciation"
      >
        {krw(pfx.annualDepreciationKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Accumulated Depreciation (10y)"
      >
        {krw(pfx.accumulatedDepreciationKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Depreciation Tax Shield (cumulative)"
      >
        {krw(pfx.depreciationTaxShieldKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Adjusted Basis at Exit"
      >
        {krw(pfx.adjustedBasisAtExitKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Exit Transaction Cost (1.5%)"
      >
        {krw(pfx.exitTransactionCostKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="In-place Terminal NOI (Y10)"
      >
        {krw(pfx.inPlaceTerminalNoiKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Forward Terminal NOI (Y11, used for exit cap)"
      >
        {krw(pfx.forwardTerminalNoiKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Capex Reserve (cumulative)"
      >
        {krw(pfx.totalCapexReserveKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Operating Reserve (cumulative)"
      >
        {krw(pfx.totalOperatingReserveKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Released at Exit (reserves)"
      >
        {krw(pfx.releasedReservesAtExitKrw)}
      </KeyValueRow>
    </Section>
  );
}
