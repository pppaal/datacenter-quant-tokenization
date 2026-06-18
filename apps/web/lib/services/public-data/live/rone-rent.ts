/**
 * 한국부동산원 R-ONE 상업용부동산 임대동향조사 (오피스) live adapter — monthly
 * rent (원/㎡) + vacancy → occupancy, the single highest-value public source for
 * commercial-office rent ground truth, replacing synthetic rent comps.
 *
 * Source: 한국부동산원 부동산통계정보 (R-ONE) open API, SttsApiTblData.do.
 * Docs:   https://www.reb.or.kr/r-one/
 *
 * Required env:
 *   RONE_API_KEY  — issued free at https://www.reb.or.kr/r-one/ (Open API).
 * Optional env (override the wired 상업용부동산 임대동향조사_오피스 tables):
 *   RONE_RENT_STATBL_ID    — 임대동향 지역별 임대료_오피스 (default below)
 *   RONE_VACANCY_STATBL_ID — 임대동향 지역별 공실률_오피스 (default below)
 *   RONE_API_BASE          — endpoint base override
 *
 * The survey is published per 권역 (CLS_NM, e.g. 도심/강남/여의도), quarterly
 * (DTACYCLE_CD=QY). We map the query coordinate to a 권역, read the latest
 * quarter's row, and convert the rent unit (천원/㎡ → 원/㎡). Missing key, no
 * wired table for the asset class, or no matching region → [] so the registry's
 * mock path keeps working.
 *
 * Confirmed against a live sample (STATBL_ID TT249843134237374, 2024 Q3): rows
 * carry CLS_NM (권역), ITM_NM, DTA_VAL, UI_NM ("천원/㎡"), WRTTIME_IDTFR_ID
 * ("202403", latest-first), WRTTIME_DESC ("2024년 3분기").
 */

import { clamp } from '@/lib/math';
import { fetchWithTimeout } from '@/lib/services/public-data/fetch-with-timeout';
import type {
  LatLng,
  RentComparableConnector,
  RentalComparable
} from '@/lib/services/public-data/types';

const DEFAULT_BASE = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
// 상업용부동산 임대동향조사 — 임대동향 지역별 (2024년3분기~)_오피스, quarterly.
const DEFAULT_RENT_STATBL_ID = 'TT249843134237374'; // 임대료 (천원/㎡)
const DEFAULT_VACANCY_STATBL_ID = 'TT244763134428698'; // 공실률 (%)

/** Coarse lat/lng → R-ONE 오피스 권역 (matches the survey's CLS_NM values). */
export function resolveReoneRegion(loc: LatLng): { clsNm: string; label: string } {
  const { latitude: lat, longitude: lng } = loc;
  // Gangnam (Apgujeong, Cheongdam, Sinsa, Yeoksam, Gangnam-daero)
  if (lat >= 37.48 && lat <= 37.54 && lng >= 127.0 && lng <= 127.08) {
    return { clsNm: '강남', label: '강남' };
  }
  // CBD / 도심 (Gwanghwamun, Jongno, Euljiro, City Hall, Namdaemun)
  if (lat >= 37.55 && lat <= 37.58 && lng >= 126.96 && lng <= 127.01) {
    return { clsNm: '도심', label: '도심' };
  }
  // YBD / 여의도 (Yeouido)
  if (lat >= 37.51 && lat <= 37.54 && lng >= 126.91 && lng <= 126.95) {
    return { clsNm: '여의도', label: '여의도' };
  }
  // Rest of Seoul → the 서울 aggregate row.
  if (lat >= 37.43 && lat <= 37.71 && lng >= 126.76 && lng <= 127.19) {
    return { clsNm: '서울', label: '서울' };
  }
  // Outside Seoul → the 전국 aggregate row.
  return { clsNm: '전국', label: '전국' };
}

type ReoneRow = {
  CLS_NM?: string; // 권역명 e.g. 도심/강남/여의도/서울/전국
  DTA_VAL?: string | number; // 값
  UI_NM?: string; // 단위 e.g. "천원/㎡", "%"
  WRTTIME_IDTFR_ID?: string; // 기준시점 식별자 e.g. "202403" (latest = max)
  WRTTIME_DESC?: string; // "2024년 3분기"
};

