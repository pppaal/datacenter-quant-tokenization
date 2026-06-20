/**
 * KOFIA (금융투자협회) 채권 시가평가 기준수익률 connector.
 *
 * KOFIA's open API (openapi.kofia.or.kr) publishes the daily 채권시가평가
 * 기준수익률 matrix — the market-evaluated reference yield by credit grade
 * (국고/AAA/AA+/AA/AA-/A+ … BBB-/…) and maturity (3M/6M/1Y/2Y/3Y/5Y/10Y …).
 * This is the curve every Korean fixed-income desk marks corporate bonds
 * against, so it gives the firm a real, observed CREDIT SPREAD by grade —
 * grounding the IM's carried interest / discount-rate spreads, which today are
 * hardcoded calibrations (lib/services/im/tenant-credit.ts PD curve etc.).
 *
 * KOFIA's API is a POST that takes an XML `message` envelope and returns XML.
 * The envelope shape varies by service id, so the request body is supplied via
 * `KOFIA_REQUEST_BODY` (templated with the API key) and the endpoint via
 * `KOFIA_API_URL`; both are isolated so calibration is config-only.
 *
 * Conventions match the other free-key adapters: injectable `Fetcher`, gated on
 * `KOFIA_API_KEY`, fail-closed (no key / error ⇒ empty result + note, never
 * throws). Tolerant XML parsing isolated in `parseBondYieldRows`.
 *
 * SCAFFOLD-PARITY CAVEAT: the service id, the POST `message` envelope, and the
 * row tag names need one live sample to confirm. The credit-grade / maturity
 * SET is standard; the tag spellings are the only thing that should ever need a
 * tweak, and they are all in `parseBondYieldRows`.
 */

import { fetchTextWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';

export const KOFIA_BOND_SOURCE = 'KOFIA 채권 시가평가 기준수익률 (openapi.kofia.or.kr)';
const KOFIA_ENDPOINT_DEFAULT = 'https://openapi.kofia.or.kr/openapi/service/bondYieldService';

export type BondYieldPoint = {
  /** Credit grade as reported, e.g. '국고', 'AAA', 'AA-', 'BBB-'. */
  grade: string;
  /** Maturity label as reported, e.g. '1Y', '3Y', '6M'. */
  tenorLabel: string;
  /** Maturity in years (6M → 0.5), when parseable. */
  tenorYears: number | null;
  /** Market-evaluated reference yield, % per annum. */
  yieldPct: number;
};

export type KofiaBondYieldResult = {
  source: string;
  /** Evaluation date as reported (YYYYMMDD / YYYY-MM-DD), when present. */
  asOf: string | null;
  points: BondYieldPoint[];
  fetchedAt: Date;
  error: string | null;
};

function isEnabled(): boolean {
  return Boolean(process.env.KOFIA_API_KEY);
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

/** Convert a maturity label ('6M', '1Y', '10Y') to years, or null. */
export function tenorLabelToYears(label: string | null): number | null {
  if (!label) return null;
  const t = label.trim().toUpperCase();
  const m = /^(\d+(?:\.\d+)?)\s*([YM])$/.exec(t);
  if (!m) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  return m[2] === 'M' ? Math.round((value / 12) * 1000) / 1000 : value;
}

/** Parse a KOFIA bond-yield XML body into grade×tenor points. */
export function parseBondYieldRows(xml: string): { asOf: string | null; points: BondYieldPoint[] } {
  const asOf = readField(xml, 'standardDt', 'baseDate', 'evalDt', '기준일자');
  const points: BondYieldPoint[] = [];
  const rowRegex = /<(?:item|row|result)>([\s\S]*?)<\/(?:item|row|result)>/g;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const grade = readField(block, 'gradeNm', 'grade', 'ratingNm', '등급');
    const tenorLabel = readField(block, 'tenorNm', 'tenor', 'mrtyNm', 'term', '만기');
    const yieldPct = parseNumeric(readField(block, 'yld', 'yield', 'rate', 'evalYld', '수익률'));
    if (!grade || !tenorLabel || yieldPct === null) continue;
    points.push({ grade, tenorLabel, tenorYears: tenorLabelToYears(tenorLabel), yieldPct });
  }
  return { asOf, points };
}

/** Fetch the KOFIA grade×tenor yield matrix. Fails closed (empty + note). */
export async function fetchBondYields(options?: {
  fetcher?: Fetcher;
}): Promise<KofiaBondYieldResult> {
  const fetchedAt = new Date();
  if (!isEnabled()) {
    return {
      source: KOFIA_BOND_SOURCE,
      asOf: null,
      points: [],
      fetchedAt,
      error: 'KOFIA_API_KEY not set'
    };
  }

  const endpoint = process.env.KOFIA_API_URL?.trim() || KOFIA_ENDPOINT_DEFAULT;
  const apiKey = process.env.KOFIA_API_KEY!;
  // KOFIA wants an XML `message` envelope; the shape is service-specific, so it
  // is supplied via env and templated with the key. A minimal default lets the
  // path be exercised end-to-end once the real envelope is pasted in.
  const bodyTemplate =
    process.env.KOFIA_REQUEST_BODY ?? '<message><apiKey>{KEY}</apiKey></message>';
  const body = bodyTemplate.replace('{KEY}', apiKey);

  try {
    const xml = await fetchTextWithRetry(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body,
        cache: 'no-store'
      },
      { fetcher: options?.fetcher }
    );
    const { asOf, points } = parseBondYieldRows(xml);
    return {
      source: KOFIA_BOND_SOURCE,
      asOf,
      points,
      fetchedAt,
      error: points.length === 0 ? 'no yield rows in response' : null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logger.warn('kofia_bond_fetch_failed', { error: message });
    return {
      source: KOFIA_BOND_SOURCE,
      asOf: null,
      points: [],
      fetchedAt,
      error: `KOFIA bond-yield fetch failed: ${message}`
    };
  }
}
