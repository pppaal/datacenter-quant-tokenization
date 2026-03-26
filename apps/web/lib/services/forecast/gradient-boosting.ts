import { AssetClass, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { pickBaseDscr } from '@/lib/services/valuation/scenario-utils';

type ScenarioLike = {
  name: string;
  debtServiceCoverage?: number | null;
};

type ForecastRunLike = {
  id: string;
  assetId: string;
  createdAt: Date;
  baseCaseValueKrw: number;
  confidenceScore: number;
  assumptions: unknown;
  asset: {
    id: string;
    market: string;
    assetClass: AssetClass;
    name?: string;
  };
  scenarios: ScenarioLike[];
};

type FeatureVector = {
  occupancyPct: number;
  capRatePct: number;
  discountRatePct: number;
  debtCostPct: number;
  confidenceScore: number;
  pricingScore: number;
  leasingScore: number;
  financingScore: number;
  refinancingScore: number;
  allocationScore: number;
  office: number;
  industrial: number;
  retail: number;
  multifamily: number;
  dataCenter: number;
};

type TrainingSample = {
  features: FeatureVector;
  targetValueChangePct: number;
  targetDscrChangePct: number;
};

type DecisionStump = {
  featureKey: keyof FeatureVector;
  threshold: number;
  leftValue: number;
  rightValue: number;
};

type BoostedStumpModel = {
  basePrediction: number;
  learningRate: number;
  estimators: DecisionStump[];
};

export type GradientBoostingForecast = {
  status: 'READY' | 'DATA_GAP';
  sampleCount: number;
  assetCoverage: number;
  forecastHorizonMonths: number;
  predictedValueChangePct: number | null;
  predictedDscrChangePct: number | null;
  predictedValueKrw: number | null;
  predictedDscr: number | null;
  topDrivers: Array<{
    featureKey: string;
    label: string;
    contribution: number;
  }>;
  commentary: string;
};

const FEATURE_LABELS: Record<keyof FeatureVector, string> = {
  occupancyPct: 'Occupancy',
  capRatePct: 'Exit Cap Rate',
  discountRatePct: 'Discount Rate',
  debtCostPct: 'Debt Cost',
  confidenceScore: 'Confidence',
  pricingScore: 'Pricing Impact',
  leasingScore: 'Leasing Impact',
  financingScore: 'Financing Impact',
  refinancingScore: 'Refinancing Impact',
  allocationScore: 'Allocation Impact',
  office: 'Office',
  industrial: 'Industrial',
  retail: 'Retail',
  multifamily: 'Multifamily',
  dataCenter: 'Data Center'
};

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getMetric(assumptions: unknown, key: string) {
  if (!isRecord(assumptions)) return null;
  const root = toNumber(assumptions[key]);
  if (root !== null) return root;
  const metrics = isRecord(assumptions.metrics) ? assumptions.metrics : null;
  return metrics ? toNumber(metrics[key]) : null;
}

function getMacroImpactScore(assumptions: unknown, key: string) {
  if (!isRecord(assumptions)) return 0;
  const macroRegime = isRecord(assumptions.macroRegime) ? assumptions.macroRegime : null;
  const impacts = macroRegime && isRecord(macroRegime.impacts) ? macroRegime.impacts : null;
  const dimensions = Array.isArray(impacts?.dimensions) ? impacts?.dimensions : [];
  const point = dimensions.find((dimension) => isRecord(dimension) && dimension.key === key);
  return point && isRecord(point) ? toNumber(point.score) ?? 0 : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function buildFeatureVector(run: ForecastRunLike): FeatureVector {
  return {
    occupancyPct: getMetric(run.assumptions, 'occupancyPct') ?? 90,
    capRatePct: getMetric(run.assumptions, 'capRatePct') ?? 6,
    discountRatePct: getMetric(run.assumptions, 'discountRatePct') ?? 8.5,
    debtCostPct: getMetric(run.assumptions, 'debtCostPct') ?? 5,
    confidenceScore: run.confidenceScore,
    pricingScore: getMacroImpactScore(run.assumptions, 'pricing'),
    leasingScore: getMacroImpactScore(run.assumptions, 'leasing'),
    financingScore: getMacroImpactScore(run.assumptions, 'financing'),
    refinancingScore: getMacroImpactScore(run.assumptions, 'refinancing'),
    allocationScore: getMacroImpactScore(run.assumptions, 'allocation'),
    office: run.asset.assetClass === AssetClass.OFFICE ? 1 : 0,
    industrial: run.asset.assetClass === AssetClass.INDUSTRIAL ? 1 : 0,
    retail: run.asset.assetClass === AssetClass.RETAIL ? 1 : 0,
    multifamily: run.asset.assetClass === AssetClass.MULTIFAMILY ? 1 : 0,
    dataCenter: run.asset.assetClass === AssetClass.DATA_CENTER ? 1 : 0
  };
}

function getBaseDscr(run: ForecastRunLike) {
  return pickBaseDscr(run.scenarios) ?? 1;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumSquaredError(actual: number[], predicted: number[]) {
  return actual.reduce((sum, value, index) => sum + (value - (predicted[index] ?? 0)) ** 2, 0);
}

function applyStump(sample: FeatureVector, stump: DecisionStump) {
  return sample[stump.featureKey] <= stump.threshold ? stump.leftValue : stump.rightValue;
}

function trainDecisionStump(samples: FeatureVector[], residuals: number[]): DecisionStump | null {
  const featureKeys = Object.keys(samples[0] ?? {}) as Array<keyof FeatureVector>;
  let best: { stump: DecisionStump; error: number } | null = null;

  for (const featureKey of featureKeys) {
    const thresholds = [...new Set(samples.map((sample) => sample[featureKey]).filter(Number.isFinite))].sort(
      (left, right) => left - right
    );
    for (const threshold of thresholds) {
      const leftResiduals = residuals.filter((_, index) => samples[index][featureKey] <= threshold);
      const rightResiduals = residuals.filter((_, index) => samples[index][featureKey] > threshold);
      if (leftResiduals.length === 0 || rightResiduals.length === 0) continue;

      const stump: DecisionStump = {
        featureKey,
        threshold,
        leftValue: mean(leftResiduals),
        rightValue: mean(rightResiduals)
      };
      const predicted = samples.map((sample) => applyStump(sample, stump));
      const error = sumSquaredError(residuals, predicted);

      if (!best || error < best.error) {
        best = { stump, error };
      }
    }
  }

  return best?.stump ?? null;
}

function trainBoostedStumps(samples: FeatureVector[], targets: number[], estimatorCount = 6, learningRate = 0.35): BoostedStumpModel {
  const basePrediction = mean(targets);
  const estimators: DecisionStump[] = [];
  const runningPredictions = new Array(targets.length).fill(basePrediction);

  for (let iteration = 0; iteration < estimatorCount; iteration += 1) {
    const residuals = targets.map((target, index) => target - (runningPredictions[index] ?? 0));
    const stump = trainDecisionStump(samples, residuals);
    if (!stump) break;

    estimators.push(stump);
    for (let index = 0; index < samples.length; index += 1) {
      runningPredictions[index] += learningRate * applyStump(samples[index], stump);
    }
  }

  return {
    basePrediction,
    learningRate,
    estimators
  };
}

function predictWithModel(model: BoostedStumpModel, sample: FeatureVector) {
  return model.estimators.reduce(
    (prediction, stump) => prediction + model.learningRate * applyStump(sample, stump),
    model.basePrediction
  );
}

function summarizeDrivers(model: BoostedStumpModel, sample: FeatureVector) {
  const contributions = new Map<keyof FeatureVector, number>();

  for (const stump of model.estimators) {
    const effect = model.learningRate * applyStump(sample, stump);
    contributions.set(stump.featureKey, (contributions.get(stump.featureKey) ?? 0) + effect);
  }

  return [...contributions.entries()]
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 4)
    .map(([featureKey, contribution]) => ({
      featureKey,
      label: FEATURE_LABELS[featureKey],
      contribution: round(contribution)
    }));
}

export function buildGradientBoostingForecast(currentRun: ForecastRunLike, runs: ForecastRunLike[]): GradientBoostingForecast {
  const byAsset = new Map<string, ForecastRunLike[]>();
  for (const run of runs) {
    const group = byAsset.get(run.assetId) ?? [];
    group.push(run);
    byAsset.set(run.assetId, group);
  }

  const samples: TrainingSample[] = [];
  for (const assetRuns of byAsset.values()) {
    const ordered = [...assetRuns].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];
      if (!current || !next || current.baseCaseValueKrw <= 0) continue;

      const currentDscr = getBaseDscr(current);
      const nextDscr = getBaseDscr(next);
      samples.push({
        features: buildFeatureVector(current),
        targetValueChangePct: ((next.baseCaseValueKrw - current.baseCaseValueKrw) / current.baseCaseValueKrw) * 100,
        targetDscrChangePct: ((nextDscr - currentDscr) / Math.max(currentDscr, 0.01)) * 100
      });
    }
  }

  const currentFeatures = buildFeatureVector(currentRun);
  const assetCoverage = uniqueCount(runs.map((run) => run.assetId));

  if (samples.length < 5) {
    return {
      status: 'DATA_GAP',
      sampleCount: samples.length,
      assetCoverage,
      forecastHorizonMonths: 12,
      predictedValueChangePct: null,
      predictedDscrChangePct: null,
      predictedValueKrw: null,
      predictedDscr: null,
      topDrivers: [],
      commentary: 'Not enough sequential valuation history yet to train the boosted forecast model.'
    };
  }

  const valueModel = trainBoostedStumps(
    samples.map((sample) => sample.features),
    samples.map((sample) => sample.targetValueChangePct)
  );
  const dscrModel = trainBoostedStumps(
    samples.map((sample) => sample.features),
    samples.map((sample) => sample.targetDscrChangePct)
  );

  const predictedValueChangePct = clamp(predictWithModel(valueModel, currentFeatures), -25, 25);
  const predictedDscrChangePct = clamp(predictWithModel(dscrModel, currentFeatures), -20, 20);
  const baseDscr = getBaseDscr(currentRun);
  const topDrivers = summarizeDrivers(valueModel, currentFeatures);

  return {
    status: 'READY',
    sampleCount: samples.length,
    assetCoverage,
    forecastHorizonMonths: 12,
    predictedValueChangePct: round(predictedValueChangePct),
    predictedDscrChangePct: round(predictedDscrChangePct),
    predictedValueKrw: round(currentRun.baseCaseValueKrw * (1 + predictedValueChangePct / 100)),
    predictedDscr: round(baseDscr * (1 + predictedDscrChangePct / 100)),
    topDrivers,
    commentary:
      predictedValueChangePct >= 0
        ? 'Boosted-tree forecast leans constructive on the next 12-month valuation path under the current feature set.'
        : 'Boosted-tree forecast leans defensive on the next 12-month valuation path under the current feature set.'
  };
}

