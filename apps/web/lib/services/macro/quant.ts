import { AssetClass, type MacroFactor } from '@prisma/client';
import { macroSensitivityTemplateRegistry } from '@/lib/services/macro/profile-registry';

export type QuantSignalStance =
  | 'RISK_ON'
  | 'RISK_OFF'
  | 'NEUTRAL'
  | 'LONG_DURATION'
  | 'SHORT_DURATION'
  | 'OVERWEIGHT'
  | 'UNDERWEIGHT';

export type QuantSignal = {
  key: 'risk' | 'duration' | 'credit' | 'realAssets';
  label: string;
  stance: QuantSignalStance;
  score: number;
  commentary: string;
  drivers: string[];
};

export type QuantMarketSignal = {
  market: string;
  asOf: string | null;
  signals: QuantSignal[];
};

export type QuantAllocationView = {
  market: string;
  asOf: string | null;
  score: number;
  stance: 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT';
  commentary: string;
  strongestSignals: string[];
};

export type QuantAssetClassAllocationView = {
  market: string;
  assetClass: 'OFFICE' | 'INDUSTRIAL' | 'RETAIL' | 'MULTIFAMILY' | 'DATA_CENTER';
  asOf: string | null;
  score: number;
  stance: 'OVERWEIGHT' | 'NEUTRAL' | 'UNDERWEIGHT';
  commentary: string;
  strongestSignals: string[];
};

type QuantAssetClassProfile = {
  assetClass: QuantAssetClassAllocationView['assetClass'];
  capital: number;
  credit: number;
  duration: number;
  realAssets: number;
  label: string;
};

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function getDirectionWeight(direction: string) {
  if (direction === 'POSITIVE') return 1;
  if (direction === 'NEGATIVE') return -1;
  return 0;
}

function buildLatestFactorMap(factors: MacroFactor[]) {
  const latestByMarket = new Map<string, Map<string, MacroFactor>>();

  for (const factor of [...factors].sort(
    (left, right) => right.observationDate.getTime() - left.observationDate.getTime()
  )) {
    const marketMap = latestByMarket.get(factor.market) ?? new Map<string, MacroFactor>();
    if (!marketMap.has(factor.factorKey)) {
      marketMap.set(factor.factorKey, factor);
    }
    latestByMarket.set(factor.market, marketMap);
  }

  return latestByMarket;
}

function getFactor(marketFactors: Map<string, MacroFactor>, factorKey: string) {
  return marketFactors.get(factorKey) ?? null;
}

function driversOf(...items: Array<string | null>) {
  return items.filter((item): item is string => Boolean(item));
}

function buildRiskSignal(marketFactors: Map<string, MacroFactor>): QuantSignal {
  const liquidity = getFactor(marketFactors, 'liquidity');
  const growth = getFactor(marketFactors, 'growth_momentum');
  const credit = getFactor(marketFactors, 'credit_stress');
  const rateMomentum = getFactor(marketFactors, 'rate_momentum_bps');

  const score =
    getDirectionWeight(liquidity?.direction ?? 'NEUTRAL') * 1.2 +
    getDirectionWeight(growth?.direction ?? 'NEUTRAL') * 1 +
    getDirectionWeight(credit?.direction ?? 'NEUTRAL') * 1.1 +
    getDirectionWeight(rateMomentum?.direction ?? 'NEUTRAL') * 0.8;

  return {
    key: 'risk',
    label: 'Risk Regime',
    stance: score >= 1 ? 'RISK_ON' : score <= -1 ? 'RISK_OFF' : 'NEUTRAL',
    score: round(score),
    commentary:
      score >= 1
        ? 'Liquidity and growth factors support a risk-on posture.'
        : score <= -1
          ? 'Credit and rate factors lean toward a risk-off posture.'
          : 'Macro factors are mixed, so overall risk posture stays neutral.',
    drivers: driversOf(
      liquidity
        ? `Liquidity ${liquidity.direction.toLowerCase()} (${round(liquidity.value)})`
        : null,
      growth ? `Growth ${growth.direction.toLowerCase()} (${round(growth.value)})` : null,
      credit ? `Credit ${credit.direction.toLowerCase()} (${round(credit.value)})` : null,
      rateMomentum
        ? `Rate momentum ${rateMomentum.direction.toLowerCase()} (${round(rateMomentum.value)} bps)`
        : null
    )
  };
}

