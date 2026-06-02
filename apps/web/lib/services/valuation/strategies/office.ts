import { makeStabilizedStrategy } from '@/lib/services/valuation/strategies/build-stabilized-strategy';
import {
  buildOfficeAssumptionExtras,
  buildOfficeProvenanceConfig,
  buildOfficeRiskConfig,
  buildOfficeValuationConfig,
  officeDdChecklistBase
} from '@/lib/services/valuation/stabilized-income-configs';

export const buildOfficeValuationAnalysis = makeStabilizedStrategy({
  assetClassLabel: 'OFFICE',
  valuationConfig: buildOfficeValuationConfig,
  riskConfig: buildOfficeRiskConfig,
  provenanceConfig: buildOfficeProvenanceConfig,
  ddChecklistBase: officeDdChecklistBase,
  assumptionExtras: buildOfficeAssumptionExtras
});
