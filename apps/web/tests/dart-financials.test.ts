import assert from 'node:assert/strict';
import test from 'node:test';
import { __resetEnvCache } from '@/lib/env';
import type { Fetcher } from '@/lib/sources/http';
import {
  fetchDartFinancials,
  fetchDartTenantFinancials,
  dartSnapshotToTenantFinancials
} from '@/lib/services/quarterly-report/connectors/dart-financials';
import { assessCredit } from '@/lib/services/valuation/tenant-credit';

const CORP_CODE = '00126380'; // 8-digit DART corp_code shape (삼성전자)

/** Minimal fnlttSinglAcntAll.json sample covering the accounts we map. */
const SAMPLE_FNLTT = {
  status: '000',
  message: '정상',
  list: [
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'BS',
      sj_nm: '재무상태표',
      account_id: 'ifrs-full_CurrentAssets',
      account_nm: '유동자산',
      thstrm_nm: '제56기',
      thstrm_amount: '220,000,000,000,000',
      frmtrm_amount: '210,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'BS',
      sj_nm: '재무상태표',
      account_id: 'ifrs-full_Assets',
      account_nm: '자산총계',
      thstrm_nm: '제56기',
      thstrm_amount: '500,000,000,000,000',
      frmtrm_amount: '480,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'BS',
      sj_nm: '재무상태표',
      account_id: 'ifrs-full_CurrentLiabilities',
      account_nm: '유동부채',
      thstrm_nm: '제56기',
      thstrm_amount: '80,000,000,000,000',
      frmtrm_amount: '75,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'BS',
      sj_nm: '재무상태표',
      account_id: 'ifrs-full_Liabilities',
      account_nm: '부채총계',
      thstrm_nm: '제56기',
      thstrm_amount: '120,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'BS',
      sj_nm: '재무상태표',
      account_id: 'ifrs-full_Equity',
      account_nm: '자본총계',
      thstrm_nm: '제56기',
      thstrm_amount: '380,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'BS',
      sj_nm: '재무상태표',
      account_id: 'ifrs-full_CashAndCashEquivalents',
      account_nm: '현금및현금성자산',
      thstrm_nm: '제56기',
      thstrm_amount: '90,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'BS',
      sj_nm: '재무상태표',
      account_id: 'dart_ShortTermBorrowings',
      account_nm: '단기차입금',
      thstrm_nm: '제56기',
      thstrm_amount: '15,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'BS',
      sj_nm: '재무상태표',
      account_id: 'dart_LongTermBorrowings',
      account_nm: '장기차입금',
      thstrm_nm: '제56기',
      thstrm_amount: '25,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'IS',
      sj_nm: '손익계산서',
      account_id: 'ifrs-full_Revenue',
      account_nm: '매출액',
      thstrm_nm: '제56기',
      thstrm_amount: '300,000,000,000,000',
      frmtrm_amount: '260,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'IS',
      sj_nm: '손익계산서',
      account_id: 'dart_OperatingIncomeLoss',
      account_nm: '영업이익',
      thstrm_nm: '제56기',
      thstrm_amount: '55,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'IS',
      sj_nm: '손익계산서',
      account_id: 'ifrs-full_ProfitLoss',
      account_nm: '당기순이익',
      thstrm_nm: '제56기',
      thstrm_amount: '45,000,000,000,000',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'IS',
      sj_nm: '손익계산서',
      account_id: 'ifrs-full_FinanceCosts',
      account_nm: '금융비용',
      thstrm_nm: '제56기',
      thstrm_amount: '(2,000,000,000,000)',
      currency: 'KRW'
    },
    {
      rcept_no: '20250311000001',
      bsns_year: '2024',
      corp_code: CORP_CODE,
      sj_div: 'CF',
      sj_nm: '현금흐름표',
      account_id: 'ifrs-full_CashFlowsFromUsedInOperatingActivities',
      account_nm: '영업활동현금흐름',
      thstrm_nm: '제56기',
      thstrm_amount: '70,000,000,000,000',
      currency: 'KRW'
    }
  ]
};