function buildDurationSignal(marketFactors: Map<string, MacroFactor>): QuantSignal {
  const rateLevel = getFactor(marketFactors, 'rate_level');
  const rateMomentum = getFactor(marketFactors, 'rate_momentum_bps');
  const inflation = getFactor(marketFactors, 'inflation_trend');

  const score =
    getDirectionWeight(rateLevel?.direction ?? 'NEUTRAL') * 1.1 +
    getDirectionWeight(rateMomentum?.direction ?? 'NEUTRAL') * 1 +
    getDirectionWeight(inflation?.direction ?? 'NEUTRAL') * 0.8;

  return {
    key: 'duration',
    label: 'Duration Bias',
    stance: score >= 1 ? 'LONG_DURATION' : score <= -1 ? 'SHORT_DURATION' : 'NEUTRAL',
    score: round(score),
    commentary:
      score >= 1
        ? 'Rates and inflation factors support adding duration.'
        : score <= -1
          ? 'Rates and inflation factors argue for keeping duration short.'
          : 'Duration signals are mixed.',
    drivers: driversOf(
      rateLevel
        ? `Rate level ${rateLevel.direction.toLowerCase()} (${round(rateLevel.value)}%)`
        : null,
      rateMomentum
        ? `Rate momentum ${rateMomentum.direction.toLowerCase()} (${round(rateMomentum.value)} bps)`
        : null,
      inflation
        ? `Inflation ${inflation.direction.toLowerCase()} (${round(inflation.value)}%)`
        : null
    )
  };
}

function buildCreditSignal(marketFactors: Map<string, MacroFactor>): QuantSignal {
  const credit = getFactor(marketFactors, 'credit_stress');
  const liquidity = getFactor(marketFactors, 'liquidity');
  const rateLevel = getFactor(marketFactors, 'rate_level');

  const score =
    getDirectionWeight(credit?.direction ?? 'NEUTRAL') * 1.3 +
    getDirectionWeight(liquidity?.direction ?? 'NEUTRAL') * 0.9 +
    getDirectionWeight(rateLevel?.direction ?? 'NEUTRAL') * 0.7;

  return {
    key: 'credit',
    label: 'Credit Bias',
    stance: score >= 1 ? 'OVERWEIGHT' : score <= -1 ? 'UNDERWEIGHT' : 'NEUTRAL',
    score: round(score),
    commentary:
      score >= 1
        ? 'Credit conditions support adding spread exposure.'
        : score <= -1
          ? 'Credit conditions argue for reducing spread exposure.'
          : 'Credit conditions are balanced.',
    drivers: driversOf(
      credit ? `Credit ${credit.direction.toLowerCase()} (${round(credit.value)} bps)` : null,
      liquidity
        ? `Liquidity ${liquidity.direction.toLowerCase()} (${round(liquidity.value)})`
        : null,
      rateLevel
        ? `Rate level ${rateLevel.direction.toLowerCase()} (${round(rateLevel.value)}%)`
        : null
    )
  };
}

function buildRealAssetSignal(marketFactors: Map<string, MacroFactor>): QuantSignal {
  const propertyDemand = getFactor(marketFactors, 'property_demand');
  const construction = getFactor(marketFactors, 'construction_pressure');
  const inflation = getFactor(marketFactors, 'inflation_trend');

  const score =
    getDirectionWeight(propertyDemand?.direction ?? 'NEUTRAL') * 1.2 +
    getDirectionWeight(construction?.direction ?? 'NEUTRAL') * 0.7 +
    getDirectionWeight(inflation?.direction ?? 'NEUTRAL') * 0.5;

  return {
    key: 'realAssets',
    label: 'Real Asset Bias',
    stance: score >= 1 ? 'OVERWEIGHT' : score <= -1 ? 'UNDERWEIGHT' : 'NEUTRAL',
    score: round(score),
    commentary:
      score >= 1
        ? 'Property demand and inflation factors support real-asset exposure.'
        : score <= -1
          ? 'Demand and construction factors argue for a lighter real-asset stance.'
          : 'Real-asset factors are balanced.',
    drivers: driversOf(
      propertyDemand
        ? `Property demand ${propertyDemand.direction.toLowerCase()} (${round(propertyDemand.value)})`
        : null,
      construction
        ? `Construction ${construction.direction.toLowerCase()} (${round(construction.value)})`
        : null,
      inflation
        ? `Inflation ${inflation.direction.toLowerCase()} (${round(inflation.value)}%)`
        : null
    )
  };
}

export function buildQuantMarketSignals(factors: MacroFactor[]): QuantMarketSignal[] {
  const latestByMarket = buildLatestFactorMap(factors);

  return [...latestByMarket.entries()].map(([market, marketFactors]) => {
    const asOf =
      [...marketFactors.values()]
        .sort((left, right) => right.observationDate.getTime() - left.observationDate.getTime())[0]
        ?.observationDate.toISOString() ?? null;

    return {
      market,
      asOf,
      signals: [
        buildRiskSignal(marketFactors),
        buildDurationSignal(marketFactors),
        buildCreditSignal(marketFactors),
        buildRealAssetSignal(marketFactors)
      ]
    };
  });
}

