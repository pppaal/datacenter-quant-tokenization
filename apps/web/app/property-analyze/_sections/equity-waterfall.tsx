import { KeyValueRow } from '@/components/ui/key-value-row';
import { Section, krw, pct } from './shared';

export function EquityWaterfallSection({
  pf,
  pfx,
  rm,
  pfYears
}: {
  pf: any;
  pfx: any;
  rm: any;
  pfYears: any[];
}) {
  return (
    <Section title="Equity Waterfall" collapsible defaultOpen={false}>
      {(() => {
        const initialEquity = pf.initialEquityKrw;
        const cumulativeDistributions = pfYears.reduce((s, y) => s + y.afterTaxDistributionKrw, 0);
        const cumInterest = pfYears.reduce((s, y) => s + y.interestKrw, 0);
        const cumPrincipal = pfYears.reduce((s, y) => s + y.principalKrw, 0);
        const cumPropertyTax = pfYears.reduce((s, y) => s + y.propertyTaxKrw, 0);
        const cumCorpTax = pfYears.reduce((s, y) => s + y.corporateTaxKrw, 0);
        const grossExit = pf.grossExitValueKrw;
        const netExit = pf.netExitProceedsKrw;
        const endingDebt = pf.endingDebtBalanceKrw;
        const exitCostsTotal = grossExit - netExit;
        const totalReturn = cumulativeDistributions + netExit;
        const gain = totalReturn - initialEquity;
        const moic = initialEquity > 0 ? totalReturn / initialEquity : 0;
        const operatingShare = cumulativeDistributions / Math.max(totalReturn, 1);
        const exitShare = netExit / Math.max(totalReturn, 1);
        return (
          <>
            <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
              Sources &amp; Uses (entry)
            </div>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="Initial Debt Funding"
            >
              {krw(pf.initialDebtFundingKrw)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="(1) Initial Equity Outlay"
            >
              {krw(-initialEquity)}
            </KeyValueRow>

            <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
              Operating Cash (Y1–Y{pf.terminalYear})
            </div>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="Cumulative Interest Paid"
            >
              {krw(-cumInterest)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="Cumulative Principal Paid"
            >
              {krw(-cumPrincipal)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="Cumulative Property Tax"
            >
              {krw(-cumPropertyTax)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="Cumulative Corporate Tax"
            >
              {krw(-cumCorpTax)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="(2) Cumulative After-Tax Distributions"
            >
              {krw(cumulativeDistributions)}
            </KeyValueRow>

            <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
              Exit Decomposition (Y{pf.terminalYear})
            </div>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="Gross Exit Value"
            >
              {krw(grossExit)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="(–) Ending Debt Repayment"
            >
              {krw(-endingDebt)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="(–) Exit Transaction / Promote / Tax"
            >
              {krw(-exitCostsTotal)}
            </KeyValueRow>
            {pfx && (
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="    • Exit Transaction Cost (1.5%)"
              >
                {krw(-pfx.exitTransactionCostKrw)}
              </KeyValueRow>
            )}
            {pfx && pfx.releasedReservesAtExitKrw > 0 && (
              <KeyValueRow
                variant="divider"
                className="border-t py-1.5 text-sm first:border-t-0"
                label="(+) Released SPV Reserves (capex + opex)"
              >
                {krw(pfx.releasedReservesAtExitKrw)}
              </KeyValueRow>
            )}
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="(3) Net Exit Proceeds"
            >
              {krw(netExit)}
            </KeyValueRow>

            <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
              Equity Return
            </div>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="(4) Total Return to Equity  [ (2) + (3) ]"
            >
              {krw(totalReturn)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="(5) Net Gain  [ (4) − |1| ]"
            >
              {krw(gain)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="(6) MOIC  [ (4) ÷ |1| ]"
            >{`${moic.toFixed(2)}x`}</KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="  • Operating CF share of return"
            >
              {pct(operatingShare * 100)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="  • Exit proceeds share of return"
            >
              {pct(exitShare * 100)}
            </KeyValueRow>
            <KeyValueRow
              variant="divider"
              className="border-t py-1.5 text-sm first:border-t-0"
              label="Levered Equity Value (PV)"
            >
              {krw(pf.leveredEquityValueKrw)}
            </KeyValueRow>
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
              label="Payback Year"
            >
              {rm.paybackYear ?? 'never'}
            </KeyValueRow>
          </>
        );
      })()}
    </Section>
  );
}
