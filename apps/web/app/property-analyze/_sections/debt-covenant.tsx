import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section } from './shared';

export function DebtCovenantSection({ dc }: { dc: any }) {
  return (
    <Section title="Debt Covenant (DSCR)">
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Covenant floor"
      >{`${dc.covenantFloor.toFixed(2)}x`}</KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Year-1 DSCR"
      >
        {dc.baseYear1Dscr ? `${dc.baseYear1Dscr.toFixed(2)}x` : 'N/A'}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label={`Years < ${dc.covenantFloor}`}
      >
        {dc.yearsBelowFloor.length > 0 ? dc.yearsBelowFloor.join(',') : 'none'}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Years < 1.00x"
      >
        {dc.yearsBelowOne.length > 0 ? dc.yearsBelowOne.join(',') : 'none'}
      </KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Base breaches"
      >
        {dc.breachesInBase ? 'YES ⚠' : 'NO'}
      </KeyValueRow>
    </Section>
  );
}
