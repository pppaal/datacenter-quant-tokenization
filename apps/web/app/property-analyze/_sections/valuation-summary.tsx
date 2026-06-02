import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw } from './shared';

export function ValuationSummary({ a, resolved, cls }: { a: any; resolved: any; cls: any }) {
  return (
    <Section title={`${resolved.roadAddress ?? resolved.jibunAddress} · ${resolved.districtName}`}>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Primary class"
      >{`${a.asset.assetClass} (${cls.feasibility})`}</KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Base valuation"
      >{`${krw(a.baseCaseValueKrw)} KRW`}</KeyValueRow>
      <KeyValueRow
        variant="divider"
        className="border-t py-1.5 text-sm first:border-t-0"
        label="Scenario range"
      >
        {`${krw(a.scenarios.find((s: any) => s.name === 'Bear')?.valuationKrw)} — ${krw(
          a.scenarios.find((s: any) => s.name === 'Bull')?.valuationKrw
        )}`}
      </KeyValueRow>
    </Section>
  );
}
