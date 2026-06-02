import { makeStabilizedStrategy } from '@/lib/services/valuation/strategies/build-stabilized-strategy';
import {
  buildMultifamilyValuationConfig,
  multifamilyDdChecklistBase,
  multifamilyProvenanceConfig,
  multifamilyRiskConfig
} from '@/lib/services/valuation/stabilized-income-configs';

export const buildMultifamilyValuationAnalysis = makeStabilizedStrategy({
  assetClassLabel: 'MULTIFAMILY',
  valuationConfig: buildMultifamilyValuationConfig,
  riskConfig: multifamilyRiskConfig,
  provenanceConfig: multifamilyProvenanceConfig,
  ddChecklistBase: multifamilyDdChecklistBase
});
