import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRisks,
  inferRiskCategory,
  inferRiskSeverity
} from '../lib/services/im/risk-classify';

test('inferRiskSeverity flags title/permit/dscr language as High', () => {
  assert.equal(inferRiskSeverity('Title encumbrance unresolved').severity, 'High');
  assert.equal(inferRiskSeverity('Power approval pending from KEPCO').severity, 'High');
  assert.equal(inferRiskSeverity('Year-1 DSCR below 1.10x').severity, 'High');
});

test('inferRiskSeverity flags rollover/debt language as Medium', () => {
  assert.equal(inferRiskSeverity('Significant lease rollover in Y3').severity, 'Medium');
  assert.equal(inferRiskSeverity('Refinancing risk at maturity').severity, 'Medium');
});

test('inferRiskSeverity defaults to Low', () => {
  assert.equal(inferRiskSeverity('Minor signage approval outstanding').severity, 'Low');
});

test('inferRiskCategory maps keywords to disciplines', () => {
  assert.equal(inferRiskCategory('Title deed not yet registered'), 'Legal / Title');
  assert.equal(inferRiskCategory('Grid interconnect capacity unconfirmed'), 'Permitting / Power');
  assert.equal(inferRiskCategory('Flood zone exposure at the site'), 'Environmental');
  assert.equal(inferRiskCategory('Tenant rollover concentration'), 'Market / Leasing');
  assert.equal(inferRiskCategory('Refinancing covenant headroom thin'), 'Financial / Debt');
  assert.equal(inferRiskCategory('Miscellaneous follow-up'), 'General');
});

test('classifyRisks sorts High → Low and preserves order within a severity', () => {
  const out = classifyRisks([
    'Minor follow-up item', // Low
    'Title encumbrance', // High
    'Lease rollover risk', // Medium
    'Permit pending' // High
  ]);
  assert.deepEqual(
    out.map((r) => r.severity),
    ['High', 'High', 'Medium', 'Low']
  );
  // stable within High: title before permit (original order)
  assert.equal(out[0].text, 'Title encumbrance');
  assert.equal(out[1].text, 'Permit pending');
});
