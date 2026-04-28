import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetClass } from '@prisma/client';
import { getAssetClassPlaybook } from '@/lib/asset-class/playbook';
import { selectValuationVariableFamilies } from '@/lib/services/valuation/variable-selection';

test('asset class playbook exposes office-native labels and variable families', () => {
  const playbook = getAssetClassPlaybook(AssetClass.OFFICE);

  assert.equal(playbook.label, 'Office');
  assert.equal(playbook.sizeLabel, 'Rentable Area');
  assert.ok(playbook.checklistLabels.commercial.includes('Leasing'));
  assert.ok(
    selectValuationVariableFamilies(AssetClass.OFFICE).some((item) => item.includes('WALE'))
  );
});

test('industrial playbook scaffolds logistics-oriented focus points', () => {
  const playbook = getAssetClassPlaybook(AssetClass.INDUSTRIAL);

  assert.ok(playbook.operatorFocusPoints.some((item) => item.includes('access')));
  assert.ok(playbook.valuationVariableFamilies.some((item) => item.includes('physical fit')));
});
