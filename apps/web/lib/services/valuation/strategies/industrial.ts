import { makeStabilizedStrategy } from '@/lib/services/valuation/strategies/build-stabilized-strategy';
import {
  buildIndustrialValuationConfig,
  industrialDdChecklistBase,
  industrialProvenanceConfig,
  industrialRiskConfig
} from '@/lib/services/valuation/stabilized-income-configs';

export const buildIndustrialValuationAnalysis = makeStabilizedStrategy({
  assetClassLabel: 'INDUSTRIAL',
  valuationConfig: buildIndustrialValuationConfig,
  riskConfig: industrialRiskConfig,
  provenanceConfig: industrialProvenanceConfig,
  ddChecklistBase: industrialDdChecklistBase
});
