/**
 * 개별공시지가 (official individual land price) live adapter via the V-World
 * NSDI open API, keyed by the 19-digit PNU.
 *
 * Source: V-World (국토교통부 공간정보) — 개별공시지가속성 (getIndvdLandPriceAttr).
 * Docs:   https://www.vworld.kr/dev/v4dv_ned2_s001.do
 *
 * Required env:
 *   VWORLD_API_KEY — issued free at https://www.vworld.kr after registration.
 *   VWORLD_API_DOMAIN — the key's registered service URL (e.g. example.com).
 *     V-World's NED data APIs reject keyed calls that omit the registered
 *     domain with `INCORRECT_KEY`, so this is REQUIRED for live land-price.
 *   VWORLD_API_BASE — optional override of the NSDI data endpoint base.
 *
 * Returns the most recent year's 공시지가 (KRW/㎡) for the parcel. Missing key or
 * no record → null, so the registry's mock land-price path keeps working.
 */

import { fetchWithTimeout } from '@/lib/services/public-data/fetch-with-timeout';
import type {
  LandPricing,
  LandPricingConnector,
  ParcelIdentifier
} from '@/lib/services/public-data/types';

const DEFAULT_BASE = 'https://api.vworld.kr/ned/data/getIndvdLandPriceAttr';

type IndvdLandPriceRow = {
  pnu?: string;
  stdrYear?: string; // 기준연도
  pblntfPclnd?: string | number; // 공시지가 (원/㎡)
  ladUseSittn?: string; // 토지이용상황
};

export class LiveVworldLandPricing implements LandPricingConnector {
  constructor(
    private readonly apiKey: string | undefined = process.env.VWORLD_API_KEY,
    private readonly baseUrl: string = process.env.VWORLD_API_BASE?.trim() || DEFAULT_BASE,
    private readonly timeoutMs: number = 8000,
    private readonly domain: string | undefined = process.env.VWORLD_API_DOMAIN?.trim(),
    private readonly fetcher: typeof fetchWithTimeout = fetchWithTimeout
  ) {}

  async fetch(parcel: ParcelIdentifier): Promise<LandPricing | null> {
    if (!this.apiKey || !parcel.pnu) {
      return null;
    }
    if (!this.domain) {
      // V-World NED data APIs reject keyed calls without the registered domain
      // (INCORRECT_KEY). Fail loud-but-soft so the misconfig is diagnosable
      // rather than a silent mock fallback.
      console.warn(
        "[vworld-land] VWORLD_API_DOMAIN is not set; V-World rejects NED calls without the key's registered domain. Set it to the registered service URL."
      );
      return null;
    }
    const rows = await this.fetchPnu(parcel.pnu).catch((err) => {
      console.warn(`[vworld-land] pnu ${parcel.pnu} failed:`, err.message);
      return [] as IndvdLandPriceRow[];
    });
    if (rows.length === 0) {
      return null;
    }
    // Most recent 기준연도 wins.
    const latest = rows
      .filter((r) => r.pblntfPclnd != null)
      .sort((a, b) => Number(b.stdrYear ?? 0) - Number(a.stdrYear ?? 0))[0];
    if (!latest) return null;

    const price = Number(String(latest.pblntfPclnd).replace(/,/g, ''));
    if (!Number.isFinite(price) || price <= 0) return null;

    return {
      pnu: parcel.pnu,
      officialLandPriceKrwPerSqm: Math.round(price),
      officialLandPriceYear: Number(latest.stdrYear) || new Date().getFullYear(),
      // 실거래가 / vacancy come from other connectors (RTMS / R-ONE), not this one.
      recentTransactionKrwPerSqm: null,
      recentTransactionDate: null,
      vacancyPct: null
    };
  }

  private async fetchPnu(pnu: string): Promise<IndvdLandPriceRow[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('key', this.apiKey!);
    url.searchParams.set('domain', this.domain!);
    url.searchParams.set('pnu', pnu);
    url.searchParams.set('format', 'json');
    url.searchParams.set('numOfRows', '20');
    url.searchParams.set('pageNo', '1');

    const response = await this.fetcher(url.toString(), {}, this.timeoutMs);
    if (!response.ok) {
      throw new Error(`V-World land HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as {
      indvdLandPrices?: { field?: IndvdLandPriceRow[] };
    } | null;
    return body?.indvdLandPrices?.field ?? [];
  }
}
