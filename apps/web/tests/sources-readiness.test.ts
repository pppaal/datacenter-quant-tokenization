import assert from 'node:assert/strict';
import test from 'node:test';
import { listFreeMacroSourceCatalog, listMacroConnectorReadiness } from '@/lib/services/sources';

test('macro connector readiness marks connectors configured, partial, and missing', () => {
  const rows = listMacroConnectorReadiness({
    KOREA_MACRO_API_URL: 'https://macro.example.com/feed',
    US_FRED_API_KEY: 'fred-key',
    US_FRED_POLICY_RATE_SERIES_ID: 'FEDFUNDS',
    KOREA_KOSIS_POLICY_RATE_ORG_ID: '101',
    KOREA_KOSIS_POLICY_RATE_TBL_ID: 'DT_1',
    KOREA_KOSIS_RENT_GROWTH_USER_STATS_ID: 'growth_1'
  } as unknown as NodeJS.ProcessEnv);

  const customApi = rows.find((row) => row.id === 'custom_macro_api');
  const fxApi = rows.find((row) => row.id === 'global_fx_api');
  const marketApi = rows.find((row) => row.id === 'global_market_api');
  const usFredPolicyRate = rows.find((row) => row.id === 'us_fred_policy_rate');
  const usFredInflation = rows.find((row) => row.id === 'us_fred_inflation');
  const usBlsInflation = rows.find((row) => row.id === 'us_bls_inflation');
  const treasuryDebtCost = rows.find((row) => row.id === 'us_treasury_debt_cost');
  const ecbInflation = rows.find((row) => row.id === 'ecb_inflation');
  const policyRate = rows.find((row) => row.id === 'kosis_policy_rate');
  const creditSpread = rows.find((row) => row.id === 'kosis_credit_spread');
  const rentGrowth = rows.find((row) => row.id === 'kosis_rent_growth');

  assert.equal(customApi?.status, 'CONFIGURED');
  assert.equal(fxApi?.status, 'MISSING');
  assert.equal(marketApi?.status, 'MISSING');
  assert.equal(usFredPolicyRate?.status, 'CONFIGURED');
  assert.equal(usFredInflation?.status, 'PARTIAL');
  assert.equal(usBlsInflation?.status, 'MISSING');
  assert.equal(treasuryDebtCost?.status, 'MISSING');
  assert.equal(ecbInflation?.status, 'MISSING');
  assert.equal(policyRate?.status, 'PARTIAL');
  assert.equal(creditSpread?.status, 'MISSING');
  assert.equal(rentGrowth?.status, 'CONFIGURED');
});

test('free macro source catalog makes cadence reality explicit', () => {
  const rows = listFreeMacroSourceCatalog();

  const fred = rows.find((row) => row.id === 'fred');
  const treasury = rows.find((row) => row.id === 'treasury_fiscal_data');
  const ecb = rows.find((row) => row.id === 'ecb_data_portal');
  const worldBank = rows.find((row) => row.id === 'world_bank');

  assert.ok(fred);
  assert.equal(fred.realtimeClass, 'RELEASE_BASED');
  assert.equal(fred.auth, 'api_key');

  assert.ok(treasury);
  assert.equal(treasury.realtimeClass, 'NEAR_REALTIME');
  assert.equal(treasury.auth, 'none');

  assert.ok(ecb);
  assert.equal(ecb.realtimeClass, 'NEAR_REALTIME');

  assert.ok(worldBank);
  assert.equal(worldBank.realtimeClass, 'LOW_FREQUENCY');
});
