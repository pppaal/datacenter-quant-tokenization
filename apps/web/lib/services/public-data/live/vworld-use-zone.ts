/**
 * 용도지역/지구 (land-use zoning) live adapter via the V-World NSDI open API,
 * keyed by the 19-digit PNU.
 *
 * Source: V-World — 토지이용계획속성 (getLandUseAttr / 토지이음).
 * Docs:   https://www.vworld.kr/dev/v4dv_ned2_s001.do
 *
 * Required env:
 *   VWORLD_API_KEY — shared with the land-price adapter (same V-World account).
 *   VWORLD_API_DOMAIN — the key's registered service URL; V-World's NED data
 *     APIs reject keyed calls that omit it with `INCORRECT_KEY` (REQUIRED).
 *   VWORLD_USE_ZONE_BASE — optional override of the endpoint base.
 *
 * Returns the parcel's 용도지역 (primary zone) + 용도지구, mapping the Korean zone
 * label to the routing enum. Missing key / no record → null (mock fallback).
 */

import { fetchWithTimeout } from '@/lib/services/public-data/fetch-with-timeout';
import type {
  KoreaZoningCode,
  ParcelIdentifier,
  UseZone,
  UseZoneConnector
} from '@/lib/services/public-data/types';

const DEFAULT_BASE = 'https://api.vworld.kr/ned/data/getLandUseAttr';

/** Map a 용도지역 label (prposAreaDstrcCodeNm) to the routing enum. */
export function mapZoneLabelToCode(label: string | null | undefined): KoreaZoningCode {
  const z = (label ?? '').replace(/\s+/g, '');
  if (!z) return 'UNKNOWN';
  if (/제1종전용주거|제1종일반주거/.test(z)) return 'RESIDENTIAL_1';
  if (/제2종/.test(z) && /주거/.test(z)) return 'RESIDENTIAL_2';
  if (/제3종일반주거|준주거/.test(z)) return 'RESIDENTIAL_3';
  if (/중심상업/.test(z)) return 'COMMERCIAL_CENTRAL';
  if (/일반상업/.test(z)) return 'COMMERCIAL_GENERAL';
  if (/근린상업/.test(z)) return 'COMMERCIAL_NEIGHBORHOOD';
  if (/유통상업/.test(z)) return 'COMMERCIAL_DISTRIBUTION';
  if (/전용공업/.test(z)) return 'INDUSTRIAL_EXCLUSIVE';
  if (/일반공업/.test(z)) return 'INDUSTRIAL_GENERAL';
  if (/준공업/.test(z)) return 'INDUSTRIAL_QUASI';
  if (/보전녹지/.test(z)) return 'GREEN_PRESERVATION';
  if (/생산녹지/.test(z)) return 'GREEN_PRODUCTION';
  if (/자연녹지/.test(z)) return 'GREEN_NATURAL';
  if (/계획관리/.test(z)) return 'MANAGEMENT_PLAN';
  if (/생산관리/.test(z)) return 'MANAGEMENT_PRODUCTION';
  if (/보전관리/.test(z)) return 'MANAGEMENT_CONSERVATION';
  if (/농림/.test(z)) return 'AGRICULTURE';
  if (/자연환경보전/.test(z)) return 'NATURE_RESERVE';
  return 'UNKNOWN';
}

type LandUseRow = {
  pnu?: string;
  prposAreaDstrcCodeNm?: string; // 용도지역지구명
  ladUseSittnNm?: string;
};

export class LiveVworldUseZone implements UseZoneConnector {
  constructor(
    private readonly apiKey: string | undefined = process.env.VWORLD_API_KEY,
    private readonly baseUrl: string = process.env.VWORLD_USE_ZONE_BASE?.trim() || DEFAULT_BASE,
    private readonly timeoutMs: number = 8000,
    private readonly domain: string | undefined = process.env.VWORLD_API_DOMAIN?.trim(),
    private readonly fetcher: typeof fetchWithTimeout = fetchWithTimeout
  ) {}

  async fetch(parcel: ParcelIdentifier): Promise<UseZone | null> {
    if (!this.apiKey || !parcel.pnu) {
      return null;
    }
    if (!this.domain) {
      console.warn(
        "[vworld-zone] VWORLD_API_DOMAIN is not set; V-World rejects NED calls without the key's registered domain. Set it to the registered service URL."
      );
      return null;
    }
    const rows = await this.fetchPnu(parcel.pnu).catch((err) => {
      console.warn(`[vworld-zone] pnu ${parcel.pnu} failed:`, err.message);
      return [] as LandUseRow[];
    });
    if (rows.length === 0) {
      return null;
    }

    // The primary 용도지역 is the 도시지역 zone; pick the first that maps to a
    // known code, else the first row.
    const mapped = rows
      .map((r) => ({ row: r, code: mapZoneLabelToCode(r.prposAreaDstrcCodeNm) }))
      .find((m) => m.code !== 'UNKNOWN');
    const chosen = mapped ?? { row: rows[0]!, code: 'UNKNOWN' as KoreaZoningCode };

    const districts = rows
      .map((r) => r.prposAreaDstrcCodeNm)
      .filter((n): n is string => Boolean(n) && n !== chosen.row.prposAreaDstrcCodeNm);

    return {
      pnu: parcel.pnu,
      primaryZone: chosen.row.prposAreaDstrcCodeNm ?? '미지정',
      specialDistrict: districts[0] ?? null,
      urbanPlanFacility: null,
      zoningCode: chosen.code
    };
  }

  private async fetchPnu(pnu: string): Promise<LandUseRow[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('key', this.apiKey!);
    url.searchParams.set('domain', this.domain!);
    url.searchParams.set('pnu', pnu);
    url.searchParams.set('format', 'json');
    url.searchParams.set('numOfRows', '50');
    url.searchParams.set('pageNo', '1');

    const response = await this.fetcher(url.toString(), {}, this.timeoutMs);
    if (!response.ok) {
      throw new Error(`V-World use-zone HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as {
      landUses?: { field?: LandUseRow[] };
    } | null;
    return body?.landUses?.field ?? [];
  }
}
