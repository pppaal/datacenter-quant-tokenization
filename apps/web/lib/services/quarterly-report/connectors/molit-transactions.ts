/**
 * MOLIT 실거래가 connector — Korean Ministry of Land transaction disclosures.
 *   Register: https://www.data.go.kr → 마이페이지 → 인증키발급 (free)
 *   Apply for: 국토교통부_상업업무용 부동산 매매 신고 자료 (commercial)
 *              국토교통부_아파트매매 실거래자료 (residential apt — for context)
 *   Env: MOLIT_API_KEY
 *
 * Returns per-구(district) transaction volume + median price for the requested
 * YYYYMM month. Aggregation to quarter is done by the caller.
 */

import { XMLParser } from 'fast-xml-parser';

const COMMERCIAL_ENDPOINT =
  'https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade';

type MolitCommercialRow = {
  법정동시군구코드?: string;
  법정동명?: string;
  시군구?: string;
  건물주용도?: string;
  거래금액?: string;   // "500,000" in 만원 units
  건물면적?: string;   // sqm
  대지권면적?: string;
  년?: string;
  월?: string;
  일?: string;
};

type MolitXmlBody = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: MolitCommercialRow | MolitCommercialRow[] };
      totalCount?: string;
      numOfRows?: string;
      pageNo?: string;
    };
  };
};

export type MolitTransactionAggregate = {
  submarket: string;        // district name
  yyyymm: string;           // "202601"
  transactionCount: number;
  transactionVolumeKrw: number;
  medianPriceKrwPerSqm: number | null;
  sourceUrl: string;
  fetchedAt: string;
};

// 법정동시군구코드 prefix map — MOLIT API requires LAWD_CD (5-digit).
// We ship a small static map for the major submarkets used by the classifier;
// extending to all 구 is a matter of adding rows.
export const LAWD_CODES: Record<string, string> = {
  강남구: '11680',
  서초구: '11650',
  송파구: '11710',
  영등포구: '11560',
  중구: '11140',
  종로구: '11110',
  용산구: '11170',
  성동구: '11200',
  성남시: '41130',
  평택시: '41220',
  수원시: '41110',
  화성시: '41590',
  부산진구: '26230',
  해운대구: '26350'
};

function resolveKey(): string | null {
  return process.env.MOLIT_API_KEY?.trim() || null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export async function fetchMolitCommercialMonth(
  district: string,
  yyyymm: string
): Promise<MolitTransactionAggregate | null> {
  const key = resolveKey();
  if (!key) return null;
  const lawd = LAWD_CODES[district];
  if (!lawd) {
    throw new Error(`No LAWD_CD for district "${district}". Add it to LAWD_CODES.`);
  }

  const params = new URLSearchParams({
    serviceKey: key,
    LAWD_CD: lawd,
    DEAL_YMD: yyyymm,
    numOfRows: '500',
    pageNo: '1'
  });
  const url = `${COMMERCIAL_ENDPOINT}?${params.toString()}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`MOLIT ${district} ${yyyymm} HTTP ${res.status}`);
  }
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
  const parsed = parser.parse(xml) as MolitXmlBody;

  const header = parsed.response?.header;
  if (header?.resultCode && header.resultCode !== '000') {
    throw new Error(`MOLIT ${district} ${yyyymm} api error: ${header.resultCode} ${header.resultMsg ?? ''}`);
  }

  const rawItems = parsed.response?.body?.items?.item;
  const items: MolitCommercialRow[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  let volumeKrw = 0;
  const pricesPerSqm: number[] = [];
  for (const row of items) {
    const manwon = Number(String(row.거래금액 ?? '').replace(/,/g, '').trim());
    const areaSqm = Number(String(row.건물면적 ?? '').trim());
    if (!Number.isFinite(manwon) || manwon <= 0) continue;
    const krw = manwon * 10_000;
    volumeKrw += krw;
    if (Number.isFinite(areaSqm) && areaSqm > 0) {
      pricesPerSqm.push(krw / areaSqm);
    }
  }

  return {
    submarket: district,
    yyyymm,
    transactionCount: items.length,
    transactionVolumeKrw: volumeKrw,
    medianPriceKrwPerSqm: median(pricesPerSqm),
    sourceUrl: `MOLIT Commercial ${lawd} ${yyyymm}`,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Aggregate to a quarter (3 months). Returns null if API key unset AND no
 * observations could be assembled. Partial months fold into the running totals.
 */
export async function aggregateQuarter(
  district: string,
  quarter: string  // "2026Q1"
): Promise<MolitTransactionAggregate | null> {
  const match = /^(\d{4})Q([1-4])$/.exec(quarter);
  if (!match) throw new Error(`Invalid quarter "${quarter}" (expected YYYYQn)`);
  const year = Number(match[1]);
  const q = Number(match[2]);
  const startMonth = (q - 1) * 3 + 1;

  const monthKeys = [startMonth, startMonth + 1, startMonth + 2].map(
    (m) => `${year}${String(m).padStart(2, '0')}`
  );

  const results = await Promise.allSettled(
    monthKeys.map((m) => fetchMolitCommercialMonth(district, m))
  );

  let count = 0;
  let volume = 0;
  const prices: number[] = [];
  let any = false;

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    any = true;
    count += r.value.transactionCount;
    volume += r.value.transactionVolumeKrw;
    if (r.value.medianPriceKrwPerSqm !== null) prices.push(r.value.medianPriceKrwPerSqm);
  }

  if (!any) return null;

  return {
    submarket: district,
    yyyymm: quarter,
    transactionCount: count,
    transactionVolumeKrw: volume,
    medianPriceKrwPerSqm: median(prices),
    sourceUrl: `MOLIT Commercial aggregate ${quarter}`,
    fetchedAt: new Date().toISOString()
  };
}
