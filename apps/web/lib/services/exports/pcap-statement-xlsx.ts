/**
 * ILPA-style PCAP roll-forward statement → Excel (benchmark #11).
 *
 * Companion to `pcapToXlsxSpec` (the flat summary). Renders the
 * beginning → contributions → distributions → net operating result → ending
 * roll-forward (one row per LP + a fund total) into the #139 workbook spec.
 * Pure / testable.
 */
import type { PcapStatement } from '@/lib/services/pcap-statement';
import type { XlsxWorkbookSpec } from '@/lib/services/exports/xlsx';

export function pcapStatementToXlsxSpec(
  statement: PcapStatement,
  fundName: string
): XlsxWorkbookSpec {
  const basisLabel =
    statement.basis === 'PERIOD' ? (statement.periodLabel ?? '기간') : '설립이래누계(ITD)';

  return {
    title: `${fundName} — LP 자본계정 변동표 (PCAP) · ${basisLabel}`,
    sheets: [
      {
        name: 'PCAP 변동표',
        columns: [
          { header: '투자자', key: 'name', type: 'text', width: 28 },
          { header: '유형', key: 'type', type: 'text', width: 14 },
          { header: '기초잔액', key: 'beginning', type: 'currency', width: 18 },
          { header: '납입(+)', key: 'contributions', type: 'currency', width: 18 },
          { header: '분배(−)', key: 'distributions', type: 'currency', width: 18 },
          { header: '순운용손익', key: 'nor', type: 'currency', width: 18 },
          { header: '기말잔액', key: 'ending', type: 'currency', width: 18 }
        ],
        rows: statement.lines.map((l) => ({
          name: l.investorName ?? l.investorCode ?? l.investorId,
          type: l.investorType ?? '',
          beginning: l.beginningBalanceKrw,
          contributions: l.contributionsKrw,
          distributions: l.distributionsKrw,
          nor: l.netOperatingResultKrw,
          ending: l.endingBalanceKrw
        })),
        totals: {
          name: '합계',
          type: '',
          beginning: statement.totals.beginningBalanceKrw,
          contributions: statement.totals.contributionsKrw,
          distributions: statement.totals.distributionsKrw,
          nor: statement.totals.netOperatingResultKrw,
          ending: statement.totals.endingBalanceKrw
        }
      }
    ]
  };
}
