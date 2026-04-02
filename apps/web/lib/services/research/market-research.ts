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
};

export function buildMarketResearchSummary(asset: MarketResearchAsset): MarketResearchSummary {
  const playbook = getAssetClassPlaybook(asset.assetClass);
  const region = asset.marketSnapshot?.metroRegion ?? 'core market';
  const transactionCount = asset.transactionComps?.length ?? 0;
  const rentCount = asset.rentComps?.length ?? 0;
  const pipelineCount = asset.pipelineProjects?.length ?? 0;
  const latestIndicators = (asset.marketIndicatorSeries ?? []).slice(0, 4).map((indicator) => ({
    label: indicator.label ?? indicator.indicatorKey.replaceAll('_', ' '),
    value: indicator.value == null ? 'N/A' : formatNumber(indicator.value, 1),
    detail: formatDate(indicator.observationDate)
  }));

  const thesisParts = [
    `${region} ${playbook.label.toLowerCase()} research currently has ${transactionCount} transaction comp(s) and ${rentCount} rent comp(s).`
  ];
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
