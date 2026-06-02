import { makeStabilizedStrategy } from '@/lib/services/valuation/strategies/build-stabilized-strategy';
import {
  buildRetailValuationConfig,
  retailDdChecklistBase,
  retailProvenanceConfig,
  retailRiskConfig
} from '@/lib/services/valuation/stabilized-income-configs';

export const buildRetailValuationAnalysis = makeStabilizedStrategy({
  assetClassLabel: 'RETAIL',
  valuationConfig: buildRetailValuationConfig,
  riskConfig: retailRiskConfig,
  provenanceConfig: retailProvenanceConfig,
  ddChecklistBase: retailDdChecklistBase
});
