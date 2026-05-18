import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import { pickBaseScenario } from '@/lib/services/valuation/scenario-utils';
import {
  buildMultifamilyValuationConfig,
  debtDdChecklistItem,
  multifamilyDdChecklistBase,
  multifamilyProvenanceConfig,
  multifamilyRiskConfig
} from '@/lib/services/valuation/stabilized-income-configs';
import {
  buildStabilizedIncomeAssumptions,
  buildStabilizedIncomeDdChecklist,
  buildStabilizedIncomeKeyRisks,
  buildStabilizedIncomeProvenance,
  buildStabilizedIncomeValuation
} from '@/lib/services/valuation/stabilized-income';
import type {
  UnderwritingAnalysis,
  UnderwritingBundle,
  ValuationStrategyContext
} from '@/lib/services/valuation/types';

export async function buildMultifamilyValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const valuation = buildStabilizedIncomeValuation(
    bundle,
    context,
    buildMultifamilyValuationConfig()
  );
  const baseScenario = pickBaseScenario(valuation.scenarios) ?? valuation.scenarios[0];

  const analysis: UnderwritingAnalysis = {
    asset: {
      name: bundle.asset.name,
      assetCode: bundle.asset.assetCode,
      assetClass: bundle.asset.assetClass,
      stage: bundle.asset.stage,
      market: bundle.asset.market
    },
    baseCaseValueKrw: baseScenario.valuationKrw,
    confidenceScore: valuation.confidenceScore,
    underwritingMemo: '',
    keyRisks: buildStabilizedIncomeKeyRisks(bundle, valuation, multifamilyRiskConfig),
    ddChecklist: buildStabilizedIncomeDdChecklist(multifamilyDdChecklistBase, debtDdChecklistItem),
    assumptions: buildStabilizedIncomeAssumptions(
      'MULTIFAMILY',
      valuation,
      bundle.comparableSet?.entries.length ?? 0
    ),
    provenance: buildStabilizedIncomeProvenance(bundle, valuation, multifamilyProvenanceConfig),
    scenarios: valuation.scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
