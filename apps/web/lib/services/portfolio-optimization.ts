import { AssetClass, CovenantStatus, PortfolioAssetStatus, SourceStatus } from '@prisma/client';
import type { PortfolioRecord } from '@/lib/services/portfolio';
import { buildAssetResearchDossier } from '@/lib/services/research/dossier';

export type PortfolioOptimizationAssetRow = {
  portfolioAssetId: string;
  assetId: string;
  assetName: string;
  assetCode: string;
  assetClass: AssetClass;
  marketLabel: string;
  currentWeightPct: number;
  targetWeightPct: number;
  deltaPct: number;
  scorePct: number;
  stressPenaltyPct: number;
  recommendation: 'ADD' | 'TRIM' | 'HOLD';
  reasons: string[];
  researchFreshnessStatus: SourceStatus;
  pendingBlockerCount: number;
  openCoverageTaskCount: number;
};

export type PortfolioScenarioExplorationRow = {
  label: string;
  capRateShockBps: number;
  occupancyShockPct: number;
  debtSpreadShockBps: number;
  weightedValueImpactPct: number;
  weightedDscrImpactPct: number;
  weightedStressScore: number;
  leadAssetName: string | null;
  commentary: string;
};

export type PortfolioOptimizationLab = {
  methodologyLabel: string;
  objectiveScorePct: number;
  summary: string;
  topMove: string;
  defensiveMove: string;
  assetRows: PortfolioOptimizationAssetRow[];
  scenarioRows: PortfolioScenarioExplorationRow[];
};

type AssetSignal = ReturnType<typeof buildAssetSignal>;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) || 1;
}