const SAMPLE_COMPANY = {
  status: '000',
  message: '정상',
  corp_name: '삼성전자',
  corp_code: CORP_CODE,
  stock_code: '005930',
  induty_code: '26'
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function makeFetcher(): Fetcher {
  return async (url: string) => {
    if (url.includes('fnlttSinglAcntAll')) return jsonResponse(SAMPLE_FNLTT);
    if (url.includes('company.json')) return jsonResponse(SAMPLE_COMPANY);
    throw new Error(`unexpected url ${url}`);
  };
}

function withKey<T>(fn: () => Promise<T>): Promise<T> {
  const prior = process.env.DART_API_KEY;
  process.env.DART_API_KEY = 'test-key';
  __resetEnvCache();
  return fn().finally(() => {
    if (prior === undefined) delete process.env.DART_API_KEY;
    else process.env.DART_API_KEY = prior;
    __resetEnvCache();
  });
}

test('fetchDartFinancials parses fnlttSinglAcntAll into canonical KRW fields', async () => {
  await withKey(async () => {
    const snapshot = await fetchDartFinancials(CORP_CODE, {
      bsnsYear: 2024,
      fetcher: makeFetcher()
    });

    assert.ok(snapshot, 'snapshot should be returned when key + data present');
    assert.equal(snapshot?.corpName, '삼성전자');
    assert.equal(snapshot?.isListed, true);
    assert.equal(snapshot?.fiscalYear, 2024);
    assert.equal(snapshot?.fsDiv, 'CFS');
    assert.equal(snapshot?.totalAssetsKrw, 500_000_000_000_000);
    assert.equal(snapshot?.currentAssetsKrw, 220_000_000_000_000);
    assert.equal(snapshot?.totalLiabilitiesKrw, 120_000_000_000_000);
    assert.equal(snapshot?.currentLiabilitiesKrw, 80_000_000_000_000);
    assert.equal(snapshot?.totalEquityKrw, 380_000_000_000_000);
    assert.equal(snapshot?.cashAndEquivalentsKrw, 90_000_000_000_000);
    // 단기차입금 + 장기차입금 summed.
    assert.equal(snapshot?.totalDebtKrw, 40_000_000_000_000);
    assert.equal(snapshot?.revenueKrw, 300_000_000_000_000);
    assert.equal(snapshot?.priorYearRevenueKrw, 260_000_000_000_000);
    assert.equal(snapshot?.operatingIncomeKrw, 55_000_000_000_000);
    assert.equal(snapshot?.netIncomeKrw, 45_000_000_000_000);
    // Parenthesised amount → negative magnitude parsed.
    assert.equal(snapshot?.interestExpenseKrw, -2_000_000_000_000);
    assert.equal(snapshot?.operatingCashFlowKrw, 70_000_000_000_000);
  });
});

test('fetchDartTenantFinancials feeds the credit engine and yields an investment-grade read', async () => {
  await withKey(async () => {
    const tenant = await fetchDartTenantFinancials(CORP_CODE, {
      bsnsYear: 2024,
      fetcher: makeFetcher()
    });

    assert.ok(tenant, 'tenant financials should adapt from a complete snapshot');
    // induty_code 26 (전자부품 제조) → KSIC major-band 10-34 → MANUFACTURING.
    assert.equal(tenant?.industry, 'MANUFACTURING');
    const assessment = assessCredit(tenant!);
    assert.ok(assessment.isInvestmentGrade, 'blue-chip financials should screen investment grade');
    assert.ok(assessment.numericScore > 60);
  });
});

test('fail-closed: missing DART_API_KEY returns null without calling the network', async () => {
  const prior = process.env.DART_API_KEY;
  delete process.env.DART_API_KEY;
  __resetEnvCache();
  try {
    let called = false;
    const spyFetcher: Fetcher = async () => {
      called = true;
      throw new Error('network should not be touched');
    };
    const snapshot = await fetchDartFinancials(CORP_CODE, { fetcher: spyFetcher });
    assert.equal(snapshot, null);
    assert.equal(called, false, 'no fetch should occur without a key');
  } finally {
    if (prior !== undefined) process.env.DART_API_KEY = prior;
    __resetEnvCache();
  }
});

test('fail-closed: HTTP/transport error resolves to null, never throws', async () => {
  await withKey(async () => {
    const failingFetcher: Fetcher = async () => {
      throw new Error('ETIMEDOUT');
    };
    const snapshot = await fetchDartFinancials(CORP_CODE, {
      bsnsYear: 2024,
      fetcher: failingFetcher
    });
    assert.equal(snapshot, null);
  });
});

test('fail-closed: empty DART payload (status 013) returns null', async () => {
  await withKey(async () => {
    const emptyFetcher: Fetcher = async (url: string) => {
      if (url.includes('fnlttSinglAcntAll')) {
        return jsonResponse({ status: '013', message: '조회된 데이타가 없습니다.' });
      }
      return jsonResponse(SAMPLE_COMPANY);
    };
    const snapshot = await fetchDartFinancials(CORP_CODE, {
      bsnsYear: 2024,
      fetcher: emptyFetcher
    });
    assert.equal(snapshot, null);
  });
});

test('dartSnapshotToTenantFinancials returns null when core anchors are missing', () => {
  const partial = dartSnapshotToTenantFinancials({
    corpCode: CORP_CODE,
    corpName: 'X',
    stockCode: null,
    isListed: false,
    indutyCode: null,
    fiscalYear: 2024,
    reprtCode: '11011',
    fsDiv: 'OFS',
    currency: 'KRW',
    totalAssetsKrw: null,
    totalLiabilitiesKrw: null,
    currentAssetsKrw: null,
    currentLiabilitiesKrw: null,
    cashAndEquivalentsKrw: null,
    totalDebtKrw: null,
    totalEquityKrw: null,
    revenueKrw: null,
    operatingIncomeKrw: null,
    netIncomeKrw: null,
    interestExpenseKrw: null,
    priorYearRevenueKrw: null,
    operatingCashFlowKrw: null,
    sourceManifest: {}
  });
  assert.equal(partial, null);
});
