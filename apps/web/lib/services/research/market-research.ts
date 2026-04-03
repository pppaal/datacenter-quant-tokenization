import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

type MarketResearchAsset = {
  assetClass: any;
  marketSnapshot?: {
    metroRegion?: string | null;
    capRatePct?: number | null;
    discountRatePct?: number | null;
    vacancyPct?: number | null;
    marketNotes?: string | null;
  } | null;
  transactionComps?: Array<{
    id: string;
    assetName?: string | null;
    transactionDate?: Date | null;
    pricePerSqmKrw?: number | null;
    capRatePct?: number | null;
  }>;
  rentComps?: Array<{
    id: string;
    assetName?: string | null;
    observationDate?: Date | null;
    monthlyRentPerSqmKrw?: number | null;
    occupancyPct?: number | null;
  }>;
  marketIndicatorSeries?: Array<{
    id: string;
    indicatorKey: string;
    label?: string | null;
    value: number | null;
    observationDate: Date;
  }>;
  pipelineProjects?: Array<{
    id: string;
    projectName: string;
    stageLabel?: string | null;
    expectedDeliveryDate?: Date | null;
    expectedAreaSqm?: number | null;
    expectedPowerMw?: number | null;
  }>;
};

export type MarketResearchSummary = {
  thesis: string;
  compCoverage: Array<{ label: string; value: string; detail: string }>;
  latestIndicators: Array<{ label: string; value: string; detail: string }>;
  officialHighlights: Array<{ label: string; value: string; detail: string }>;
};

function formatIndicatorValue(indicatorKey: string, value: number | null) {
  if (value == null) return 'N/A';
  if (
    indicatorKey.includes('vacancy') ||
    indicatorKey.includes('cap_rate') ||
    indicatorKey.includes('discount_rate') ||
    indicatorKey.includes('rent_growth') ||
    indicatorKey.includes('price_growth') ||
    indicatorKey.includes('developable_ratio')
  ) {
    return `${value.toFixed(1)}%`;
  }
  if (indicatorKey.includes('price_per_sqm') || indicatorKey.includes('land_price_per_sqm')) {
    return `${Math.round(value).toLocaleString()} KRW/sqm`;
  }
  if (indicatorKey.includes('count')) {
    return Math.round(value).toLocaleString();
  }
  if (indicatorKey.includes('area_sqm')) {
    return `${Math.round(value).toLocaleString()} sqm`;
  }
  return formatNumber(value, 1);
}

function scoreIndicatorForPlaybook(indicatorKey: string, playbookIndicators: string[]) {
  const normalizedKey = indicatorKey.toLowerCase();
  return playbookIndicators.reduce((score, indicator) => {
    const normalizedIndicator = indicator.toLowerCase().replaceAll(' ', '_');
    if (normalizedKey.includes(normalizedIndicator)) return score + 4;
    if (normalizedIndicator.includes('rent') && normalizedKey.includes('rent')) return score + 3;
    if (normalizedIndicator.includes('cap') && normalizedKey.includes('cap')) return score + 3;
    if (normalizedIndicator.includes('vacancy') && normalizedKey.includes('vacancy')) return score + 3;
    if (normalizedIndicator.includes('transaction') && normalizedKey.includes('transaction')) return score + 3;
    if (normalizedIndicator.includes('land') && normalizedKey.includes('land')) return score + 3;
    return score;
  }, 0);
}

