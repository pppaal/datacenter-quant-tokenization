/**
 * KOSIS (통계청 국가통계포털) live adapter for district-level macro/market
 * context (construction cost, regional CPI/activity).
 *
 * Source: KOSIS open API — https://kosis.kr/openapi/
 * Required env:
 *   KOSIS_API_KEY  — issued free at https://kosis.kr/openapi/ after registration.
 *   KOSIS_API_BASE — optional override of the statistics endpoint base.
 *
 * The MacroMicroConnector contract is non-nullable (the analyzer always needs a
 * snapshot), so when the key is missing or the API fails this adapter delegates
 * to the mock so the caller always gets a coherent snapshot — while a configured
 * key lets the live figures (e.g. construction-cost index) override.
 */

import { fetchWithTimeout } from '@/lib/services/public-data/fetch-with-timeout';
import { MockMacroMicro } from '@/lib/services/public-data/mock/macro-micro';
import type { MacroMicroConnector, MacroMicroSnapshot } from '@/lib/services/public-data/types';

const DEFAULT_BASE = 'https://kosis.kr/openapi/Param/statisticsParameterData.do';

type KosisRow = {
  PRD_DE?: string; // 수록시점
  DT?: string | number; // 값
  C1_NM?: string; // 분류명 (지역 등)
  ITM_NM?: string;
};

export class LiveKosisMacroMicro implements MacroMicroConnector {
  private readonly fallback = new MockMacroMicro();

  constructor(
    private readonly apiKey: string | undefined = process.env.KOSIS_API_KEY,
    private readonly baseUrl: string = process.env.KOSIS_API_BASE?.trim() || DEFAULT_BASE,
    private readonly timeoutMs: number = 8000
  ) {}

  async fetch(district: string, metroRegion: string): Promise<MacroMicroSnapshot> {
    const base = await this.fallback.fetch(district, metroRegion);
    if (!this.apiKey) {
      return base;
    }
    const rows = await this.fetchConstructionCost(district).catch((err) => {
      console.warn(`[kosis] district ${district} failed:`, err.message);
      return [] as KosisRow[];
    });
    if (rows.length === 0) {
      return base;
    }
    const latest = rows
      .filter((r) => r.DT != null)
      .sort((a, b) => Number(b.PRD_DE ?? 0) - Number(a.PRD_DE ?? 0))[0];
    const constructionPerSqm = latest ? Number(String(latest.DT).replace(/,/g, '')) : NaN;

    return {
      ...base,
      // Override only the figures KOSIS authoritatively provides; submarket
      // rent/vacancy/cap stay with the mock baseline (no live KOSIS series for
      // those yet). Because those survey fields remain synthetic even when this
      // adapter is keyed, resolveConnectorMode() reports macroMicro as 'mock'
      // so provenance never labels them 'live' (see registry.ts).
      constructionCostPerSqmKrw: Number.isFinite(constructionPerSqm)
        ? Math.round(constructionPerSqm)
        : base.constructionCostPerSqmKrw,
      notes: `${base.notes} (construction cost: KOSIS ${latest?.PRD_DE ?? 'latest'})`
    };
  }

  private async fetchConstructionCost(district: string): Promise<KosisRow[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('apiKey', this.apiKey!);
    url.searchParams.set('format', 'json');
    url.searchParams.set('jsonVD', 'Y');
    // The concrete orgId/tblId for the construction-cost / regional series the
    // operator wants are supplied via env when enabling live mode; we pass the
    // region as the classification filter.
    url.searchParams.set('itmId', 'ALL');
    url.searchParams.set('objL1', district);

    const response = await fetchWithTimeout(url.toString(), {}, this.timeoutMs);
    if (!response.ok) {
      throw new Error(`KOSIS HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => null)) as KosisRow[] | { err?: string } | null;
    return Array.isArray(body) ? body : [];
  }
}