function signalScore(signal: QuantSignal) {
  if (
    signal.stance === 'RISK_ON' ||
    signal.stance === 'LONG_DURATION' ||
    signal.stance === 'OVERWEIGHT'
  ) {
    return signal.score;
  }

  if (
    signal.stance === 'RISK_OFF' ||
    signal.stance === 'SHORT_DURATION' ||
    signal.stance === 'UNDERWEIGHT'
  ) {
    return -Math.abs(signal.score);
  }

  return 0;
}

export function buildQuantAllocationView(signals: QuantMarketSignal[]): QuantAllocationView[] {
  return signals.map((market) => {
    const risk = market.signals.find((signal) => signal.key === 'risk');
    const duration = market.signals.find((signal) => signal.key === 'duration');
    const credit = market.signals.find((signal) => signal.key === 'credit');
    const realAssets = market.signals.find((signal) => signal.key === 'realAssets');

    const score =
      signalScore(risk ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) * 0.35 +
      signalScore(duration ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) * 0.15 +
      signalScore(credit ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) * 0.25 +
      signalScore(realAssets ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) * 0.25;

    const strongestSignals = [...market.signals]
      .sort((left, right) => Math.abs(right.score) - Math.abs(left.score))
      .slice(0, 2)
      .map((signal) => `${signal.label}: ${signal.stance.toLowerCase().replaceAll('_', ' ')}`);

    return {
      market: market.market,
      asOf: market.asOf,
      score: round(score),
      stance: score >= 0.75 ? 'OVERWEIGHT' : score <= -0.75 ? 'UNDERWEIGHT' : 'NEUTRAL',
      commentary:
        score >= 0.75
          ? 'Macro and cross-asset signals support adding exposure to this market.'
          : score <= -0.75
            ? 'Macro and cross-asset signals argue for lighter exposure to this market.'
            : 'Signals are mixed, so market exposure should stay near benchmark.',
      strongestSignals
    };
  });
}

function getQuantAssetClassProfiles(): QuantAssetClassProfile[] {
  const assetClasses: QuantAssetClassAllocationView['assetClass'][] = [
    'OFFICE',
    'INDUSTRIAL',
    'RETAIL',
    'MULTIFAMILY',
    'DATA_CENTER'
  ];

  return assetClasses.map((assetClass) => {
    const template = macroSensitivityTemplateRegistry[assetClass as AssetClass];
    const capital = template?.capitalRateSensitivity ?? 1;
    const liquidity = template?.liquiditySensitivity ?? 1;
    const leasing = template?.leasingSensitivity ?? 1;
    const construction = template?.constructionSensitivity ?? 1;

    return {
      assetClass,
      label: template?.label ?? 'Balanced generic real-asset profile',
      capital: round(capital),
      credit: round((capital + liquidity) / 2),
      duration: round((capital + liquidity) / 2),
      realAssets: round((leasing + construction) / 2)
    };
  });
}

export function buildQuantAssetClassAllocationView(
  signals: QuantMarketSignal[]
): QuantAssetClassAllocationView[] {
  const profiles = getQuantAssetClassProfiles();

  return signals.flatMap((market) => {
    const risk = market.signals.find((signal) => signal.key === 'risk');
    const duration = market.signals.find((signal) => signal.key === 'duration');
    const credit = market.signals.find((signal) => signal.key === 'credit');
    const realAssets = market.signals.find((signal) => signal.key === 'realAssets');

    return profiles.map((profile) => {
      const score =
        signalScore(risk ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) * 0.25 +
        signalScore(duration ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) *
          0.2 *
          profile.duration +
        signalScore(credit ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) *
          0.25 *
          profile.credit +
        signalScore(realAssets ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) *
          0.3 *
          profile.realAssets +
        signalScore(risk ?? ({ score: 0, stance: 'NEUTRAL' } as QuantSignal)) *
          0.15 *
          profile.capital;

      const strongestSignals = [
        `Capital beta ${round(profile.capital)}x`,
        `Real-asset beta ${round(profile.realAssets)}x`
      ];

      return {
        market: market.market,
        assetClass: profile.assetClass,
        asOf: market.asOf,
        score: round(score),
        stance: score >= 0.9 ? 'OVERWEIGHT' : score <= -0.9 ? 'UNDERWEIGHT' : 'NEUTRAL',
        commentary:
          score >= 0.9
            ? `${profile.assetClass.replaceAll('_', ' ')} screens attractive in this market under the current macro mix. ${profile.label}.`
            : score <= -0.9
              ? `${profile.assetClass.replaceAll('_', ' ')} screens relatively unattractive in this market under the current macro mix. ${profile.label}.`
              : `${profile.assetClass.replaceAll('_', ' ')} stays close to benchmark in this market. ${profile.label}.`,
        strongestSignals
      };
    });
  });
}
