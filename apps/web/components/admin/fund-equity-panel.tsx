import { Card } from '@/components/ui/card';
import { fundEquityRows, type FundReportSource } from '@/lib/services/exports/fund-report-xlsx';

type Props = {
  /** The figures the fund page already computes (buildCommitmentMath). */
  source: Pick<
    FundReportSource,
    'fundName' | 'calledKrw' | 'distributedKrw' | 'navKrw' | 'netInvestedKrw'
  > &
    Partial<FundReportSource>;
};

function krw(value: number): string {
  const eok = value / 100_000_000;
  const s = Math.abs(eok).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return eok < 0 ? `(${s}억)` : `${s}억`;
}

/**
 * Statement of changes in equity (자본변동표), contribution basis,
 * inception-to-date — derived from the fund's called / distributed / NAV (same
 * fundEquityRows the Excel export uses). 기초 0 + 출자 − 분배 + 누적손익 = NAV.
 */
export function FundEquityPanel({ source }: Props) {
  const rows = fundEquityRows(source as FundReportSource);
  return (
    <Card>
      <div className="eyebrow">자본변동표 (설정 후 누계)</div>
      <p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">
        출자(LP 납입) − 분배 + 누적 평가·운용손익 = 기말 자본(NAV). 단위: 억원.
      </p>
      <div className="mt-4 overflow-x-auto rounded-[14px] border border-border">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.item}>
                <td className="px-4 py-2 text-[hsl(var(--foreground-muted))]">{r.item}</td>
                <td className="px-4 py-2 text-right tabular-nums">{krw(r.amountKrw)}</td>
              </tr>
            ))}
            <tr className="bg-[hsl(var(--accent-tint))] font-semibold">
              <td className="px-4 py-2">기말 자본 (NAV)</td>
              <td className="px-4 py-2 text-right tabular-nums">{krw(source.navKrw)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
