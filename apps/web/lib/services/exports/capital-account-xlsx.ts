/**
 * LP capital-account statement (PCAP) → Excel.
 *
 * Maps the `PcapResult` that already powers the on-screen capital-account table
 * (app/admin/funds/[id]) into a workbook spec for the #139 builder, so the
 * exported .xlsx matches the screen exactly (same `buildFundPcap` source).
 * Pure / testable.
 */
import type { PcapResult } from '@/lib/services/fund-nav';
import type { XlsxWorkbookSpec } from '@/lib/services/exports/xlsx';

function pctOrNull(value: number | null): number | null {
  // Excel percent format multiplies by 100, so a 40(%) figure becomes 0.40.
  return value === null ? null : value / 100;
}

export function pcapToXlsxSpec(pcap: PcapResult, fundName: string): XlsxWorkbookSpec {
  return {
    title: `${fundName} — LP 자본계정 명세 (PCAP)`,
    sheets: [
      {
        name: 'LP 자본계정',
        columns: [
          { header: '투자자', key: 'name', type: 'text', width: 28 },
          { header: '유형', key: 'type', type: 'text', width: 14 },
          { header: '약정액(KRW)', key: 'committed', type: 'currency', width: 18 },
          { header: '납입누계', key: 'called', type: 'currency', width: 18 },
          { header: '분배누계', key: 'distributed', type: 'currency', width: 18 },
          { header: '미납입', key: 'unfunded', type: 'currency', width: 18 },
          { header: 'NAV 지분', key: 'nav', type: 'currency', width: 18 },
          { header: '지분율', key: 'share', type: 'percent', width: 10 },
          { header: 'IRR', key: 'irr', type: 'percent', width: 10 },
          { header: 'TVPI', key: 'tvpi', type: 'number', width: 9 },
          { header: 'DPI', key: 'dpi', type: 'number', width: 9 },
          { header: 'RVPI', key: 'rvpi', type: 'number', width: 9 }
        ],
        rows: pcap.investors.map((lp) => ({
          name: lp.investorName ?? lp.investorCode ?? lp.investorId,
          type: lp.investorType ?? '',
          committed: lp.committedKrw,
          called: lp.calledKrw,
          distributed: lp.distributedKrw,
          unfunded: lp.unfundedKrw,
          nav: lp.navShareKrw,
          share: pctOrNull(lp.sharePct),
          irr: pctOrNull(lp.irrPct),
          tvpi: lp.tvpiMultiple,
          dpi: lp.dpiMultiple,
          rvpi: lp.rvpiMultiple
        })),
        totals: {
          name: '합계',
          type: '',
          committed: pcap.totals.committedKrw,
          called: pcap.totals.calledKrw,
          distributed: pcap.totals.distributedKrw,
          unfunded: pcap.totals.unfundedKrw,
          nav: pcap.totals.navShareKrw,
          share: 1,
          irr: pctOrNull(pcap.totals.irrPct),
          tvpi: pcap.totals.tvpiMultiple,
          dpi: pcap.totals.dpiMultiple,
          rvpi: pcap.totals.rvpiMultiple
        }
      }
    ]
  };
}
