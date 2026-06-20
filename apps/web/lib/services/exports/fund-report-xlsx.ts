/**
 * Fund operating report → Excel (요약 + 캐피탈콜 + 분배).
 *
 * Built from the same `buildCommitmentMath` figures + the fund's capital-call /
 * distribution rows that the fund page renders, so the workbook matches the
 * screen. Pure / testable; the route supplies coerced numbers + date strings.
 */
import type { XlsxWorkbookSpec } from '@/lib/services/exports/xlsx';

export type FundReportCall = {
  date: string;
  dueDate: string;
  amountKrw: number;
  purpose: string;
  status: string;
};

export type FundReportDistribution = {
  date: string;
  amountKrw: number;
  purpose: string;
  status: string;
};

export type FundReportSource = {
  fundName: string;
  commitmentKrw: number;
  calledKrw: number;
  distributedKrw: number;
  unfundedKrw: number;
  netInvestedKrw: number;
  navKrw: number;
  dryPowderKrw: number;
  targetSizeKrw: number | null;
  pendingCallsKrw: number;
  pendingDistributionsKrw: number;
  calls: FundReportCall[];
  distributions: FundReportDistribution[];
};

function ratio(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 10000) / 10000 : null;
}

/** Summary rows: a uniform [항목, 값, 단위] shape so money and multiples coexist. */
export function fundReportSummaryRows(
  src: FundReportSource
): { item: string; value: number | null; unit: string }[] {
  const dpi = ratio(src.distributedKrw, src.calledKrw);
  const tvpi = ratio(src.navKrw + src.distributedKrw, src.calledKrw);
  const calledPct = ratio(src.calledKrw, src.commitmentKrw);
  return [
    { item: '약정총액', value: src.commitmentKrw, unit: 'KRW' },
    { item: '목표 규모', value: src.targetSizeKrw, unit: 'KRW' },
    { item: '납입누계', value: src.calledKrw, unit: 'KRW' },
    { item: '분배누계', value: src.distributedKrw, unit: 'KRW' },
    { item: '미납입(Unfunded)', value: src.unfundedKrw, unit: 'KRW' },
    { item: '순투자(Net Invested)', value: src.netInvestedKrw, unit: 'KRW' },
    { item: 'NAV(공정가치)', value: src.navKrw, unit: 'KRW' },
    { item: 'Dry Powder', value: src.dryPowderKrw, unit: 'KRW' },
    { item: '미집행 콜', value: src.pendingCallsKrw, unit: 'KRW' },
    { item: '미지급 분배', value: src.pendingDistributionsKrw, unit: 'KRW' },
    { item: '납입률', value: calledPct === null ? null : calledPct * 100, unit: '%' },
    { item: 'DPI', value: dpi, unit: '배' },
    { item: 'TVPI', value: tvpi, unit: '배' }
  ];
}

export function fundReportToXlsxSpec(src: FundReportSource): XlsxWorkbookSpec {
  const callTotal = src.calls.reduce((s, c) => s + c.amountKrw, 0);
  const distTotal = src.distributions.reduce((s, d) => s + d.amountKrw, 0);
  return {
    title: `${src.fundName} — 펀드 운용보고`,
    sheets: [
      {
        name: '요약',
        columns: [
          { header: '항목', key: 'item', type: 'text', width: 26 },
          { header: '값', key: 'value', type: 'number', width: 20 },
          { header: '단위', key: 'unit', type: 'text', width: 8 }
        ],
        rows: fundReportSummaryRows(src)
      },
      {
        name: '캐피탈콜',
        columns: [
          { header: '콜일자', key: 'date', type: 'text', width: 14 },
          { header: '납입기한', key: 'dueDate', type: 'text', width: 14 },
          { header: '금액(KRW)', key: 'amountKrw', type: 'currency', width: 18 },
          { header: '목적', key: 'purpose', type: 'text', width: 28 },
          { header: '상태', key: 'status', type: 'text', width: 12 }
        ],
        rows: src.calls,
        totals: { date: '합계', dueDate: '', amountKrw: callTotal, purpose: '', status: '' }
      },
      {
        name: '분배',
        columns: [
          { header: '분배일자', key: 'date', type: 'text', width: 14 },
          { header: '금액(KRW)', key: 'amountKrw', type: 'currency', width: 18 },
          { header: '목적', key: 'purpose', type: 'text', width: 28 },
          { header: '상태', key: 'status', type: 'text', width: 12 }
        ],
        rows: src.distributions,
        totals: { date: '합계', amountKrw: distTotal, purpose: '', status: '' }
      }
    ]
  };
}
