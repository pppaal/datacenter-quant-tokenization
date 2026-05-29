import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  buildPcap,
  computeFundNavDetail,
  type LpStatement,
  type PcapResult
} from '@/lib/services/fund-nav';

type InvestorReportSection = {
  title: string;
  content: string;
};

type InvestorReportBundle = {
  reportTitle: string;
  fundName: string;
  vehicleName: string | null;
  reportDate: string;
  reportingPeriod: string;
  generatedAt: string;
  sections: InvestorReportSection[];
  metrics: {
    navKrw: number;
    committedKrw: number;
    calledKrw: number;
    distributedKrw: number;
    remainingCommitmentKrw: number;
    dpiMultiple: number;
    tvpiMultiple: number;
    rvpiMultiple: number;
    irrPct: number | null;
    assetCount: number;
    /** True when fund NAV relied on a cost-basis fallback (not fully marked). */
    navUsedCostBasisFallback: boolean;
  };
  /**
   * Per-LP capital account when the report is scoped to a single investor;
   * null for fund-level rollup reports.
   */
  investor: {
    investorId: string;
    investorName: string | null;
    statement: LpStatement;
  } | null;
  exportFileBase: string;
};

function formatKrwBillions(value: number) {
  return `₩${(value / 1_000_000_000).toFixed(1)}B`;
}

/**
 * Build per-LP capital accounts (PCAP) for an entire fund in a single query.
 * Returns the fund-level rollup plus one `LpStatement` per LP — the data the
 * admin fund page renders as a capital-accounts table. Mirrors the loading
 * logic in `buildInvestorReport` (allocations included so cashflow timing is
 * per-LP when available; otherwise pro-rata, flagged on each statement).
 */
