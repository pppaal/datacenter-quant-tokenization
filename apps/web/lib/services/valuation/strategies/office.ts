import { generateUnderwritingMemo } from '@/lib/ai/openai';
import { applyCreditOverlay } from '@/lib/services/valuation/credit-overlay';
import { pickBaseScenario } from '@/lib/services/valuation/scenario-utils';
import {
  buildOfficeAssumptionExtras,
  buildOfficeProvenanceConfig,
  buildOfficeRiskConfig,
  buildOfficeValuationConfig,
  debtDdChecklistItem,
  officeDdChecklistBase
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

export async function buildOfficeValuationAnalysis(
  bundle: UnderwritingBundle,
  context: ValuationStrategyContext = {}
): Promise<UnderwritingAnalysis> {
  const valuation = buildStabilizedIncomeValuation(bundle, context, buildOfficeValuationConfig());
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
    keyRisks: buildStabilizedIncomeKeyRisks(bundle, valuation, buildOfficeRiskConfig(bundle)),
    ddChecklist: buildStabilizedIncomeDdChecklist(officeDdChecklistBase, debtDdChecklistItem),
    assumptions: buildStabilizedIncomeAssumptions(
      'OFFICE',
      valuation,
      bundle.comparableSet?.entries.length ?? 0,
      buildOfficeAssumptionExtras(bundle, valuation)
    ),
    provenance: buildStabilizedIncomeProvenance(
      bundle,
      valuation,
      buildOfficeProvenanceConfig(bundle, valuation)
    ),
    scenarios: valuation.scenarios
  };

  const finalized = applyCreditOverlay(analysis, bundle);
  finalized.underwritingMemo = await generateUnderwritingMemo(finalized);

  return finalized;
}