function uniqueCount(values: string[]) {
  return new Set(values).size;
}

export async function getGradientBoostingForecastForRun(
  currentRunId: string,
  db: PrismaClient = prisma
): Promise<GradientBoostingForecast | null> {
  const [currentRun, runs] = await Promise.all([
    db.valuationRun.findUnique({
      where: { id: currentRunId },
      select: {
        id: true,
        assetId: true,
        createdAt: true,
        baseCaseValueKrw: true,
        confidenceScore: true,
        assumptions: true,
        asset: {
          select: {
            id: true,
            market: true,
            assetClass: true,
            name: true
          }
        },
        scenarios: {
          select: {
            name: true,
            debtServiceCoverage: true
          },
          orderBy: {
            scenarioOrder: 'asc'
          }
        }
      }
    }),
    db.valuationRun.findMany({
      select: {
        id: true,
        assetId: true,
        createdAt: true,
        baseCaseValueKrw: true,
        confidenceScore: true,
        assumptions: true,
        asset: {
          select: {
            id: true,
            market: true,
            assetClass: true
          }
        },
        scenarios: {
          select: {
            name: true,
            debtServiceCoverage: true
          },
          orderBy: {
            scenarioOrder: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 240
    })
  ]);

  if (!currentRun) return null;
  return buildGradientBoostingForecast(currentRun, runs);
}
