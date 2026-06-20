import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw, pct } from './shared';

export function ReturnMetricsSection({ rm }: { rm: any }) {
  return (
    <Section title="Return Metrics">
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Equity IRR"
      >
        {pct(rm.equityIrr)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Unlevered IRR"
      >
        {pct(rm.unleveragedIrr)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Equity Multiple"
      >{`${rm.equityMultiple.toFixed(2)}x`}</KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Avg Cash-on-Cash"
      >
        {pct(rm.averageCashOnCash)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Payback Year"
      >
        {rm.paybackYear ?? 'never'}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Peak Equity"
      >
        {krw(rm.peakEquityExposureKrw)}
      </KeyValueRow>
    </Section>
  );
}
