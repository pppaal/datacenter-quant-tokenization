import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMacroImpactHistory } from '@/lib/services/macro/history';

test('macro impact history derives recent transmission series from valuation runs', () => {
  const history = buildMacroImpactHistory([
    {
      id: 'run_1',
      runLabel: 'March base',
      createdAt: new Date('2026-03-01T00:00:00Z'),
      assumptions: {
        macroRegime: {
          impacts: {
            dimensions: [
              { key: 'pricing', score: -0.8, direction: 'HEADWIND' },
              { key: 'leasing', score: -0.2, direction: 'NEUTRAL' },
              { key: 'financing', score: -1.1, direction: 'HEADWIND' },
              { key: 'construction', score: -0.4, direction: 'HEADWIND' },
              { key: 'refinancing', score: -0.9, direction: 'HEADWIND' },
              { key: 'allocation', score: 0.2, direction: 'NEUTRAL' }
            ]
          }
        }
      }
    },
    {
      id: 'run_2',
      runLabel: 'March refresh',
      createdAt: new Date('2026-03-15T00:00:00Z'),
      assumptions: {
        macroRegime: {
          impacts: {
            dimensions: [
              { key: 'pricing', score: -0.4, direction: 'HEADWIND' },
              { key: 'leasing', score: 0.1, direction: 'NEUTRAL' },
              { key: 'financing', score: -0.6, direction: 'HEADWIND' },
              { key: 'construction', score: -0.2, direction: 'NEUTRAL' },
              { key: 'refinancing', score: -0.5, direction: 'HEADWIND' },
              { key: 'allocation', score: 0.5, direction: 'TAILWIND' }
            ]
          }
        }
      }
    }
  ]);

  assert.equal(history.points.length, 2);
  const pricing = history.series.find((series) => series.key === 'pricing');
  assert.ok(pricing);
  assert.equal(pricing.latestScore, -0.4);
  assert.equal(pricing.deltaVsPrevious, 0.4);
  const allocation = history.series.find((series) => series.key === 'allocation');
  assert.ok(allocation);
  assert.equal(allocation.latestDirection, 'TAILWIND');
});
