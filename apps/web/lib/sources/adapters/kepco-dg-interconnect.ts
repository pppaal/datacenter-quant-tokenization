/**
 * KEPCO (한국전력공사) 분산전원 연계정보 connector.
 *
 * data.go.kr/15031274 — 한국전력공사_분산전원 연계정보. KEPCO publishes, per
 * 변전소 (substation) / 지사, the distributed-generation interconnection
 * picture: installed/connected capacity and the remaining capacity still open
 * for new interconnection. For a data-center siting decision this is the single
 * highest-value grid signal — a site is only viable if the nearest substation
 * has the headroom (MW) to connect the load.
 *
 * This complements the existing grid connector (lib/services/public-data/
 * live/kepco-grid.ts, which reads a curated substation file): this adapter
 * pulls the live KEPCO interconnection roster keyed by region.
 *
 * Conventions match the other free-key data.go.kr adapters: injectable
 * `Fetcher`, DECODING-form `serviceKey`, gated on `KEPCO_DG_SERVICE_KEY`,
 * fail-closed (no key / error ⇒ empty result + note, never throws). Tolerant
 * XML parsing isolated in `parseDgInterconnects`.
 *
 * SCAFFOLD-PARITY CAVEAT: confirm the item tag names and the regional query
 * parameter against one live sample before trusting absolute capacities. The
 * field SET (substation, connected/available capacity, voltage) is stable
 * across KEPCO's grid datasets; the exact tag spellings are isolated here.
 */

import { fetchTextWithRetry, type Fetcher } from '@/lib/sources/http';
import { logger } from '@/lib/observability/logger';

export const KEPCO_DG_SOURCE = '한국전력공사 분산전원 연계정보 (data.go.kr/15031274)';
const KEPCO_DG_ENDPOINT_DEFAULT =
  'https://apis.data.go.kr/B552115/DistInterconnectInfo/getDistInterconnectInfo';

export type DgInterconnect = {
  /** 변전소명 (substation name) as reported. */
  substation: string;
  /** 지사/본부 (regional office), when present. */
  branch: string | null;
  /** Nominal voltage class in kV, when reported (e.g. 154, 345). */
  voltageKv: number | null;
  /** Already-connected distributed-generation capacity, MW. */
  connectedMw: number | null;
  /** Remaining capacity open for new interconnection, MW — the siting signal. */
  availableMw: number | null;
};

export type KepcoDgResult = {
  source: string;
  interconnects: DgInterconnect[];
  fetchedAt: Date;
  error: string | null;
};

function isEnabled(): boolean {
  return Boolean(process.env.KEPCO_DG_SERVICE_KEY);
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

/** Parse a KEPCO DG-interconnection XML body. Exported for unit testing. */
export function parseDgInterconnects(xml: string): DgInterconnect[] {
  const rows: DgInterconnect[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!;
    const substation = readField(block, 'substNm', 'substationNm', 'sttnNm', '변전소명');
    if (!substation) continue;
    rows.push({
      substation,
      branch: readField(block, 'branchNm', 'officeNm', '지사명'),
      voltageKv: parseNumeric(readField(block, 'voltLvl', 'voltageKv', 'volt', '전압')),
      connectedMw: parseNumeric(
        readField(block, 'cnctCapa', 'connectedMw', 'connCapaMw', '연계용량')
      ),
      availableMw: parseNumeric(
        readField(block, 'avlblCapa', 'availableMw', 'rmnCapaMw', '여유용량', '잔여용량')
      )
    });
  }
  return rows;
}

/** Fetch KEPCO DG-interconnection records. Fails closed (empty + note). */
export async function fetchDgInterconnects(options?: {
  /** Regional filter (시/도 or 지사), passed through as `addr` when set. */
  region?: string;
  numOfRows?: number;
  fetcher?: Fetcher;
}): Promise<KepcoDgResult> {
  const fetchedAt = new Date();
  if (!isEnabled()) {
    return {
      source: KEPCO_DG_SOURCE,
      interconnects: [],
      fetchedAt,
      error: 'KEPCO_DG_SERVICE_KEY not set'
    };
  }

  const endpoint = process.env.KEPCO_DG_API_URL?.trim() || KEPCO_DG_ENDPOINT_DEFAULT;
  const url = new URL(endpoint);
  url.searchParams.set('serviceKey', process.env.KEPCO_DG_SERVICE_KEY!);
  url.searchParams.set('numOfRows', String(options?.numOfRows ?? 200));
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('dataType', 'XML');
  if (options?.region) url.searchParams.set('addr', options.region);

  try {
    const xml = await fetchTextWithRetry(
      url.toString(),
      { cache: 'no-store' },
      {
        fetcher: options?.fetcher
      }
    );
    const interconnects = parseDgInterconnects(xml);
    return {
      source: KEPCO_DG_SOURCE,
      interconnects,
      fetchedAt,
      error: interconnects.length === 0 ? 'no interconnection items in response' : null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logger.warn('kepco_dg_fetch_failed', { error: message });
    return {
      source: KEPCO_DG_SOURCE,
      interconnects: [],
      fetchedAt,
      error: `KEPCO DG fetch failed: ${message}`
    };
  }
}
