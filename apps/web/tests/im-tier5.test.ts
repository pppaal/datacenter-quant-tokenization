import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCapitalCallSchedule } from '@/lib/services/im/capital-calls';
import { buildCovenantAlerts } from '@/lib/services/im/covenant';

// ---- Capital call schedule ----

test('buildCapitalCallSchedule emits 3 calls when reserve top-up positive', () => {
  const sch = buildCapitalCallSchedule(
    [
      { year: 1, reserveContributionKrw: 1_000_000_000, afterTaxDistributionKrw: 0 },
      { year: 2, reserveContributionKrw: 800_000_000, afterTaxDistributionKrw: 0 },
      { year: 3, reserveContributionKrw: 600_000_000, afterTaxDistributionKrw: 0 }
    ],
    { initialEquityCommitmentKrw: 100_000_000_000, baseYear: 2026 }
  );
  assert.ok(sch);
  assert.equal(sch!.rows.length, 3);
  // First call ~ 60B (60%); cumulative 60%
  assert.ok(Math.abs(sch!.rows[0]!.amountKrw - 60_000_000_000) < 1);
  assert.ok(Math.abs(sch!.upfrontPctOfCommitment - 60) < 0.01);
  // Reserve top-up call sums year 1-3 reserve contributions
  assert.equal(sch!.rows[2]!.amountKrw, 2_400_000_000);
  assert.ok(sch!.estimatedFinalCallYear?.startsWith('2028'));
});

test('buildCapitalCallSchedule returns null when no proforma or zero commitment', () => {
  assert.equal(
    buildCapitalCallSchedule([], { initialEquityCommitmentKrw: 0, baseYear: 2026 }),
    null
  );
});

// ---- Covenant alerts ----

test('buildCovenantAlerts emits critical for current breach', () => {
  const alerts = buildCovenantAlerts([
    {
      ratioKey: 'leverage',
      ratioLabel: 'Leverage',
      benchmark: 4.0,
      preferred: 'lower',
      currentValue: 4.5,
      headroomPct: -12.5,
      firstBreachYear: 'now',
      worstValue: 4.5,
      worstYear: '2026A'
    }
  ]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]!.severity, 'critical');
  assert.match(alerts[0]!.message, /currently breaches/);
});

test('buildCovenantAlerts emits warning for projected breach', () => {
  const alerts = buildCovenantAlerts([
    {
      ratioKey: 'leverage',
      ratioLabel: 'Leverage',
      benchmark: 4.0,
      preferred: 'lower',
      currentValue: 3.6,
      headroomPct: 10,
      firstBreachYear: '2030E',
      worstValue: 4.4,
      worstYear: '2030E'
    }
  ]);
  assert.equal(alerts[0]!.severity, 'warning');
  assert.match(alerts[0]!.message, /projected to breach/);
});

test('buildCovenantAlerts emits watch for thin headroom', () => {
  const alerts = buildCovenantAlerts([
    {
      ratioKey: 'interestCoverage',
      ratioLabel: 'Interest coverage',
      benchmark: 2.0,
      preferred: 'higher',
      currentValue: 2.1,
      headroomPct: 5,
      firstBreachYear: null,
      worstValue: 2.1,
      worstYear: '2026A'
    }
  ]);
  assert.equal(alerts[0]!.severity, 'watch');
});

test('buildCovenantAlerts emits nothing when headroom is healthy', () => {
  const alerts = buildCovenantAlerts([
    {
      ratioKey: 'leverage',
      ratioLabel: 'Leverage',
      benchmark: 4.0,
      preferred: 'lower',
      currentValue: 3.0,
      headroomPct: 25,
      firstBreachYear: null,
      worstValue: 3.0,
      worstYear: '2026A'
    }
  ]);
  assert.equal(alerts.length, 0);
});
