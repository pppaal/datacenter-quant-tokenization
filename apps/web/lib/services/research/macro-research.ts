import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import { formatPercent } from '@/lib/utils';

type MacroResearchAsset = {
  assetClass: any;
  macroFactors?: Array<{
    factorKey: string;
    label: string;
    value: number | null;
    direction: string;
    observationDate: Date;
  }>;
  macroSeries?: Array<{
    seriesKey: string;
    label: string;
    value: number | null;
    observationDate: Date;
  }>;
  marketSnapshot?: {
    inflationPct?: number | null;
    debtCostPct?: number | null;
    capRatePct?: number | null;
    vacancyPct?: number | null;
  } | null;
};

export type MacroResearchSummary = {
  thesis: string;
  indicators: Array<{
    label: string;
    value: string;
    direction: string;
    observedAt: Date | null;
  }>;
};

export function buildMacroResearchSummary(asset: MacroResearchAsset): MacroResearchSummary {
  const playbook = getAssetClassPlaybook(asset.assetClass);
  const observedFactors = [...(asset.macroFactors ?? [])]
    .sort((left, right) => right.observationDate.getTime() - left.observationDate.getTime())
    .slice(0, 4);

  const indicators: MacroResearchSummary['indicators'] = observedFactors.map((factor) => ({
    label: factor.label,
    value: factor.value == null ? 'N/A' : Number.isFinite(factor.value) ? `${factor.value}` : 'N/A',
    direction: factor.direction,
    observedAt: factor.observationDate
  }));

  if (indicators.length === 0) {
    indicators.push(
      {
        label: 'Inflation',
        value: formatPercent(asset.marketSnapshot?.inflationPct ?? null),
        direction: 'NEUTRAL',
        observedAt: null
      },
      {
        label: 'Debt Cost',
        value: formatPercent(asset.marketSnapshot?.debtCostPct ?? null),
        direction: 'NEUTRAL',
        observedAt: null
      },
      {
        label: 'Market Vacancy',
        value: formatPercent(asset.marketSnapshot?.vacancyPct ?? null),
        direction: 'NEUTRAL',
        observedAt: null
      }
    );
  }

  const headwinds = observedFactors
    .filter((factor) => factor.direction === 'NEGATIVE')
    .map((factor) => factor.label);
  const tailwinds = observedFactors
    .filter((factor) => factor.direction === 'POSITIVE')
    .map((factor) => factor.label);

  const thesis =
    headwinds.length > 0
      ? `${playbook.marketHeadline} currently leans defensive, with pressure from ${headwinds.slice(0, 2).join(' and ')}.`
      : tailwinds.length > 0
        ? `${playbook.marketHeadline} is currently supported by ${tailwinds.slice(0, 2).join(' and ')}.`
        : `${playbook.marketHeadline} is broadly balanced based on the latest macro factor set.`;

  return {
    thesis,
    indicators
  };
}
