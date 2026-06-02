import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw } from './shared';

export function ProFormaSummarySection({ pf }: { pf: any }) {
  return (
    <Section title="4. Pro-Forma Summary (10-year)">
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Year-1 NOI"
      >
        {krw(pf.stabilizedNoiKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Year-1 Revenue"
      >
        {krw(pf.annualRevenueKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label={`Terminal Value (Y${pf.terminalYear})`}
      >
        {krw(pf.terminalValueKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Initial Equity"
      >
        {krw(pf.initialEquityKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Initial Debt"
      >
        {krw(pf.initialDebtFundingKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Ending Debt Balance"
      >
        {krw(pf.endingDebtBalanceKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Gross Exit Value"
      >
        {krw(pf.grossExitValueKrw)}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Net Exit Proceeds"
      >
        {krw(pf.netExitProceedsKrw)}
      </KeyValueRow>
    </Section>
  );
}
