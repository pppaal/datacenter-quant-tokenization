/**
 * RTMS (국토교통부 실거래가) live adapter for non-residential commercial property
 * transactions (상업업무용 부동산).
 *
 * Endpoint: http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcNrgTrade
 * Docs:    https://www.data.go.kr/data/15058038/openapi.do
 *
 * Required env:
 *   RTMS_SERVICE_KEY — obtained from 공공데이터포털 (data.go.kr) after free registration.
 *     Submit the registration for 국토교통부_상업업무용 부동산 매매 신고 자료 API.
 *
 * Query shape:
 *   LAWD_CD  = 5-digit 시군구 code (e.g., Gangnam-gu = 11680)
 *   DEAL_YMD = YYYYMM of the deal month
 *
 * The API returns XML. We do a minimal regex parse (no new npm dependency — the
 * response schema is flat and well-documented). For production use we can swap
 * to a proper XML parser if needed.
 *
 * Missing key → the adapter returns []. This lets the mock path continue working
 * while still allowing the live path to be enabled simply by setting the env var.
 */

import type { TransactionComp, TransactionCompsConnector } from '@/lib/services/public-data/types';

const RTMS_ENDPOINT =
  'http://openapi.molit.go.kr:8081/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcNrgTrade';

export class LiveRtmsTransactionComps implements TransactionCompsConnector {
  constructor(
    private readonly apiKey: string | undefined = process.env.RTMS_SERVICE_KEY,
    private readonly timeoutMs: number = 8000
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
    const url = new URL(RTMS_ENDPOINT);
    url.searchParams.set('serviceKey', this.apiKey!);
    url.searchParams.set('LAWD_CD', lawdCode);
    url.searchParams.set('DEAL_YMD', yyyyMm);
    url.searchParams.set('numOfRows', '100');
    url.searchParams.set('pageNo', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`RTMS HTTP ${response.status}`);
      }
      const xml = await response.text();
      return parseRtmsXml(xml, lawdCode);
    } finally {
      clearTimeout(timeout);
    }
  }
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
    const deal = readField(block, '거래금액');
    if (!deal) continue;
    const dealManWon = parseManWon(deal);
    const year = readField(block, '년');
    const month = readField(block, '월');
    const day = readField(block, '일');
    const gfa = readField(block, '건물면적');
    const landArea = readField(block, '대지면적');
    const buildingUse = readField(block, '유형');
    const buildYear = readField(block, '건축년도');
    const floor = readField(block, '층');
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
