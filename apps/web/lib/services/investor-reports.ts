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
    options.periodLabel ?? `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`;

  const committedKrw = fund.commitments.reduce((sum, c) => {
    const amt = typeof c.commitmentKrw === 'number' ? c.commitmentKrw : (c.commitmentKrw as any)?.toNumber?.() ?? 0;
    return sum + amt;
  }, 0);

  const calledKrw = fund.commitments.reduce((sum, c) => {
    const amt = typeof c.calledKrw === 'number' ? c.calledKrw : (c.calledKrw as any)?.toNumber?.() ?? 0;
    return sum + amt;
  }, 0);

  const distributedKrw = fund.commitments.reduce((sum, c) => {
    const amt = typeof c.distributedKrw === 'number' ? c.distributedKrw : (c.distributedKrw as any)?.toNumber?.() ?? 0;
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
                    : (asset.purchasePriceKrw as any)?.toNumber?.() ?? 0;
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