function createDeterministicRng(seedInput: string) {
  let state = hashSeed(seedInput);
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function roundWeightVector(weights: number[]) {
  const rounded = weights.map((weight) => Math.round(weight / 5) * 5);
  const total = sum(rounded);
  if (rounded.length === 0) return rounded;
  rounded[0] += 100 - total;
  return rounded;
}

function normalizeWeightVector(weights: number[]) {
  const total = sum(weights);
  if (total <= 0) {
    return weights.map(() => 0);
  }
  return weights.map((weight) => (weight / total) * 100);
}

function getAssetClassBetas(assetClass: AssetClass) {
  switch (assetClass) {
    case AssetClass.DATA_CENTER:
      return { capRate: 1.2, leasing: 0.7, debt: 1.15 };
    case AssetClass.OFFICE:
      return { capRate: 1, leasing: 1.1, debt: 1 };
    case AssetClass.INDUSTRIAL:
      return { capRate: 0.9, leasing: 0.85, debt: 0.95 };
    case AssetClass.LAND:
      return { capRate: 1.3, leasing: 0.4, debt: 1.2 };
    default:
      return { capRate: 1, leasing: 0.9, debt: 1 };
  }
}

function buildAssetSignal(input: PortfolioRecord['assets'][number]) {
  const latest = input.monthlyKpis[0] ?? null;
  const leaseRoll = input.leaseRollSnapshots[0] ?? null;
  const dossier = buildAssetResearchDossier(input.asset);
  const occupancyPct = latest?.occupancyPct ?? 85;
  const dscr = latest?.debtServiceCoverage ?? 1.2;
  const ltvPct = latest?.ltvPct ?? 58;
  const passingRent = latest?.passingRentKrwPerSqmMonth ?? 0;
  const marketRent = latest?.marketRentKrwPerSqmMonth ?? passingRent;
  const rentGapPct = marketRent > 0 ? ((marketRent - passingRent) / marketRent) * 100 : 0;
  const blockerCount = dossier.pendingBlockers.length;
  const openTaskCount = dossier.coverage.openTaskCount;
  const breachCount = input.covenantTests.filter(
    (test) => test.status === CovenantStatus.BREACH
  ).length;
  const watchCount = input.covenantTests.filter(
    (test) => test.status === CovenantStatus.WATCH
  ).length;
  const rolloverPct = leaseRoll?.next12MonthsExpiringPct ?? 0;

  const freshnessBoost =
    dossier.freshness.status === SourceStatus.FRESH
      ? 10
      : dossier.freshness.status === SourceStatus.STALE
        ? 4
        : -2;

  const rawScore =
    35 +
    occupancyPct * 0.25 +
    clamp((dscr - 1) * 24, -8, 18) +
    clamp((62 - ltvPct) * 0.4, -10, 12) +
    clamp(rentGapPct * 0.35, -6, 8) +
    freshnessBoost -
    rolloverPct * 0.18 -
    blockerCount * 5 -
    openTaskCount * 2.5 -
    breachCount * 10 -
    watchCount * 4;

  const scorePct = clamp(rawScore, 15, 95);
  const stressPenaltyPct = clamp(
    rolloverPct * 0.25 +
      Math.max(0, 60 - dscr * 40) +
      Math.max(0, ltvPct - 55) * 0.55 +
      blockerCount * 6,
    5,
    45
  );

  const reasons: string[] = [];
  if (rentGapPct > 3) reasons.push(`Market rent is ${rentGapPct.toFixed(1)}% above passing rent.`);
  if (occupancyPct >= 90) reasons.push(`Occupancy is holding at ${occupancyPct.toFixed(1)}%.`);
  if (dscr >= 1.35) reasons.push(`Debt cover is ${dscr.toFixed(2)}x.`);
  if (rolloverPct >= 20) reasons.push(`${rolloverPct.toFixed(1)}% rolls inside 12 months.`);
  if (watchCount > 0 || breachCount > 0) {
    reasons.push(`${breachCount} breach and ${watchCount} watch covenant tests are open.`);
  }
  if (blockerCount > 0)
    reasons.push(
      `${blockerCount} approved-evidence blocker${blockerCount === 1 ? '' : 's'} remain.`
    );
  if (openTaskCount > 0)
    reasons.push(
      `${openTaskCount} research coverage task${openTaskCount === 1 ? '' : 's'} remain open.`
    );
  if (dossier.market.officialHighlights[0]) {
    reasons.push(
      `${dossier.market.officialHighlights[0].label} ${dossier.market.officialHighlights[0].value} anchors the current market signal.`
    );
  }
  if (reasons.length === 0)
    reasons.push('Current operating and research signals are broadly stable.');

  return {
    scorePct,
    stressPenaltyPct,
    reasons: reasons.slice(0, 3),
    dossier,
    latest,
    leaseRoll
  };
}

function buildInitialWeights(portfolio: PortfolioRecord) {
  const rawWeights = portfolio.assets.map(
    (asset) => asset.currentHoldValueKrw ?? asset.acquisitionCostKrw ?? 0
  );
  const normalized = normalizeWeightVector(rawWeights);
  if (normalized.some((weight) => weight > 0)) {
    return roundWeightVector(normalized);
  }
  return roundWeightVector(portfolio.assets.map(() => 100 / Math.max(1, portfolio.assets.length)));
}

function buildObjective(
  weights: number[],
  signals: Array<{ scorePct: number; stressPenaltyPct: number }>
) {
  const weightedSignal = sum(
    weights.map(
      (weight, index) =>
        (weight / 100) * (signals[index].scorePct - signals[index].stressPenaltyPct * 0.45)
    )
  );
  const hhiPenalty = sum(weights.map((weight) => Math.pow(weight / 100, 2))) * 25;
  return weightedSignal - hhiPenalty;
}

function runAnnealingAllocation(
  currentWeights: number[],
  signals: Array<{ scorePct: number; stressPenaltyPct: number }>,
  seedKey: string
) {
  if (currentWeights.length <= 1) {
    return currentWeights.map(() => 100);
  }

  const rng = createDeterministicRng(seedKey);
  let bestWeights = [...currentWeights];
  let bestObjective = buildObjective(bestWeights, signals);
  let candidateWeights = [...currentWeights];
  let candidateObjective = bestObjective;

  for (let iteration = 0; iteration < 240; iteration += 1) {
    const fromIndex = Math.floor(rng() * candidateWeights.length);
    let toIndex = Math.floor(rng() * candidateWeights.length);
    if (toIndex === fromIndex) {
      toIndex = (toIndex + 1) % candidateWeights.length;
    }

    const mutated = [...candidateWeights];
    const minWeight = 10;
    const maxWeight = 70;
    if (mutated[fromIndex] - 5 < minWeight || mutated[toIndex] + 5 > maxWeight) {
      continue;
    }

    mutated[fromIndex] -= 5;
    mutated[toIndex] += 5;
    const objective = buildObjective(mutated, signals);
    const temperature = Math.max(0.05, 1 - iteration / 240);
    const accept =
      objective >= candidateObjective ||
      rng() < Math.exp((objective - candidateObjective) / Math.max(0.05, temperature * 8));

    if (accept) {
      candidateWeights = mutated;
      candidateObjective = objective;
      if (objective > bestObjective) {
        bestWeights = mutated;
        bestObjective = objective;
      }
    }
  }

  return bestWeights;
}

function buildScenarioRows(
  portfolio: PortfolioRecord,
  allocationRows: PortfolioOptimizationAssetRow[],
  signalsByAssetId: Map<string, AssetSignal>
) {
  const namedScenarios = [
    {
      label: 'Base Operating Case',
      capRateShockBps: 0,
      occupancyShockPct: 0,
      debtSpreadShockBps: 0
    },
    { label: 'Leasing Stress', capRateShockBps: 25, occupancyShockPct: -6, debtSpreadShockBps: 25 },
    {
      label: 'Refinancing Stress',
      capRateShockBps: 50,
      occupancyShockPct: -2,
      debtSpreadShockBps: 75
    }
  ];

  const searchedScenarios = [];
  for (const capRateShockBps of [25, 50, 75]) {
    for (const occupancyShockPct of [-3, -6, -9]) {
      for (const debtSpreadShockBps of [25, 50, 75]) {
        searchedScenarios.push({
          label: 'Worst Feasible Search',
          capRateShockBps,
          occupancyShockPct,
          debtSpreadShockBps
        });
      }
    }
  }

  const evaluateScenario = (scenario: {
    label: string;
    capRateShockBps: number;
    occupancyShockPct: number;
    debtSpreadShockBps: number;
  }) => {
    let weightedValueImpactPct = 0;
    let weightedDscrImpactPct = 0;
    let weightedStressScore = 0;
    let leadAssetName: string | null = null;
    let worstAssetImpact = Number.NEGATIVE_INFINITY;

    for (const row of allocationRows) {
      const signal = signalsByAssetId.get(row.assetId);
      const asset = portfolio.assets.find((item) => item.asset.id === row.assetId);
      if (!signal || !asset) continue;
      const betas = getAssetClassBetas(row.assetClass);
      const weight = row.targetWeightPct / 100;
      const rolloverPct = signal.leaseRoll?.next12MonthsExpiringPct ?? 0;

      const valueImpactPct =
        -(scenario.capRateShockBps / 25) * 1.4 * betas.capRate -
        Math.abs(scenario.occupancyShockPct) * 0.65 * betas.leasing -
        (scenario.debtSpreadShockBps / 25) * 0.45 * betas.debt;

      const dscrImpactPct =
        -Math.abs(scenario.occupancyShockPct) * 0.95 * betas.leasing -
        (scenario.debtSpreadShockBps / 25) * 2.4 * betas.debt -
        Math.max(0, rolloverPct - 15) * 0.08;

      const stressScore =
        Math.abs(valueImpactPct) * 0.8 +
        Math.abs(dscrImpactPct) * 0.45 +
        signal.stressPenaltyPct * 0.25;

      weightedValueImpactPct += valueImpactPct * weight;
      weightedDscrImpactPct += dscrImpactPct * weight;
      weightedStressScore += stressScore * weight;

      if (stressScore > worstAssetImpact) {
        worstAssetImpact = stressScore;
        leadAssetName = asset.asset.name;
      }
    }

    return {
      ...scenario,
      weightedValueImpactPct,
      weightedDscrImpactPct,
      weightedStressScore,
      leadAssetName,
      commentary:
        weightedStressScore >= 18
          ? `${leadAssetName ?? 'The portfolio'} becomes the main downside driver under this stress combination.`
          : weightedStressScore >= 12
            ? `${leadAssetName ?? 'The portfolio'} absorbs the shock, but refinancing and rollover discipline tighten.`
            : 'This scenario remains inside current operating tolerance.'
    } satisfies PortfolioScenarioExplorationRow;
  };

  const evaluatedNamed = namedScenarios.map(evaluateScenario);
  const worstFeasible = searchedScenarios
    .map(evaluateScenario)
    .sort((left, right) => right.weightedStressScore - left.weightedStressScore)[0];

  return [...evaluatedNamed, worstFeasible].filter(Boolean) as PortfolioScenarioExplorationRow[];
}

export function buildPortfolioOptimizationLab(
  portfolio: PortfolioRecord
): PortfolioOptimizationLab {
  const currentWeights = buildInitialWeights(portfolio);
  const signalRows = portfolio.assets.map((asset) => buildAssetSignal(asset));
  const signalsByAssetId = new Map(
    portfolio.assets.map((asset, index) => [asset.asset.id, signalRows[index]])
  );
  const targetWeights = runAnnealingAllocation(
    currentWeights,
    signalRows.map((signal) => ({
      scorePct: signal.scorePct,
      stressPenaltyPct: signal.stressPenaltyPct
    })),
    `${portfolio.id}:${portfolio.code}`
  );

  const assetRows = portfolio.assets.map((asset, index) => {
    const signal = signalRows[index];
    const currentWeightPct = currentWeights[index];
    const targetWeightPct = targetWeights[index];
    const deltaPct = targetWeightPct - currentWeightPct;
    const recommendation: PortfolioOptimizationAssetRow['recommendation'] =
      deltaPct >= 7.5 ? 'ADD' : deltaPct <= -7.5 ? 'TRIM' : 'HOLD';

    return {
      portfolioAssetId: asset.id,
      assetId: asset.asset.id,
      assetName: asset.asset.name,
      assetCode: asset.asset.assetCode,
      assetClass: asset.asset.assetClass,
      marketLabel: asset.asset.address?.city ?? asset.asset.market,
      currentWeightPct,
      targetWeightPct,
      deltaPct,
      scorePct: signal.scorePct,
      stressPenaltyPct: signal.stressPenaltyPct,
      recommendation,
      reasons: signal.reasons,
      researchFreshnessStatus: signal.dossier.freshness.status,
      pendingBlockerCount: signal.dossier.pendingBlockers.length,
      openCoverageTaskCount: signal.dossier.coverage.openTaskCount
    };
  });

  const objectiveScorePct = clamp(
    buildObjective(
      assetRows.map((row) => row.targetWeightPct),
      assetRows.map((row) => ({ scorePct: row.scorePct, stressPenaltyPct: row.stressPenaltyPct }))
    ),
    15,
    95
  );

  const sortedRows = [...assetRows].sort(
    (left, right) => right.deltaPct - left.deltaPct || right.scorePct - left.scorePct
  );
  const topMove = sortedRows[0]
    ? `${sortedRows[0].assetName} screens as the primary add candidate at ${sortedRows[0].targetWeightPct.toFixed(0)}% target weight.`
    : 'No reweighting candidate identified.';
  const defensiveMove = [...assetRows].sort(
    (left, right) =>
      right.stressPenaltyPct - left.stressPenaltyPct || left.deltaPct - right.deltaPct
  )[0];

  const scenarioRows = buildScenarioRows(portfolio, assetRows, signalsByAssetId);

  return {
    methodologyLabel: 'Quantum-inspired discrete search',
    objectiveScorePct,
    summary: `${portfolio.name} optimization lab reweights current holdings using a deterministic annealing-style search over income quality, leverage, rollover, covenant pressure, and research coverage. This is a classical quantum-inspired heuristic, not quantum hardware execution.`,
    topMove,
    defensiveMove: defensiveMove
      ? `${defensiveMove.assetName} is the main defensive trim candidate because stress load is ${defensiveMove.stressPenaltyPct.toFixed(0)}%.`
      : 'No defensive trim candidate identified.',
    assetRows: assetRows.sort((left, right) => right.targetWeightPct - left.targetWeightPct),
    scenarioRows
  };
}

export function buildPortfolioOptimizationWorkspaceItem(portfolio: PortfolioRecord) {
  const lab = buildPortfolioOptimizationLab(portfolio);
  return {
    portfolioId: portfolio.id,
    portfolioCode: portfolio.code,
    portfolioName: portfolio.name,
    assetCount: portfolio.assets.length,
    methodologyLabel: lab.methodologyLabel,
    objectiveScorePct: lab.objectiveScorePct,
    topMove: lab.topMove,
    defensiveMove: lab.defensiveMove,
    fragileScenario: [...lab.scenarioRows].sort(
      (left, right) => right.weightedStressScore - left.weightedStressScore
    )[0],
    addCount: lab.assetRows.filter((row) => row.recommendation === 'ADD').length,
    trimCount: lab.assetRows.filter((row) => row.recommendation === 'TRIM').length,
    blockerCount: sum(lab.assetRows.map((row) => row.pendingBlockerCount)),
    watchCount: portfolio.assets.filter(
      (asset) =>
        asset.status === PortfolioAssetStatus.WATCHLIST ||
        asset.covenantTests.some(
          (test) => test.status === CovenantStatus.WATCH || test.status === CovenantStatus.BREACH
        )
    ).length
  };
}
