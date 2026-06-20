/**
 * KPX (한국전력거래소) SMP + REC spot-price connector.
 *
 * Two FREE data.go.kr datasets that ground a data-center's power-cost and
 * renewable-PPA assumptions (today the engine falls back to a 140 KRW/kWh
 * tariff literal — see lib/services/valuation/inputs.ts):
 *
 *   - SMP 계통한계가격 (System Marginal Price) — data.go.kr/15076302
 *       한국전력거래소_계통한계가격조회. Hourly market-clearing price (원/kWh),
 *       split into 육지 (mainland) and 제주 (Jeju) systems. This is the
 *       spot electricity price every IPP/PPA references.
 *   - REC 현물가 (Renewable Energy Certificate spot price) — gated on its own
 *       key (`KPX_REC_SERVICE_KEY`); a documented secondary used for
 *       green-PPA / RE100 sourcing assumptions.
 *
 * Conventions (mirror lib/sources/adapters/world-bank.ts +
 * lib/services/public-data/live/rtms.ts):
 *   - Injectable `Fetcher` + `fetchTextWithRetry` so tests never hit the network.
 *   - data.go.kr `serviceKey` (use the DECODING form of the 일반 인증키; the
 *     URL builder encodes it once). Gated on the key's presence — no key ⇒
 *     `fetchKpxSmp` returns an empty, well-typed result with a note and never
 *     throws into callers (fail-closed, exactly like the siblings).
 *
 * SCAFFOLD-PARITY CAVEAT (needs one live sample to confirm before relying on
 * absolute values): data.go.kr item tag names vary across this dataset's
 * revisions. `parseSmpItems` is deliberately tolerant — it reads several
 * candidate tags per field (English camelCase and the Korean labels) and the
 * tag assumptions are isolated here so calibration is a one-file change.
 */

import { fetchTextWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';

export const KPX_SMP_SOURCE = '한국전력거래소 SMP (data.go.kr/15076302)';
const KPX_SMP_ENDPOINT_DEFAULT =
  'https://apis.data.go.kr/B552115/SmpDataInfoService/getSmpDataInfo';

export type SmpPoint = {
  /** Trade date as the API reports it (YYYYMMDD or YYYY-MM-DD). */
  date: string;
  /** Hour-of-day 1–24 when the API reports hourly granularity; null for daily. */
  hour: number | null;
  /** 육지 (mainland) SMP, 원/kWh. */
  landKrwPerKwh: number | null;
  /** 제주 SMP, 원/kWh. */
  jejuKrwPerKwh: number | null;
};

export type KpxSmpResult = {
  source: string;
  points: SmpPoint[];
  /** Simple mean of the available 육지 SMP points, 원/kWh — a tariff anchor. */
  landAverageKrwPerKwh: number | null;
  fetchedAt: Date;
  /** Non-fatal note; null on a clean run. */
  error: string | null;
};

function isEnabled(): boolean {
  return Boolean(process.env.KPX_SMP_SERVICE_KEY);
}

function readField(block: string, ...tagNames: string[]): string | null {
  for (const tag of tagNames) {
    const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
    if (m) return m[1]!.trim();
  }
  return null;
}

function parseNumeric(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a data.go.kr SMP response body (XML `<item>` blocks) into SMP points.
 * Tolerant of English/Korean tag variants. Exported for unit testing.
 */
export function parseSmpItems(xml: string): SmpPoint[] {
  const points: SmpPoint[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const date = readField(block, 'baseDt', 'tradeDay', 'tradeDate', '거래일자', 'date');
    if (!date) continue;
    const hourRaw = readField(block, 'hr', 'tradeHour', 'time', '거래시간');
    const land = parseNumeric(
      readField(block, 'lhSmp', 'landSmp', 'smpLand', 'mainlandSmp', '육지SMP', 'smp')
    );
    const jeju = parseNumeric(readField(block, 'jjSmp', 'jejuSmp', 'smpJeju', '제주SMP'));
    points.push({
      date,
      hour: hourRaw !== null ? (parseNumeric(hourRaw) ?? null) : null,
      landKrwPerKwh: land,
      jejuKrwPerKwh: jeju
    });
  }
  return points;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100;
}

/**
 * Fetch SMP points from data.go.kr. Fails closed: no key (or any error/timeout)
 * ⇒ empty `points` + a descriptive, non-throwing note.
 */
export async function fetchKpxSmp(options?: {
  /** YYYYMMDD; the API's default range is its most recent day when omitted. */
  tradeDay?: string;
  numOfRows?: number;
  fetcher?: Fetcher;
}): Promise<KpxSmpResult> {
  const fetchedAt = new Date();
  if (!isEnabled()) {
    return {
      source: KPX_SMP_SOURCE,
      points: [],
      landAverageKrwPerKwh: null,
      fetchedAt,
      error: 'KPX_SMP_SERVICE_KEY not set'
    };
  }

  const endpoint = process.env.KPX_SMP_API_URL?.trim() || KPX_SMP_ENDPOINT_DEFAULT;
  const url = new URL(endpoint);
  url.searchParams.set('serviceKey', process.env.KPX_SMP_SERVICE_KEY!);
  url.searchParams.set('numOfRows', String(options?.numOfRows ?? 48));
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('dataType', 'XML');
  if (options?.tradeDay) url.searchParams.set('baseDt', options.tradeDay);

  try {
    const xml = await fetchTextWithRetry(
      url.toString(),
      { cache: 'no-store' },
      {
        fetcher: options?.fetcher
      }
    );
    const points = parseSmpItems(xml);
    const landValues = points
      .map((p) => p.landKrwPerKwh)
      .filter((v): v is number => typeof v === 'number');
    return {
      source: KPX_SMP_SOURCE,
      points,
      landAverageKrwPerKwh: average(landValues),
      fetchedAt,
      error: points.length === 0 ? 'no SMP items in response' : null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logger.warn('kpx_smp_fetch_failed', { error: message });
    return {
      source: KPX_SMP_SOURCE,
      points: [],
      landAverageKrwPerKwh: null,
      fetchedAt,
      error: `KPX SMP fetch failed: ${message}`
    };
  }
}