/** Latest-quarter row for a 권역; null when the region/value is absent. */
function latestRegionRow(rows: ReoneRow[], clsNm: string): ReoneRow | null {
  const matching = rows.filter((r) => r.CLS_NM === clsNm && r.DTA_VAL != null);
  if (matching.length === 0) return null;
  return matching.reduce((best, r) =>
    (r.WRTTIME_IDTFR_ID ?? '') > (best.WRTTIME_IDTFR_ID ?? '') ? r : best
  );
}

function numericValue(row: ReoneRow | null): number | null {
  if (!row || row.DTA_VAL == null) return null;
  const n = Number(String(row.DTA_VAL).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export class LiveReoneRentComps implements RentComparableConnector {
  constructor(
    private readonly apiKey: string | undefined = process.env.RONE_API_KEY,
    private readonly baseUrl: string = process.env.RONE_API_BASE?.trim() || DEFAULT_BASE,
    private readonly timeoutMs: number = 8000,
    private readonly rentStatblId: string = process.env.RONE_RENT_STATBL_ID?.trim() ||
      DEFAULT_RENT_STATBL_ID,
    private readonly vacancyStatblId: string = process.env.RONE_VACANCY_STATBL_ID?.trim() ||
      DEFAULT_VACANCY_STATBL_ID,
    private readonly fetcher: typeof fetchWithTimeout = fetchWithTimeout
  ) {}

  async fetch(
    location: LatLng,
    assetClass: RentalComparable['assetClassHint'],
    _radiusKm: number
  ): Promise<RentalComparable[]> {
    if (!this.apiKey) {
      return [];
    }
    // Only the OFFICE survey is wired (and used as a proxy for office-dominant
    // mixed-use). Other classes fall through to the registry's mock comps.
    if (assetClass !== 'OFFICE' && assetClass !== 'MIXED_USE') {
      return [];
    }

    const region = resolveReoneRegion(location);
    const [rentRows, vacancyRows] = await Promise.all([
      this.fetchTable(this.rentStatblId).catch((err) => {
        console.warn(`[r-one] rent table failed:`, err.message);
        return [] as ReoneRow[];
      }),
      this.fetchTable(this.vacancyStatblId).catch((err) => {
        console.warn(`[r-one] vacancy table failed:`, err.message);
        return [] as ReoneRow[];
      })
    ]);

    const rentRow = latestRegionRow(rentRows, region.clsNm);
    const vacancyRow = latestRegionRow(vacancyRows, region.clsNm);
    if (!rentRow && !vacancyRow) {
      return [];
    }

    // Rent is published in 천원/㎡ — convert to 원/㎡ (monthly). Guard on UI_NM in
    // case the table's unit ever changes.
    const rentRaw = numericValue(rentRow);
    const rentKrwPerSqm =
      rentRaw == null ? null : Math.round(rentRaw * (rentRow?.UI_NM?.includes('천원') ? 1000 : 1));

    const vacancy = numericValue(vacancyRow);
    const period = rentRow?.WRTTIME_DESC ?? vacancyRow?.WRTTIME_DESC ?? 'latest';

    return [
      {
        source: `R-ONE ${period}`,
        distanceKm: 0,
        assetClassHint: assetClass,
        monthlyRentKrwPerSqm: rentKrwPerSqm,
        monthlyRentKrwPerKw: null,
        // 소득수익률 (cap) lives in a separate STATBL_ID not wired here yet.
        capRatePct: null,
        occupancyPct: vacancy == null ? null : clamp(100 - vacancy, 0, 100),
        transactionDate: null,
        note: `한국부동산원 상업용부동산 임대동향조사 (오피스 · ${region.label})`
      }
    ];
  }

  private async fetchTable(statblId: string): Promise<ReoneRow[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('KEY', this.apiKey!);
    url.searchParams.set('STATBL_ID', statblId);
    url.searchParams.set('DTACYCLE_CD', 'QY');
    url.searchParams.set('Type', 'json');
    url.searchParams.set('pIndex', '1');
    // The latest quarter is returned first; 200 rows covers every 권역 for the
    // most recent few quarters (the survey has ~40 submarkets).
    url.searchParams.set('pSize', '200');

    const response = await this.fetcher(url.toString(), {}, this.timeoutMs);
    if (!response.ok) {
      throw new Error(`R-ONE HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as {
      SttsApiTblData?: Array<{ row?: ReoneRow[] }>;
    } | null;
    // Rows live under SttsApiTblData[1].row; the [0] segment is head/RESULT.
    return (body?.SttsApiTblData ?? []).flatMap((segment) => segment.row ?? []);
  }
}
