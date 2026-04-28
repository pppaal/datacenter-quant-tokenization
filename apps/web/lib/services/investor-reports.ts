import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

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
    assetCount: number;
  };
  exportFileBase: string;
};

function formatKrwBillions(value: number) {
  return `₩${(value / 1_000_000_000).toFixed(1)}B`;
}

function computeMultiple(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(2)) : 0;
}

export async function buildInvestorReport(
  fundId: string,
  options: { periodLabel?: string } = {},
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
      capitalCalls: true,
      distributions: true,
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
  const navKrw = calledKrw - distributedKrw;
  const dpiMultiple = computeMultiple(distributedKrw, calledKrw);
  const tvpiMultiple = computeMultiple(navKrw + distributedKrw, calledKrw);

  const portfolioAssets = fund.portfolio?.assets ?? [];
  const assetCount = portfolioAssets.length;

  const sections: InvestorReportSection[] = [
    {
      title: 'Fund Overview',
      content: `${fund.name} is a ${fund.strategy ?? 'diversified real-estate'} fund with ${formatKrwBillions(committedKrw)} in total commitments across ${fund.vehicles.length} vehicle(s). As of ${reportDate}, the fund holds ${assetCount} portfolio asset(s).`
    },
    {
      title: 'Capital Activity',
      content: [
        `Total committed: ${formatKrwBillions(committedKrw)}`,
        `Capital called: ${formatKrwBillions(calledKrw)} (${committedKrw > 0 ? ((calledKrw / committedKrw) * 100).toFixed(1) : 0}% drawn)`,
        `Distributions to date: ${formatKrwBillions(distributedKrw)}`,
        `Remaining commitment: ${formatKrwBillions(remainingCommitmentKrw)}`,
        `DPI: ${dpiMultiple}x / TVPI: ${tvpiMultiple}x`
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

  return {
    reportTitle: `${fund.name} — Investor Report — ${periodLabel}`,
    fundName: fund.name,
    vehicleName: fund.vehicles[0]?.name ?? null,
    reportDate,
    reportingPeriod: periodLabel,
    generatedAt: new Date().toISOString(),
    sections,
    metrics: {
      navKrw,
      committedKrw,
      calledKrw,
      distributedKrw,
      remainingCommitmentKrw,
      dpiMultiple,
      tvpiMultiple,
      assetCount
    },
    exportFileBase: `investor-report-${fund.name.toLowerCase().replace(/\s+/g, '-')}-${reportDate}`
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
    `| DPI | ${report.metrics.dpiMultiple}x |`,
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
  rows.push(['DPI Multiple', report.metrics.dpiMultiple].map(csvEscape).join(','));
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
    ['DPI', `${report.metrics.dpiMultiple}x`],
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