export async function buildFundPcap(
  fundId: string,
  db: PrismaClient = prisma
): Promise<PcapResult> {
  const fund = await db.fund.findUnique({
    where: { id: fundId },
    include: {
      commitments: { include: { investor: true } },
      capitalCalls: { include: { allocations: true } },
      distributions: { include: { allocations: true } },
      portfolio: {
        include: {
          assets: {
            include: {
              asset: {
                select: {
                  id: true,
                  name: true,
                  assetCode: true,
                  purchasePriceKrw: true,
                  valuations: {
                    orderBy: { createdAt: 'desc' as const },
                    take: 1,
                    select: { baseCaseValueKrw: true, createdAt: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!fund) throw new Error('Fund not found.');

  const nav = computeFundNavDetail(fund);

  return buildPcap({
    commitments: fund.commitments.map((c) => ({
      investorId: c.investorId,
      investorCode: c.investor?.code ?? null,
      investorName: c.investor?.name ?? null,
      investorType: c.investor?.investorType ?? null,
      commitmentKrw: c.commitmentKrw,
      calledKrw: c.calledKrw,
      distributedKrw: c.distributedKrw,
      recallableKrw: c.recallableKrw,
      signedAt: c.signedAt
    })),
    fundCapitalCalls: fund.capitalCalls.flatMap((c) =>
      c.allocations.length > 0
        ? c.allocations.map((a) => ({
            date: c.callDate,
            amountKrw: a.amountKrw,
            investorId: a.investorId
          }))
        : [{ date: c.callDate, amountKrw: c.amountKrw }]
    ),
    fundDistributions: fund.distributions.flatMap((d) =>
      d.allocations.length > 0
        ? d.allocations.map((a) => ({
            date: d.distributionDate,
            amountKrw: a.amountKrw,
            investorId: a.investorId
          }))
        : [{ date: d.distributionDate, amountKrw: d.amountKrw }]
    ),
    nav
  });
}

export async function buildInvestorReport(
  fundId: string,
  options: { periodLabel?: string; investorId?: string | null } = {},
  db: PrismaClient = prisma
): Promise<InvestorReportBundle> {
  const fund = await db.fund.findUnique({
    where: { id: fundId },
    include: {
      vehicles: true,
      commitments: {
        include: {
          investor: true
        }
      },
      capitalCalls: { include: { allocations: true } },
      distributions: { include: { allocations: true } },
      portfolio: {
        include: {
          assets: {
            include: {
              asset: {
                select: {
                  id: true,
                  name: true,
                  assetCode: true,
                  assetClass: true,
                  purchasePriceKrw: true,
                  valuations: {
                    orderBy: { createdAt: 'desc' as const },
                    take: 1,
                    select: { baseCaseValueKrw: true, createdAt: true }
                  },
                  marketSnapshot: {
                    select: {
                      capRatePct: true,
                      vacancyPct: true
                    }
                  }
                }
              }
            },
            take: 20
          }
        }
      }
    }
  });

  if (!fund) throw new Error('Fund not found.');

  const reportDate = new Date().toISOString().slice(0, 10);
  const periodLabel =
    options.periodLabel ??
    `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;

  const committedKrw = fund.commitments.reduce((sum, c) => {
    const amt =
      typeof c.commitmentKrw === 'number'
        ? c.commitmentKrw
        : ((c.commitmentKrw as any)?.toNumber?.() ?? 0);
    return sum + amt;
  }, 0);

  const calledKrw = fund.commitments.reduce((sum, c) => {
    const amt =
      typeof c.calledKrw === 'number' ? c.calledKrw : ((c.calledKrw as any)?.toNumber?.() ?? 0);
    return sum + amt;
  }, 0);

  const distributedKrw = fund.commitments.reduce((sum, c) => {
    const amt =
      typeof c.distributedKrw === 'number'
        ? c.distributedKrw
        : ((c.distributedKrw as any)?.toNumber?.() ?? 0);
    return sum + amt;
  }, 0);

  const remainingCommitmentKrw = committedKrw - calledKrw;

  // Fair-value NAV = sum of latest asset valuations (cost-basis fallback flagged).
  const nav = computeFundNavDetail(fund);

  // Per-LP capital accounts + fund-level rollup (real dated XIRR/TVPI/DPI/RVPI).
  const pcap = buildPcap({
    commitments: fund.commitments.map((c) => ({
      investorId: c.investorId,
      investorCode: c.investor?.code ?? null,
      investorName: c.investor?.name ?? null,
      investorType: c.investor?.investorType ?? null,
      commitmentKrw: c.commitmentKrw,
      calledKrw: c.calledKrw,
      distributedKrw: c.distributedKrw,
      recallableKrw: c.recallableKrw,
      signedAt: c.signedAt
    })),
    // Expand per-LP allocation rows when present; otherwise emit one fund-level
    // event (buildPcap allocates those pro-rata by commitment).
    fundCapitalCalls: fund.capitalCalls.flatMap((c) =>
      c.allocations.length > 0
        ? c.allocations.map((a) => ({
            date: c.callDate,
            amountKrw: a.amountKrw,
            investorId: a.investorId
          }))
        : [{ date: c.callDate, amountKrw: c.amountKrw }]
    ),
    fundDistributions: fund.distributions.flatMap((d) =>
      d.allocations.length > 0
        ? d.allocations.map((a) => ({
            date: d.distributionDate,
            amountKrw: a.amountKrw,
            investorId: a.investorId
          }))
        : [{ date: d.distributionDate, amountKrw: d.amountKrw }]
    ),
    nav
  });

  const scopedStatement: LpStatement | null = options.investorId
    ? (pcap.investors.find((i) => i.investorId === options.investorId) ?? null)
    : null;

  // When scoped to one LP, the headline metrics reflect that LP's capital account;
  // otherwise they reflect the fund-level rollup.
  const navKrw = scopedStatement ? scopedStatement.navShareKrw : nav.navKrw;
  const reportCalledKrw = scopedStatement ? scopedStatement.calledKrw : calledKrw;
  const reportDistributedKrw = scopedStatement ? scopedStatement.distributedKrw : distributedKrw;
  const reportCommittedKrw = scopedStatement ? scopedStatement.committedKrw : committedKrw;
  const reportRemainingKrw = scopedStatement ? scopedStatement.unfundedKrw : remainingCommitmentKrw;
  const dpiMultiple = scopedStatement ? scopedStatement.dpiMultiple : pcap.totals.dpiMultiple;
  const tvpiMultiple = scopedStatement ? scopedStatement.tvpiMultiple : pcap.totals.tvpiMultiple;
  const rvpiMultiple = scopedStatement ? scopedStatement.rvpiMultiple : pcap.totals.rvpiMultiple;
  const irrPct = scopedStatement ? scopedStatement.irrPct : pcap.totals.irrPct;

  const portfolioAssets = fund.portfolio?.assets ?? [];
  const assetCount = portfolioAssets.length;

  const irrLabel = irrPct == null ? 'n/a' : `${irrPct.toFixed(1)}%`;

  const sections: InvestorReportSection[] = [
    {
      title: 'Fund Overview',
      content: `${fund.name} is a ${fund.strategy ?? 'diversified real-estate'} fund with ${formatKrwBillions(committedKrw)} in total commitments across ${fund.vehicles.length} vehicle(s). As of ${reportDate}, the fund holds ${assetCount} portfolio asset(s). Fund NAV (fair value) is ${formatKrwBillions(nav.navKrw)}${nav.usedCostBasisFallback ? ' (includes cost-basis fallback for unvalued assets)' : ''}.`
    },
    {
      title: scopedStatement ? 'Capital Account' : 'Capital Activity',
      content: [
        `${scopedStatement ? 'Committed' : 'Total committed'}: ${formatKrwBillions(reportCommittedKrw)}`,
        `Capital called: ${formatKrwBillions(reportCalledKrw)} (${reportCommittedKrw > 0 ? ((reportCalledKrw / reportCommittedKrw) * 100).toFixed(1) : 0}% drawn)`,
        `Distributions to date: ${formatKrwBillions(reportDistributedKrw)}`,
        `${scopedStatement ? 'Unfunded' : 'Remaining'} commitment: ${formatKrwBillions(reportRemainingKrw)}`,
        `NAV ${scopedStatement ? 'share' : ''}: ${formatKrwBillions(navKrw)}`,
        `IRR: ${irrLabel} / DPI: ${dpiMultiple}x / RVPI: ${rvpiMultiple}x / TVPI: ${tvpiMultiple}x`,
        ...(scopedStatement?.cashflowsAllocatedProRata
          ? [
              '(Per-LP cashflow timing is allocated pro-rata by commitment — interim until per-LP allocation rows exist.)'
            ]
          : [])
      ].join('\n')
    },
    {
      title: 'Portfolio Summary',
      content:
        assetCount > 0
          ? portfolioAssets
              .map((pa) => {
                const asset = pa.asset;
                if (!asset) return '';
                const price =
                  typeof asset.purchasePriceKrw === 'number'
                    ? asset.purchasePriceKrw
                    : ((asset.purchasePriceKrw as any)?.toNumber?.() ?? 0);
                return `- ${asset.name} (${asset.assetCode}): ${asset.assetClass ?? 'N/A'}, ${formatKrwBillions(price)}`;
              })
              .filter(Boolean)
              .join('\n')
          : 'No portfolio assets are linked to this fund.'
    },
    {
      title: 'Market Commentary',
      content:
        'The Korean real-estate market continues to show institutional demand across office and data-center sectors. Cap rates remain compressed in prime CBD locations while logistics and edge-compute segments show selective expansion.'
    },
    {
      title: 'Outlook & Next Steps',
      content: `Management is actively monitoring portfolio occupancy and lease rollover exposure. The next capital call is expected in ${periodLabel} to fund committed acquisitions.`
    }
  ];

  const scopeTitle = scopedStatement
    ? ` — ${scopedStatement.investorName ?? scopedStatement.investorCode ?? 'LP'}`
    : '';

  return {
    reportTitle: `${fund.name} — Investor Report${scopeTitle} — ${periodLabel}`,
    fundName: fund.name,
    vehicleName: fund.vehicles[0]?.name ?? null,
    reportDate,
    reportingPeriod: periodLabel,
    generatedAt: new Date().toISOString(),
    sections,
    metrics: {
      navKrw,
      committedKrw: reportCommittedKrw,
      calledKrw: reportCalledKrw,
      distributedKrw: reportDistributedKrw,
      remainingCommitmentKrw: reportRemainingKrw,
      dpiMultiple,
      tvpiMultiple,
      rvpiMultiple,
      irrPct,
      assetCount,
      navUsedCostBasisFallback: nav.usedCostBasisFallback
    },
    investor: scopedStatement
      ? {
          investorId: scopedStatement.investorId,
          investorName: scopedStatement.investorName,
          statement: scopedStatement
        }
      : null,
    exportFileBase: scopedStatement
      ? `investor-report-${fund.name.toLowerCase().replace(/\s+/g, '-')}-${(scopedStatement.investorCode ?? scopedStatement.investorId).toLowerCase()}-${reportDate}`
      : `investor-report-${fund.name.toLowerCase().replace(/\s+/g, '-')}-${reportDate}`
  };
}

export function serializeInvestorReportToMarkdown(report: InvestorReportBundle) {
  const lines: string[] = [
    `# ${report.reportTitle}`,
    '',
    `**Fund:** ${report.fundName}`,
    report.vehicleName ? `**Vehicle:** ${report.vehicleName}` : '',
    `**Reporting Period:** ${report.reportingPeriod}`,
    `**Generated:** ${report.generatedAt}`,
    '',
    '---',
    '',
    '## Key Metrics',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| NAV | ${formatKrwBillions(report.metrics.navKrw)} |`,
    `| Committed | ${formatKrwBillions(report.metrics.committedKrw)} |`,
    `| Called | ${formatKrwBillions(report.metrics.calledKrw)} |`,
    `| Distributed | ${formatKrwBillions(report.metrics.distributedKrw)} |`,
    `| Remaining | ${formatKrwBillions(report.metrics.remainingCommitmentKrw)} |`,
    `| IRR | ${report.metrics.irrPct == null ? 'n/a' : `${report.metrics.irrPct.toFixed(1)}%`} |`,
    `| DPI | ${report.metrics.dpiMultiple}x |`,
    `| RVPI | ${report.metrics.rvpiMultiple}x |`,
    `| TVPI | ${report.metrics.tvpiMultiple}x |`,
    `| Assets | ${report.metrics.assetCount} |`,
    ''
  ].filter((l) => l !== '');

  for (const section of report.sections) {
    lines.push('', `## ${section.title}`, '', section.content);
  }

  lines.push('', '---', `*Report generated by Investment Firm OS on ${report.generatedAt}*`);
  return lines.join('\n');
}

function csvEscape(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeInvestorReportToCsv(report: InvestorReportBundle) {
  const rows: string[] = [];
  rows.push(['Report', report.reportTitle].map(csvEscape).join(','));
  rows.push(['Fund', report.fundName].map(csvEscape).join(','));
  rows.push(['Vehicle', report.vehicleName ?? ''].map(csvEscape).join(','));
  rows.push(['Reporting Period', report.reportingPeriod].map(csvEscape).join(','));
  rows.push(['Report Date', report.reportDate].map(csvEscape).join(','));
  rows.push(['Generated At', report.generatedAt].map(csvEscape).join(','));
  rows.push('');
  rows.push(['Metric', 'Value (KRW)'].map(csvEscape).join(','));
  rows.push(['NAV', report.metrics.navKrw].map(csvEscape).join(','));
  rows.push(['Committed', report.metrics.committedKrw].map(csvEscape).join(','));
  rows.push(['Called', report.metrics.calledKrw].map(csvEscape).join(','));
  rows.push(['Distributed', report.metrics.distributedKrw].map(csvEscape).join(','));
  rows.push(
    ['Remaining Commitment', report.metrics.remainingCommitmentKrw].map(csvEscape).join(',')
  );
  rows.push(
    ['IRR (%)', report.metrics.irrPct == null ? '' : report.metrics.irrPct].map(csvEscape).join(',')
  );
  rows.push(['DPI Multiple', report.metrics.dpiMultiple].map(csvEscape).join(','));
  rows.push(['RVPI Multiple', report.metrics.rvpiMultiple].map(csvEscape).join(','));
  rows.push(['TVPI Multiple', report.metrics.tvpiMultiple].map(csvEscape).join(','));
  rows.push(['Asset Count', report.metrics.assetCount].map(csvEscape).join(','));
  rows.push('');
  rows.push(['Section', 'Content'].map(csvEscape).join(','));
  for (const section of report.sections) {
    rows.push([section.title, section.content.replace(/\n/g, ' | ')].map(csvEscape).join(','));
  }
  return rows.join('\r\n');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function serializeInvestorReportToHtml(report: InvestorReportBundle) {
  const metricRows = [
    ['NAV', formatKrwBillions(report.metrics.navKrw)],
    ['Committed', formatKrwBillions(report.metrics.committedKrw)],
    ['Called', formatKrwBillions(report.metrics.calledKrw)],
    ['Distributed', formatKrwBillions(report.metrics.distributedKrw)],
    ['Remaining', formatKrwBillions(report.metrics.remainingCommitmentKrw)],
    ['IRR', report.metrics.irrPct == null ? 'n/a' : `${report.metrics.irrPct.toFixed(1)}%`],
    ['DPI', `${report.metrics.dpiMultiple}x`],
    ['RVPI', `${report.metrics.rvpiMultiple}x`],
    ['TVPI', `${report.metrics.tvpiMultiple}x`],
    ['Assets', String(report.metrics.assetCount)]
  ]
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    )
    .join('\n');

  const sectionsHtml = report.sections
    .map((section) => {
      const paragraphs = section.content
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('\n');
      return `<section class="report-section"><h2>${escapeHtml(section.title)}</h2>${paragraphs}</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(report.reportTitle)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1f2b;
    background: #ffffff;
    font-size: 11pt;
    line-height: 1.55;
    padding: 32px;
  }
  header.report-header {
    border-bottom: 2px solid #1a1f2b;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  header.report-header h1 {
    font-size: 22pt;
    margin: 0 0 8px 0;
    letter-spacing: -0.01em;
  }
  header.report-header .meta {
    color: #4a5365;
    font-size: 10pt;
  }
  header.report-header .meta span { margin-right: 18px; }
  h2 {
    font-size: 14pt;
    margin: 24px 0 8px 0;
    color: #1a1f2b;
    border-bottom: 1px solid #d5dae3;
    padding-bottom: 4px;
  }
  table.metrics {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 24px 0;
  }
  table.metrics th, table.metrics td {
    border: 1px solid #d5dae3;
    padding: 8px 12px;
    text-align: left;
    font-size: 10.5pt;
  }
  table.metrics th {
    background: #f5f6fa;
    width: 40%;
    font-weight: 600;
  }
  .report-section p { margin: 6px 0; }
  footer.report-footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #d5dae3;
    color: #6b7280;
    font-size: 9pt;
    font-style: italic;
  }
  @media print {
    body { padding: 0; }
    h2 { page-break-after: avoid; }
    .report-section { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <header class="report-header">
    <h1>${escapeHtml(report.reportTitle)}</h1>
    <div class="meta">
      <span><strong>Fund:</strong> ${escapeHtml(report.fundName)}</span>
      ${report.vehicleName ? `<span><strong>Vehicle:</strong> ${escapeHtml(report.vehicleName)}</span>` : ''}
      <span><strong>Period:</strong> ${escapeHtml(report.reportingPeriod)}</span>
      <span><strong>Generated:</strong> ${escapeHtml(report.generatedAt)}</span>
    </div>
  </header>

  <section>
    <h2>Key Metrics</h2>
    <table class="metrics">
      <tbody>
${metricRows}
      </tbody>
    </table>
  </section>

  ${sectionsHtml}

  <footer class="report-footer">
    Report generated by Investment Firm OS on ${escapeHtml(report.generatedAt)}.
  </footer>
</body>
</html>`;
}
