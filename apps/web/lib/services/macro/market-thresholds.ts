// ---------------------------------------------------------------------------
// Market-specific factor threshold profiles
// ---------------------------------------------------------------------------
// Each market has different "normal" ranges for macro factors.
// Korean rates are structurally lower than US; credit spreads differ; etc.
// These thresholds replace the hardcoded globals in factors.ts.

export type FactorThresholdBand = {
  negativeAbove: number;
  positiveBelow: number;
};

export type MarketFactorThresholds = {
  market: string;
  label: string;
  inflation: FactorThresholdBand;
  rateLevel: FactorThresholdBand;
  rateMomentumBps: FactorThresholdBand;
  creditSpreadBps: FactorThresholdBand;
  liquidity: FactorThresholdBand;
  rentGrowth: FactorThresholdBand;
  constructionPressure: FactorThresholdBand;
  propertyDemand: FactorThresholdBand;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const KR_THRESHOLDS: MarketFactorThresholds = {
  market: 'KR',
  label: 'Korea',
  inflation:            { negativeAbove: 3.0,  positiveBelow: 2.0 },
  rateLevel:            { negativeAbove: 4.0,  positiveBelow: 2.5 },
  rateMomentumBps:      { negativeAbove: 15,   positiveBelow: -15 },
  creditSpreadBps:      { negativeAbove: 180,  positiveBelow: 120 },
  liquidity:            { negativeAbove: 0,     positiveBelow: 0 },   // special: below threshold = negative
  rentGrowth:           { negativeAbove: 0,     positiveBelow: 0 },   // special: below threshold = negative
  constructionPressure: { negativeAbove: 20,   positiveBelow: 8 },
  propertyDemand:       { negativeAbove: 0,     positiveBelow: 0 },   // special: below threshold = negative
};

const US_THRESHOLDS: MarketFactorThresholds = {
  market: 'US',
  label: 'United States',
  inflation:            { negativeAbove: 3.5,  positiveBelow: 2.3 },
  rateLevel:            { negativeAbove: 6.0,  positiveBelow: 4.5 },
  rateMomentumBps:      { negativeAbove: 25,   positiveBelow: -25 },
  creditSpreadBps:      { negativeAbove: 220,  positiveBelow: 150 },
  liquidity:            { negativeAbove: 0,     positiveBelow: 0 },
  rentGrowth:           { negativeAbove: 0,     positiveBelow: 0 },
  constructionPressure: { negativeAbove: 25,   positiveBelow: 10 },
  propertyDemand:       { negativeAbove: 0,     positiveBelow: 0 },
};

const JP_THRESHOLDS: MarketFactorThresholds = {
  market: 'JP',
  label: 'Japan',
  inflation:            { negativeAbove: 2.5,  positiveBelow: 1.5 },
  rateLevel:            { negativeAbove: 2.0,  positiveBelow: 0.75 },
  rateMomentumBps:      { negativeAbove: 10,   positiveBelow: -10 },
  creditSpreadBps:      { negativeAbove: 150,  positiveBelow: 90 },
  liquidity:            { negativeAbove: 0,     positiveBelow: 0 },
  rentGrowth:           { negativeAbove: 0,     positiveBelow: 0 },
  constructionPressure: { negativeAbove: 18,   positiveBelow: 7 },
  propertyDemand:       { negativeAbove: 0,     positiveBelow: 0 },
};

// Fallback matches prior hardcoded thresholds
const GLOBAL_THRESHOLDS: MarketFactorThresholds = US_THRESHOLDS;

const THRESHOLD_REGISTRY: Record<string, MarketFactorThresholds> = {
  KR: KR_THRESHOLDS,
  US: US_THRESHOLDS,
  JP: JP_THRESHOLDS,
};

export function getMarketFactorThresholds(market: string): MarketFactorThresholds {
  return THRESHOLD_REGISTRY[market.toUpperCase()] ?? GLOBAL_THRESHOLDS;
}

// ---------------------------------------------------------------------------
// Special threshold factors (inverted logic)
// ---------------------------------------------------------------------------
// Some factors use "below X = NEGATIVE" instead of "above X = NEGATIVE":
// - liquidity:        below 85 = NEGATIVE, above 105 = POSITIVE
// - rentGrowth:       below 1 = NEGATIVE, above 2.5 = POSITIVE
// - propertyDemand:   below -10 = NEGATIVE, above 8 = POSITIVE
//
// For these, negativeAbove/positiveBelow are set to 0 in the registry
// and the actual thresholds are defined here as market-specific overrides.

export type InvertedThresholdBand = {
  negativeBelow: number;
  positiveAbove: number;
};

export type MarketInvertedThresholds = {
  liquidity: InvertedThresholdBand;
  rentGrowth: InvertedThresholdBand;
  propertyDemand: InvertedThresholdBand;
};

const KR_INVERTED: MarketInvertedThresholds = {
  liquidity:      { negativeBelow: 80,   positiveAbove: 100 },
  rentGrowth:     { negativeBelow: 0.5,  positiveAbove: 2.0 },
  propertyDemand: { negativeBelow: -8,   positiveAbove: 6 },
};

const US_INVERTED: MarketInvertedThresholds = {
  liquidity:      { negativeBelow: 85,   positiveAbove: 105 },
  rentGrowth:     { negativeBelow: 1.0,  positiveAbove: 2.5 },
  propertyDemand: { negativeBelow: -10,  positiveAbove: 8 },
};

const JP_INVERTED: MarketInvertedThresholds = {
  liquidity:      { negativeBelow: 80,   positiveAbove: 100 },
  rentGrowth:     { negativeBelow: 0.3,  positiveAbove: 1.5 },
  propertyDemand: { negativeBelow: -8,   positiveAbove: 5 },
};

const GLOBAL_INVERTED: MarketInvertedThresholds = US_INVERTED;

const INVERTED_REGISTRY: Record<string, MarketInvertedThresholds> = {
  KR: KR_INVERTED,
  US: US_INVERTED,
  JP: JP_INVERTED,
};

export function getMarketInvertedThresholds(market: string): MarketInvertedThresholds {
  return INVERTED_REGISTRY[market.toUpperCase()] ?? GLOBAL_INVERTED;
}
