export function buildFirmActionCenter({
  reviewCount,
  dealReminderCount,
  lowOriginationCoverageDeals,
  processProtectionGapDeals,
  relationshipCoverageGapDeals,
  staleSourceCount,
  portfolioWatchCount,
  initiativeBacklog,
  fundReportingBacklog,
  readyReportCount,
  capitalCallCount,
  committeeActionItems
}: {
  reviewCount: number;
  dealReminderCount: number;
  lowOriginationCoverageDeals: number;
  processProtectionGapDeals: number;
  relationshipCoverageGapDeals: number;
  staleSourceCount: number;
  portfolioWatchCount: number;
  initiativeBacklog: number;
  fundReportingBacklog: number;
  readyReportCount: number;
  capitalCallCount: number;
  committeeActionItems: Array<{
    key: string;
    area: string;
    title: string;
    detail: string;
    href: string;
    priority: 'critical' | 'high' | 'medium';
    dueLabel?: string;
  }>;
}) {
  const items = [
    ...(reviewCount > 0
      ? [
          {
            key: 'review-queue',
            area: 'REVIEW',
            title: `${reviewCount} normalized evidence item(s) are still pending review`,
            detail:
              'Approve or reject pending technical, legal, and lease evidence before downstream valuation and committee use.',
            href: '/admin/review',
            priority: 'critical' as const
          }
        ]
      : []),
    ...(dealReminderCount > 0
      ? [
          {
            key: 'deal-reminders',
            area: 'DEALS',
            title: `${dealReminderCount} deal(s) need an immediate execution action`,
            detail:
              'Clear missing next actions, overdue workstreams, and stale DD items before the close path slips.',
            href: '/admin/deals',
            priority: 'critical' as const
          }
        ]
      : []),
    ...(lowOriginationCoverageDeals > 0
      ? [
          {
            key: 'deal-origination-coverage',
            area: 'ORIGINATION',
            title: `${lowOriginationCoverageDeals} pursuit(s) still have thin origination coverage`,
            detail:
              'Tighten source tagging, relationship ownership, and market touchpoints before the process enters deeper bid or IC work.',
            href: '/admin/deals',
            priority: 'high' as const
          }
        ]
      : []),
    ...(processProtectionGapDeals > 0
      ? [
          {
            key: 'deal-exclusivity-gap',
            area: 'ORIGINATION',
            title: `${processProtectionGapDeals} LOI-or-deeper pursuit(s) have no live exclusivity`,
            detail:
              'Push process protection or re-underwrite competitive risk before diligence and committee time compounds into a weak process position.',
            href: '/admin/deals',
            priority: 'high' as const
          }
        ]
      : []),
    ...(relationshipCoverageGapDeals > 0
      ? [
          {
            key: 'deal-coverage-gap',
            area: 'ORIGINATION',
            title: `${relationshipCoverageGapDeals} pursuit(s) need relationship ownership or fresh touchpoints`,
            detail:
              'Assign a primary counterparty owner and log current contact activity so pursuit quality is not dependent on ad hoc notes.',
            href: '/admin/deals',
            priority: 'medium' as const
          }
        ]
      : []),
    ...(staleSourceCount > 0
      ? [
          {
            key: 'research-ops',
            area: 'RESEARCH',
            title: `${staleSourceCount} source-system issue(s) need research operations follow-up`,
            detail:
              'Resolve stale or failed source runs before the shared research fabric drifts out of date.',
            href: '/admin/sources',
            priority: 'high' as const
          }
        ]
      : []),
    ...(portfolioWatchCount > 0
      ? [
          {
            key: 'portfolio-watch',
            area: 'PORTFOLIO',
            title: `${portfolioWatchCount} held-asset watch item(s) are active`,
            detail:
              'Refinance, covenant, rollover, or capex exceptions are surfacing in the hold set.',
            href: '/admin/portfolio',
            priority: 'high' as const
          }
        ]
      : []),
    ...(initiativeBacklog > 0
      ? [
          {
            key: 'portfolio-initiatives',
            area: 'PORTFOLIO',
            title: `${initiativeBacklog} asset-management initiative(s) remain open across the hold set`,
            detail:
              'Advance blocked leasing, refinance, capex, and disposition initiatives before KPI drift leaks into committee and LP reporting.',
            href: '/admin/portfolio',
            priority: 'high' as const
          }
        ]
      : []),
    ...(fundReportingBacklog > 0 || capitalCallCount > 0
      ? [
          {
            key: 'fund-reporting',
            area: 'FUNDS',
            title: `${fundReportingBacklog} controlled investor report item(s), ${readyReportCount} release-ready package(s), and ${capitalCallCount} near-term capital call(s) are open`,
            detail:
              'Clear release workflow items and call logistics before LP communication windows tighten.',
            href: '/admin/funds',
            priority: 'medium' as const
          }
        ]
      : []),
    ...committeeActionItems
  ];

  const priorityRank = {
    critical: 3,
    high: 2,
    medium: 1
  };

  return items
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority])
    .slice(0, 8);
}
