/**
 * Mock transaction comps — returns deterministic synthetic sale data keyed off
 * the 법정동 code. Used when RTMS_SERVICE_KEY is not configured.
 */

import type { TransactionComp, TransactionCompsConnector } from '@/lib/services/public-data/types';

const SEED_COMPS: Record<string, Array<Omit<TransactionComp, 'lawdCode' | 'source'>>> = {
  '11680': [
    // Gangnam-gu
    {
      transactionDate: '2025-09-15',
      buildingName: '테헤란타워',
      gfaSqm: 12_000,
      landAreaSqm: 1_800,
      dealAmountManWon: 12_800_000,
      pricePerSqmKrw: 10_666_667,
      buildingUse: '업무시설',
      floor: 18,
      buildYear: 2012
    },
    {
      transactionDate: '2025-08-02',
      buildingName: '선릉센터',
      gfaSqm: 8_500,
      landAreaSqm: 1_200,
      dealAmountManWon: 9_200_000,
      pricePerSqmKrw: 10_823_529,
      buildingUse: '업무시설',
      floor: 15,
      buildYear: 2008
    },
    {
      transactionDate: '2025-06-18',
      buildingName: null,
      gfaSqm: 5_200,
      landAreaSqm: 780,
      dealAmountManWon: 5_400_000,
      pricePerSqmKrw: 10_384_615,
      buildingUse: '제2종근린생활시설',
      floor: 7,
      buildYear: 2015
    }
  ],
  '11410': [
    // Seodaemun-gu
    {
      transactionDate: '2025-10-04',
      buildingName: '신촌프라자',
      gfaSqm: 7_800,
      landAreaSqm: 1_100,
      dealAmountManWon: 5_200_000,
      pricePerSqmKrw: 6_666_667,
      buildingUse: '업무시설',
      floor: 12,
      buildYear: 2005
    },
    {
      transactionDate: '2025-07-22',
      buildingName: null,
      gfaSqm: 4_100,
      landAreaSqm: 620,
      dealAmountManWon: 2_800_000,
      pricePerSqmKrw: 6_829_268,
      buildingUse: '제2종근린생활시설',
      floor: 5,
      buildYear: 2010
    }
  ],
  '28710': [
    // Incheon 계양구
    {
      transactionDate: '2025-09-28',
      buildingName: '계양오피스',
      gfaSqm: 6_200,
      landAreaSqm: 900,
      dealAmountManWon: 2_100_000,
      pricePerSqmKrw: 3_387_097,
      buildingUse: '업무시설',
      floor: 8,
      buildYear: 2014
    }
  ]
};

export class MockTransactionComps implements TransactionCompsConnector {
  async fetch(params: {
    lawdCode: string;
    fromYyyyMm: string;
    toYyyyMm: string;
  }): Promise<TransactionComp[]> {
    const rows = SEED_COMPS[params.lawdCode];
    if (!rows) return [];
    return rows.map((r) => ({
      ...r,
      lawdCode: params.lawdCode,
      source: `mock-RTMS ${r.transactionDate.slice(0, 7)}`
    }));
  }
}