export function buildOfficialMarketHighlights(asset: MarketResearchAsset) {
  const playbook = getAssetClassPlaybook(asset.assetClass);
  return [...(asset.marketIndicatorSeries ?? [])]
    .filter((indicator) => {
      const key = indicator.indicatorKey.toLowerCase();
      const assetClassKey = asset.assetClass?.toLowerCase();
      return (
        !assetClassKey ||
        key.startsWith(`${assetClassKey}.`) ||
        key.startsWith(`${assetClassKey}_`) ||
        key.startsWith('kr.')
      );
    })
    .map((indicator) => ({
      label: indicator.label ?? indicator.indicatorKey.replaceAll('.', ' ').replaceAll('_', ' '),
      value: formatIndicatorValue(indicator.indicatorKey, indicator.value),
      detail: `${formatDate(indicator.observationDate)} / ${indicator.indicatorKey}`,
      score: scoreIndicatorForPlaybook(indicator.indicatorKey, playbook.marketIndicators)
    }))
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, 4)
    .map(({ score: _score, ...rest }) => rest);
}

export function buildMarketResearchSummary(asset: MarketResearchAsset): MarketResearchSummary {
  const playbook = getAssetClassPlaybook(asset.assetClass);
  const region = asset.marketSnapshot?.metroRegion ?? 'core market';
  const transactionCount = asset.transactionComps?.length ?? 0;
  const rentCount = asset.rentComps?.length ?? 0;
  const pipelineCount = asset.pipelineProjects?.length ?? 0;
  const officialHighlights = buildOfficialMarketHighlights(asset);
  const latestIndicators = (asset.marketIndicatorSeries ?? []).slice(0, 4).map((indicator) => ({
    label: indicator.label ?? indicator.indicatorKey.replaceAll('_', ' '),
    value: formatIndicatorValue(indicator.indicatorKey, indicator.value),
    detail: formatDate(indicator.observationDate)
  }));

  const thesisParts = [
    `${region} ${playbook.label.toLowerCase()} research currently has ${transactionCount} transaction comp(s) and ${rentCount} rent comp(s).`
  ];
  if (officialHighlights.length > 0) {
    thesisParts.push(
      `Official-source highlights currently point to ${officialHighlights
        .slice(0, 2)
        .map((item) => `${item.label} at ${item.value}`)
        .join(' and ')}.`
    );
  }
  if (pipelineCount > 0) {
    thesisParts.push(`${pipelineCount} pipeline project(s) are also tracked for forward supply context.`);
  }
  if (asset.marketSnapshot?.marketNotes) {
    thesisParts.push(asset.marketSnapshot.marketNotes);
  }

  return {
    thesis: thesisParts.join(' '),
    compCoverage: [
      {
        label: 'Transaction Comp Coverage',
        value: `${transactionCount}`,
        detail:
          transactionCount > 0
            ? `Latest cap-rate benchmark ${formatPercent(asset.transactionComps?.[0]?.capRatePct ?? null)}`
            : 'No transaction evidence loaded yet'
      },
      {
        label: 'Rent Comp Coverage',
        value: `${rentCount}`,
        detail:
          rentCount > 0
            ? `Latest rent comp ${formatNumber(asset.rentComps?.[0]?.monthlyRentPerSqmKrw ?? null)} KRW/sqm/mo`
            : 'No rent evidence loaded yet'
      },
      {
        label: 'Forward Supply',
        value: `${pipelineCount}`,
        detail:
          pipelineCount > 0
            ? `${asset.pipelineProjects?.[0]?.projectName ?? 'Tracked pipeline'} / ${asset.pipelineProjects?.[0]?.stageLabel ?? 'pipeline'}`
            : 'No tracked supply projects yet'
      }
    ],
    officialHighlights,
    latestIndicators:
      latestIndicators.length > 0
        ? latestIndicators
        : [
            {
              label: 'Vacancy',
              value: formatPercent(asset.marketSnapshot?.vacancyPct ?? null),
              detail: 'Market snapshot'
            },
            {
              label: 'Cap Rate',
              value: formatPercent(asset.marketSnapshot?.capRatePct ?? null),
              detail: 'Market snapshot'
            },
            {
              label: 'Discount Rate',
              value: formatPercent(asset.marketSnapshot?.discountRatePct ?? null),
              detail: 'Market snapshot'
            }
          ]
  };
}
