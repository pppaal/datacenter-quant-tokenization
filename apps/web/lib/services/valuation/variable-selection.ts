import type { AssetClass } from '@prisma/client';
import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';

export function selectValuationVariableFamilies(assetClass: AssetClass | null | undefined) {
  return getAssetClassPlaybook(assetClass).valuationVariableFamilies;
}
