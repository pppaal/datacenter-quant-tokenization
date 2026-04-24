/**
 * MOLIT 건축물대장 (Korean building registry) live adapter.
 *
 * Endpoint: http://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo
 * Docs:     https://www.data.go.kr/data/15044713/openapi.do
 *
 * Required env:
 *   MOLIT_BUILDING_API_KEY — obtained from data.go.kr after registering for
 *     "건축HUB 건축물대장정보 서비스".
 *
 * Query (PNU-derived):
 *   sigunguCd  = first 5 digits of PNU
 *   bjdongCd   = next 5 digits (법정동)
 *   bun        = parcel main no. (4 digits in PNU 11..14)
 *   ji         = parcel sub no. (4 digits in PNU 15..18)
 *
 * Returns null if no API key, no match, or any parse error — the caller
 * (auto-analyze) is then responsible for falling back to the mock connector.
 *
 * NOTE: this is a scaffold. Production should:
 *   - swap regex parsing for fast-xml-parser (already a transitive dep)
 *   - cache by PNU to avoid hitting MOLIT rate limits during repeated runs
 *   - emit a structured ProviderError on transport vs auth failures
 */
import type {
  BuildingRecord,
  BuildingRegistryConnector,
  ParcelIdentifier
} from '@/lib/services/public-data/types';

const ENDPOINT =
  'http://apis.data.go.kr/1613000/BldRgstService_v2/getBrTitleInfo';

export class LiveMolitBuildingRegistry implements BuildingRegistryConnector {
  constructor(
    private readonly apiKey: string | undefined = process.env.MOLIT_BUILDING_API_KEY,
    private readonly timeoutMs: number = 8000
  ) {}

  async fetch(parcel: ParcelIdentifier): Promise<BuildingRecord | null> {
    if (!this.apiKey) return null;
    const ids = splitPnu(parcel.pnu);
    if (!ids) return null;

    const url = new URL(ENDPOINT);
    url.searchParams.set('serviceKey', this.apiKey);
    url.searchParams.set('sigunguCd', ids.sigunguCd);
    url.searchParams.set('bjdongCd', ids.bjdongCd);
    url.searchParams.set('bun', ids.bun);
    url.searchParams.set('ji', ids.ji);
    url.searchParams.set('numOfRows', '1');
    url.searchParams.set('pageNo', '1');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        console.warn(`[molit-building] HTTP ${response.status} for pnu=${parcel.pnu}`);
        return null;
      }
      const xml = await response.text();
      return parseBuildingXml(xml, parcel.pnu);
    } catch (err) {
      console.warn(`[molit-building] fetch failed for pnu=${parcel.pnu}`, err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function splitPnu(pnu: string): {
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
} | null {
  if (!/^\d{19}$/.test(pnu)) return null;
  return {
    sigunguCd: pnu.slice(0, 5),
    bjdongCd: pnu.slice(5, 10),
    bun: pnu.slice(11, 15),
    ji: pnu.slice(15, 19)
  };
}

export function parseBuildingXml(xml: string, pnu: string): BuildingRecord | null {
  const block = /<item>([\s\S]*?)<\/item>/.exec(xml)?.[1];
  if (!block) return null;
  const num = (tag: string): number | null => {
    const v = read(block, tag);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    pnu,
    buildingName: read(block, 'bldNm') || null,
    mainUse: read(block, 'mainPurpsCdNm') ?? '',
    structure: read(block, 'strctCdNm') || null,
    floorsAboveGround: num('grndFlrCnt'),
    floorsBelowGround: num('ugrndFlrCnt'),
    grossFloorAreaSqm: num('totArea'),
    buildingAreaSqm: num('archArea'),
    landAreaSqm: num('platArea'),
    approvalYear: parseApprovalYear(read(block, 'useAprDay')),
    elevatorCount: num('rideUseElvtCnt'),
    parkingCount: num('indrAutoUtcnt'),
    buildingCoveragePct: num('bcRat'),
    floorAreaRatioPct: num('vlRat')
  };
}

function read(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = re.exec(block);
  return m ? m[1].trim() : null;
}

function parseApprovalYear(raw: string | null): number | null {
  if (!raw) return null;
  const y = Number(raw.slice(0, 4));
  return Number.isInteger(y) && y > 1900 ? y : null;
}
