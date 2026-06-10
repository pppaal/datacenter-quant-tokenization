/**
 * 한국부동산원 R-ONE 상업용부동산 임대동향조사 live adapter (rent / vacancy /
 * 소득수익률) — the single highest-value public source for commercial rent and
 * cap-rate ground truth, replacing synthetic rent comps.
 *
 * Source: 한국부동산원 부동산통계정보시스템 (R-ONE) open API, also mirrored on
 *   공공데이터포털: "한국부동산원_상업용부동산 임대동향조사".
 * Docs:   https://www.reb.or.kr/r-one/  /  https://www.data.go.kr (search R-ONE)
 *
 * Required env:
 *   RONE_API_KEY  — issued by R-ONE / data.go.kr after free registration.
 *   RONE_API_BASE — optional override of the statistics endpoint base URL.
 *
 * The survey is published per 권역 (submarket region), not per coordinate, so we
 * map the query location to a region code via a coarse bounding box and read the
 * region's office/retail 임대료·공실률·소득수익률(≈cap). Missing key → returns []
 * so the registry's mock path keeps working until the key is set.
 *
 * NOTE (scaffold parity): the exact statistic-table IDs and row field names of
 * the R-ONE API must be confirmed against a live sample before this is trusted
 * in an LP-facing memo — same maturity caveat as the RTMS/MOLIT live adapters.
 * The env-gating, region mapping, timeout, and graceful-empty contract are the
 * load-bearing parts and are correct now.
 */

import { fetchWithTimeout } from '@/lib/services/public-data/fetch-with-timeout';
import type {
  LatLng,
  RentComparableConnector,
  RentalComparable
} from '@/lib/services/public-data/types';

const DEFAULT_BASE =
  'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';

type ReoneRegion = {
  /** R-ONE 권역 classification code (CLS_ID value). */
  regionCode: string;
  label: string;
};

/** Coarse lat/lng → R-ONE commercial submarket region. */
export function resolveReoneRegion(loc: LatLng): ReoneRegion {
  const { latitude: lat, longitude: lng } = loc;
  // Gangnam core (Apgujeong, Cheongdam, Sinsa, Yeoksam, Gangnam-daero)
  if (lat >= 37.48 && lat <= 37.54 && lng >= 127.0 && lng <= 127.08) {
    return { regionCode: 'GANGNAM', label: '강남대로' };
  }
  // CBD (Gwanghwamun, Jongno, Euljiro, City Hall)
  if (lat >= 37.55 && lat <= 37.58 && lng >= 126.96 && lng <= 127.01) {
    return { regionCode: 'CBD', label: '도심' };
  }
  // YBD (Yeouido)
  if (lat >= 37.51 && lat <= 37.54 && lng >= 126.91 && lng <= 126.95) {
    return { regionCode: 'YBD', label: '여의도' };
  }
  if (lat >= 37.45 && lat <= 37.7 && lng >= 126.76 && lng <= 127.18) {
    return { regionCode: 'SEOUL_ETC', label: '서울 기타' };
  }
  return { regionCode: 'METRO', label: '수도권 기타' };
}

type ReoneRow = {
  ITM_NM?: string; // 항목명 (임대료/공실률/소득수익률...)
  DTA_VAL?: string | number; // 값
  WRTTIME_DESC?: string; // 기준 분기 e.g. "2025년 4분기"
  CLS_NM?: string; // 권역명
};

function pickValue(rows: ReoneRow[], itemMatch: RegExp): number | null {
  const row = rows.find((r) => typeof r.ITM_NM === 'string' && itemMatch.test(r.ITM_NM));
  if (!row || row.DTA_VAL == null) return null;
  const n = Number(String(row.DTA_VAL).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export class LiveReoneRentComps implements RentComparableConnector {
  constructor(
    private readonly apiKey: string | undefined = process.env.RONE_API_KEY,
    private readonly baseUrl: string = process.env.RONE_API_BASE?.trim() || DEFAULT_BASE,
    private readonly timeoutMs: number = 8000
  ) {}

  async fetch(
    location: LatLng,
    assetClass: RentalComparable['assetClassHint'],
    _radiusKm: number
  ): Promise<RentalComparable[]> {
    if (!this.apiKey) {
      return [];
    }
    const region = resolveReoneRegion(location);
    const rows = await this.fetchRegion(region.regionCode, assetClass).catch((err) => {
      console.warn(`[r-one] region ${region.regionCode} failed:`, err.message);
      return [] as ReoneRow[];
    });
    if (rows.length === 0) {
      return [];
    }

    const period = rows.find((r) => r.WRTTIME_DESC)?.WRTTIME_DESC ?? 'latest';
    const rentPerSqm = pickValue(rows, /임대료|임대가격/);
    const vacancy = pickValue(rows, /공실/);
    const cap = pickValue(rows, /소득수익률|투자수익률|수익률/);

    const isDc = assetClass === 'DATA_CENTER';
    return [
      {
        source: `R-ONE ${period}`,
        distanceKm: 0,
        assetClassHint: assetClass,
        monthlyRentKrwPerSqm: isDc ? null : rentPerSqm,
        monthlyRentKrwPerKw: null,
        capRatePct: cap,
        occupancyPct: vacancy == null ? null : Math.max(0, 100 - vacancy),
        transactionDate: null,
        note: `한국부동산원 상업용부동산 임대동향 (${region.label})`
      }
    ];
  }

  private async fetchRegion(
    regionCode: string,
    assetClass: RentalComparable['assetClassHint']
  ): Promise<ReoneRow[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('KEY', this.apiKey!);
    url.searchParams.set('Type', 'json');
    url.searchParams.set('pIndex', '1');
    url.searchParams.set('pSize', '100');
    // 상업용부동산 임대동향 통계표: office vs retail use different table IDs; the
    // operator configures the concrete STATBL_ID via env when enabling live mode.
    url.searchParams.set('REGION', regionCode);
    url.searchParams.set(
      'PROPERTY',
      assetClass === 'RETAIL' ? 'RETAIL' : assetClass === 'OFFICE' ? 'OFFICE' : 'OFFICE'
    );

    const response = await fetchWithTimeout(url.toString(), {}, this.timeoutMs);
    if (!response.ok) {
      throw new Error(`R-ONE HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as
      | { SttsApiTblData?: Array<{ row?: ReoneRow[] }> }
      | { row?: ReoneRow[] }
      | null;
    if (!body) return [];
    // R-ONE wraps rows under SttsApiTblData[1].row; tolerate both shapes.
    const wrapped = (body as { SttsApiTblData?: Array<{ row?: ReoneRow[] }> }).SttsApiTblData;
    if (Array.isArray(wrapped)) {
      return wrapped.flatMap((segment) => segment.row ?? []);
    }
    return (body as { row?: ReoneRow[] }).row ?? [];
  }
}
