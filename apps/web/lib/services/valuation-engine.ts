import { AssetClass } from '@prisma/client';
import { listActiveMacroProfileRuntimeRules } from '@/lib/services/macro/profile-overrides';
import { buildDataCenterValuationAnalysis } from '@/lib/services/valuation/strategies/data-center';
import { buildIndustrialValuationAnalysis } from '@/lib/services/valuation/strategies/industrial';
import { buildMultifamilyValuationAnalysis } from '@/lib/services/valuation/strategies/multifamily';
import { buildOfficeValuationAnalysis } from '@/lib/services/valuation/strategies/office';
import { buildRetailValuationAnalysis } from '@/lib/services/valuation/strategies/retail';
import type {
  UnderwritingAnalysis,
  UnderwritingBundle,
  UnderwritingScenario,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';

export type {
  UnderwritingAnalysis,
  UnderwritingBundle,
  UnderwritingScenario
} from '@/lib/services/valuation/types';

type AssetClassValuationStrategy = {
  buildAnalysis(
    bundle: UnderwritingBundle,
    context?: ValuationStrategyContext
  ): Promise<UnderwritingAnalysis>;
};

const strategyRegistry: Partial<Record<AssetClass, AssetClassValuationStrategy>> = {
  [AssetClass.MULTIFAMILY]: {
    buildAnalysis: buildMultifamilyValuationAnalysis
  },
  [AssetClass.RETAIL]: {
    buildAnalysis: buildRetailValuationAnalysis
  },
  [AssetClass.INDUSTRIAL]: {
    buildAnalysis: buildIndustrialValuationAnalysis
  },
  [AssetClass.OFFICE]: {
    buildAnalysis: buildOfficeValuationAnalysis
  },
  [AssetClass.DATA_CENTER]: {
    buildAnalysis: buildDataCenterValuationAnalysis
  }
};

function getValuationStrategy(assetClass: AssetClass): AssetClassValuationStrategy {
  const strategy = strategyRegistry[assetClass];
  if (!strategy) {
    throw new Error(`No valuation strategy registered for assetClass=${assetClass}`);
  }

  return strategy;
}

async function loadMacroProfileRuntimeRules() {
  try {
    return await listActiveMacroProfileRuntimeRules();
  } catch {
    return undefined;
  }
}

export async function buildValuationAnalysis(
  bundle: UnderwritingBundle
): Promise<UnderwritingAnalysis> {
  const profileRules = await loadMacroProfileRuntimeRules();
  return getValuationStrategy(bundle.asset.assetClass).buildAnalysis(bundle, {
    profileRules
  });
}
