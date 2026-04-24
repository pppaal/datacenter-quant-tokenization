/**
 * ECOS connector — Bank of Korea open statistics API.
 *   Register: https://ecos.bok.or.kr → 로그인 → 서비스이용 → OpenAPI 인증키 신청 (free)
 *   Env: ECOS_API_KEY
 *
 * Series IDs used (100대 통계지표):
 *   722Y001 · A  → 한국은행 기준금리 (base rate, %)
 *   731Y003 · 0000001 → 원/달러 환율 (평균)
 *   901Y009 · 0 → 소비자물가지수 (CPI, 총지수, YoY transform applied client-side)
 *   200Y001 · 10111 → 국내총생산 실질성장률 (GDP YoY, %)
 *
 * All four series use monthly frequency (except GDP which is quarterly).
 * The connector asks for the trailing 12 observations and returns the latest
 * value plus the YoY change where applicable.
 */

const ECOS_BASE = 'https://ecos.bok.or.kr/api';

type EcosRow = {
  STAT_CODE: string;
  STAT_NAME: string;
  ITEM_CODE1: string;
  ITEM_NAME1: string;
  UNIT_NAME: string;
  TIME: string;        // "202601" for monthly, "2026Q1" for quarterly
  DATA_VALUE: string;  // "3.25"
};

type EcosResponse = {
  StatisticSearch?: {
    list_total_count: number;
    row: EcosRow[];
  };
  RESULT?: { CODE: string; MESSAGE: string };
};

export type EcosMacroSnapshot = {
  baseRatePct: number | null;
  krwUsd: number | null;
  cpiYoYPct: number | null;
  gdpYoYPct: number | null;
  asOf: { baseRate: string | null; krwUsd: string | null; cpi: string | null; gdp: string | null };
  sourceManifest: Record<string, { endpoint: string; fetchedAt: string; rows: number }>;
};

function resolveKey(): string | null {
  return process.env.ECOS_API_KEY?.trim() || null;
}

async function fetchSeries(
  key: string,
  statCode: string,
  itemCode: string,
  cycle: 'M' | 'Q',
  periods: number
): Promise<EcosRow[]> {
  // ECOS url shape: /{key}/json/StatisticSearch/{start}/{end}/{statCode}/{cycle}/{from}/{to}/{item}
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const q = Math.floor((m - 1) / 3) + 1;
  const endKey = cycle === 'M' ? `${y}${String(m).padStart(2, '0')}` : `${y}Q${q}`;
  // Walk back `periods` units for start key
  let startKey: string;
  if (cycle === 'M') {
    const start = new Date(y, m - 1 - periods, 1);
    startKey = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, '0')}`;
  } else {
    const totalQ = y * 4 + (q - 1) - periods;
    startKey = `${Math.floor(totalQ / 4)}Q${(totalQ % 4) + 1}`;
  }

  const url =
    `${ECOS_BASE}/StatisticSearch/${key}/json/kr/1/${periods + 2}/` +
    `${statCode}/${cycle}/${startKey}/${endKey}/${itemCode}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`ECOS ${statCode}/${itemCode} HTTP ${res.status}`);
  }
  const body = (await res.json()) as EcosResponse;
  if (body.RESULT && body.RESULT.CODE !== 'INFO-000') {
    throw new Error(`ECOS ${statCode} error: ${body.RESULT.CODE} ${body.RESULT.MESSAGE}`);
  }
  return body.StatisticSearch?.row ?? [];
}

function parseValue(rows: EcosRow[]): { value: number | null; time: string | null } {
  if (rows.length === 0) return { value: null, time: null };
  const last = rows[rows.length - 1]!;
  const v = Number(last.DATA_VALUE);
  return { value: Number.isFinite(v) ? v : null, time: last.TIME };
}

function yoyChange(rows: EcosRow[]): { value: number | null; time: string | null } {
  // Needs ≥13 monthly observations or ≥5 quarterly.
  if (rows.length < 13) return { value: null, time: null };
  const last = rows[rows.length - 1]!;
  const prior = rows[rows.length - 13]!;
  const lv = Number(last.DATA_VALUE);
  const pv = Number(prior.DATA_VALUE);
  if (!Number.isFinite(lv) || !Number.isFinite(pv) || pv === 0) return { value: null, time: last.TIME };
  return { value: ((lv - pv) / pv) * 100, time: last.TIME };
}

export async function fetchEcosSnapshot(): Promise<EcosMacroSnapshot> {
  const key = resolveKey();
  const manifest: EcosMacroSnapshot['sourceManifest'] = {};
  const ts = () => new Date().toISOString();

  if (!key) {
    return {
      baseRatePct: null,
      krwUsd: null,
      cpiYoYPct: null,
      gdpYoYPct: null,
      asOf: { baseRate: null, krwUsd: null, cpi: null, gdp: null },
      sourceManifest: {
        note: {
          endpoint: 'ECOS_API_KEY not set — snapshot will carry nulls',
          fetchedAt: ts(),
          rows: 0
        }
      }
    };
  }

  const results = await Promise.allSettled([
    fetchSeries(key, '722Y001', 'A', 'M', 14),
    fetchSeries(key, '731Y003', '0000001', 'M', 14),
    fetchSeries(key, '901Y009', '0', 'M', 14),
    fetchSeries(key, '200Y001', '10111', 'Q', 8)
  ]);

  const [baseRate, krwUsd, cpi, gdp] = results;

  const br = baseRate.status === 'fulfilled' ? parseValue(baseRate.value) : { value: null, time: null };
  const fx = krwUsd.status === 'fulfilled' ? parseValue(krwUsd.value) : { value: null, time: null };
  const ci = cpi.status === 'fulfilled' ? yoyChange(cpi.value) : { value: null, time: null };
  const gd = gdp.status === 'fulfilled' ? parseValue(gdp.value) : { value: null, time: null };

  if (baseRate.status === 'fulfilled') {
    manifest.baseRate = { endpoint: 'ECOS 722Y001', fetchedAt: ts(), rows: baseRate.value.length };
  } else {
    manifest.baseRate = { endpoint: `ECOS 722Y001 FAILED: ${(baseRate.reason as Error).message}`, fetchedAt: ts(), rows: 0 };
  }
  if (krwUsd.status === 'fulfilled') {
    manifest.krwUsd = { endpoint: 'ECOS 731Y003', fetchedAt: ts(), rows: krwUsd.value.length };
  } else {
    manifest.krwUsd = { endpoint: `ECOS 731Y003 FAILED: ${(krwUsd.reason as Error).message}`, fetchedAt: ts(), rows: 0 };
  }
  if (cpi.status === 'fulfilled') {
    manifest.cpi = { endpoint: 'ECOS 901Y009', fetchedAt: ts(), rows: cpi.value.length };
  } else {
    manifest.cpi = { endpoint: `ECOS 901Y009 FAILED: ${(cpi.reason as Error).message}`, fetchedAt: ts(), rows: 0 };
  }
  if (gdp.status === 'fulfilled') {
    manifest.gdp = { endpoint: 'ECOS 200Y001', fetchedAt: ts(), rows: gdp.value.length };
  } else {
    manifest.gdp = { endpoint: `ECOS 200Y001 FAILED: ${(gdp.reason as Error).message}`, fetchedAt: ts(), rows: 0 };
  }

  return {
    baseRatePct: br.value,
    krwUsd: fx.value,
    cpiYoYPct: ci.value,
    gdpYoYPct: gd.value,
    asOf: { baseRate: br.time, krwUsd: fx.time, cpi: ci.time, gdp: gd.time },
    sourceManifest: manifest
  };
}
