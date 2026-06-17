/**
 * RTMS (국토교통부 실거래가) live adapter for non-residential commercial property
 * transactions (상업업무용 부동산).
 *
 * Endpoint: https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade
 * Docs:    https://www.data.go.kr/data/15058038/openapi.do
 *
 * Required env:
 *   RTMS_SERVICE_KEY — obtained from 공공데이터포털 (data.go.kr) after free registration.
 *     Submit the registration for 국토교통부_상업업무용 부동산 매매 실거래가 자료 API.
 *     Use the **Decoding** form of the 일반 인증키 (URLSearchParams encodes it once).
 *
 * Query shape:
 *   LAWD_CD  = 5-digit 시군구 code (e.g., Gangnam-gu = 11680)
 *   DEAL_YMD = YYYYMM of the deal month
 *
 * The API returns XML with English camelCase item fields (dealAmount, dealYear,
 * buildingAr, plottageAr, …). We do a minimal regex parse (no new npm dependency —
 * the response schema is flat and well-documented).
 *
 * Missing key → the adapter returns []. This lets the mock path continue working
 * while still allowing the live path to be enabled simply by setting the env var.
 */

import type { TransactionComp, TransactionCompsConnector } from '@/lib/services/public-data/types';

const RTMS_ENDPOINT = 'https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade';

export class LiveRtmsTransactionComps implements TransactionCompsConnector {
  constructor(
    private readonly apiKey: string | undefined = process.env.RTMS_SERVICE_KEY,
    // data.go.kr RTMS responses can be slow on a cold call; 8s was too tight
    // (requests aborted before the body arrived). 20s gives comfortable margin.
    private readonly timeoutMs: number = 20000
  ) {}

  async fetch(params: {
    lawdCode: string;
    fromYyyyMm: string;
    toYyyyMm: string;
  }): Promise<TransactionComp[]> {
    if (!this.apiKey) {
      return [];
    }
    const months = enumerateMonths(params.fromYyyyMm, params.toYyyyMm);
    const results: TransactionComp[] = [];
    for (const ym of months) {
      const batch = await this.fetchMonth(params.lawdCode, ym).catch((err) => {
        console.warn(`[rtms] month ${ym} failed:`, err.message);
        return [];
      });
      results.push(...batch);
    }
    return results;
  }

  private async fetchMonth(lawdCode: string, yyyyMm: string): Promise<TransactionComp[]> {
    // Paginate the whole month. A busy 시군구 (e.g. Gangnam) can have >100 deals
    // in a month; fetching only page 1 silently truncated the comp set and biased
    // the sales-comparison approach. Drive pagination off the response totalCount.
    const numOfRows = 1000;
    const maxPages = 20; // safety cap (20k deals/month is far beyond reality)
    const all: TransactionComp[] = [];
    let totalCount = Number.POSITIVE_INFINITY;

    for (let pageNo = 1; pageNo <= maxPages && (pageNo - 1) * numOfRows < totalCount; pageNo += 1) {
      const xml = await this.fetchPage(lawdCode, yyyyMm, pageNo, numOfRows);
      if (totalCount === Number.POSITIVE_INFINITY) {
        totalCount = extractTotalCount(xml) ?? 0;
      }
      all.push(...parseRtmsXml(xml, lawdCode));
    }
    return all;
  }

  private async fetchPage(
    lawdCode: string,
    yyyyMm: string,
    pageNo: number,
    numOfRows: number
  ): Promise<string> {
    const url = new URL(RTMS_ENDPOINT);
    url.searchParams.set('serviceKey', this.apiKey!);
    url.searchParams.set('LAWD_CD', lawdCode);
    url.searchParams.set('DEAL_YMD', yyyyMm);
    url.searchParams.set('numOfRows', String(numOfRows));
    url.searchParams.set('pageNo', String(pageNo));
    url.searchParams.set('_type', 'xml');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`RTMS HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Extract `<totalCount>N</totalCount>` from an RTMS response body, or null. */
export function extractTotalCount(xml: string): number | null {
  const m = /<totalCount>\s*(\d+)\s*<\/totalCount>/.exec(xml);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// XML parsing (flat schema — item elements inside <items>)
// ---------------------------------------------------------------------------

export function parseRtmsXml(xml: string, lawdCode: string): TransactionComp[] {
  const items: TransactionComp[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    // New apis.data.go.kr schema uses English camelCase fields. Keep the legacy
    // Korean tag names as fallbacks for resilience.
    const deal = readField(block, 'dealAmount') ?? readField(block, '거래금액');
    if (!deal) continue;
    const dealManWon = parseManWon(deal);
    const year = readField(block, 'dealYear') ?? readField(block, '년');
    const month = readField(block, 'dealMonth') ?? readField(block, '월');
    const day = readField(block, 'dealDay') ?? readField(block, '일');
    // A comp with no contract date is unusable downstream (sorting / windowing)
    // and would otherwise serialize as "null-01-01" — skip it rather than emit a
    // malformed `transactionDate`.
    if (!year) continue;
    const gfa = readField(block, 'buildingAr') ?? readField(block, '건물면적');
    const landArea = readField(block, 'plottageAr') ?? readField(block, '대지면적');
    const buildingUse = readField(block, 'buildingUse') ?? readField(block, '유형');
    const buildYear = readField(block, 'buildYear') ?? readField(block, '건축년도');
    const floor = readField(block, 'floor') ?? readField(block, '층');
    // The commercial (Nrg) schema has no building-name field; only the legacy
    // Korean payload carried 건물명.
    const name = readField(block, '건물명');

    const gfaSqm = gfa ? Number(gfa) : null;
    const pricePerSqm = gfaSqm && gfaSqm > 0 ? Math.round((dealManWon * 10_000) / gfaSqm) : null;

    items.push({
      source: `RTMS ${year ?? '?'}-${month ?? '?'}`,
      lawdCode,
      transactionDate: `${year}-${pad2(month)}-${pad2(day)}`,
      buildingName: name || null,
      gfaSqm,
      landAreaSqm: landArea ? Number(landArea) : null,
      dealAmountManWon: dealManWon,
      pricePerSqmKrw: pricePerSqm,
      buildingUse: buildingUse || null,
      floor: floor ? Number(floor) : null,
      buildYear: buildYear ? Number(buildYear) : null
    });
  }
  return items;
}

function readField(block: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`);
  const m = re.exec(block);
  return m ? m[1]!.trim() : null;
}

function parseManWon(raw: string): number {
  return Number(raw.replace(/,/g, '').trim()) || 0;
}

function pad2(v: string | null): string {
  if (!v) return '01';
  const n = Number(v);
  return n < 10 ? `0${n}` : String(n);
}

export function enumerateMonths(fromYyyyMm: string, toYyyyMm: string): string[] {
  const out: string[] = [];
  const fromY = Number(fromYyyyMm.slice(0, 4));
  const fromM = Number(fromYyyyMm.slice(4, 6));
  const toY = Number(toYyyyMm.slice(0, 4));
  const toM = Number(toYyyyMm.slice(4, 6));
  let y = fromY;
  let m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    out.push(`${y}${m.toString().padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
