/**
 * DART 전자공시 connector — KRX corporate disclosure system.
 *   Register: https://opendart.fss.or.kr → 인증키 신청 (free, immediate)
 *   Env: DART_API_KEY
 *
 * Scope we need for a quarterly market narrative:
 *   1. REIT공시 (commercial REITs disclosing cap rate, NAV, rent)
 *   2. 주요사항보고서 filings referencing 부동산 취득/처분 above a size threshold
 *      (proxy for large deal activity)
 *
 * DART exposes a single "list" endpoint (list.json) that filters by corp_code +
 * date window + 공시유형. We pull the trailing 90 days and bucket by disclosure
 * type. Full filing text requires a second document.xml call per filing — we
 * skip that here (costly; let the narrative generator re-query on demand).
 */

const DART_LIST = 'https://opendart.fss.or.kr/api/list.json';

type DartListRow = {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  corp_cls: string;
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string; // "20260115"
  rm: string;
};

type DartListResponse = {
  status: string;
  message: string;
  page_no: number;
  page_count: number;
  total_count: number;
  total_page: number;
  list?: DartListRow[];
};

export type DartQuarterSlice = {
  reitDisclosures: DartListRow[];
  realEstateTransactions: DartListRow[];
  totalFetched: number;
  fetchedAt: string;
  sourceManifest: Record<string, string>;
};

function resolveKey(): string | null {
  return process.env.DART_API_KEY?.trim() || null;
}

function quarterBounds(quarter: string): { begin: string; end: string } {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  if (!m) throw new Error(`Invalid quarter "${quarter}"`);
  const year = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const endDay = new Date(year, endMonth, 0).getDate();
  return {
    begin: `${year}${String(startMonth).padStart(2, '0')}01`,
    end: `${year}${String(endMonth).padStart(2, '0')}${String(endDay).padStart(2, '0')}`
  };
}

async function fetchPage(
  key: string,
  begin: string,
  end: string,
  pblntfDetailTy: string | null,
  pageNo: number
): Promise<DartListResponse> {
  const params = new URLSearchParams({
    crtfc_key: key,
    bgn_de: begin,
    end_de: end,
    page_no: String(pageNo),
    page_count: '100'
  });
  if (pblntfDetailTy) params.set('pblntf_detail_ty', pblntfDetailTy);

  const res = await fetch(`${DART_LIST}?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`DART HTTP ${res.status}`);
  const body = (await res.json()) as DartListResponse;
  if (body.status !== '000' && body.status !== '013') {
    throw new Error(`DART error ${body.status}: ${body.message}`);
  }
  return body;
}

async function fetchAllPages(
  key: string,
  begin: string,
  end: string,
  pblntfDetailTy: string | null,
  maxPages = 5
): Promise<DartListRow[]> {
  const out: DartListRow[] = [];
  const first = await fetchPage(key, begin, end, pblntfDetailTy, 1);
  if (first.list) out.push(...first.list);
  const totalPages = Math.min(first.total_page ?? 1, maxPages);
  for (let p = 2; p <= totalPages; p++) {
    const page = await fetchPage(key, begin, end, pblntfDetailTy, p);
    if (page.list) out.push(...page.list);
  }
  return out;
}

function isRealEstateDisclosure(row: DartListRow): boolean {
  const name = row.report_nm;
  return (
    name.includes('부동산') ||
    name.includes('유형자산') ||
    name.includes('투자부동산') ||
    name.includes('자산양수') ||
    name.includes('자산양도')
  );
}

function isReitFiler(row: DartListRow): boolean {
  return (
    row.corp_name.includes('리츠') ||
    row.corp_name.includes('부동산투자') ||
    row.report_nm.includes('리츠')
  );
}

export async function fetchDartQuarter(quarter: string): Promise<DartQuarterSlice> {
  const key = resolveKey();
  const manifest: Record<string, string> = {};
  const { begin, end } = quarterBounds(quarter);

  if (!key) {
    manifest.note = 'DART_API_KEY not set — slice empty';
    return {
      reitDisclosures: [],
      realEstateTransactions: [],
      totalFetched: 0,
      fetchedAt: new Date().toISOString(),
      sourceManifest: manifest
    };
  }

  // Pull two slices: 주요사항보고서 (pblntfDetailTy "B001" family captures
  // 자산양수·양도결정) and periodic reports (for REITs). We keep it simple and
  // fetch the full window then filter client-side — DART is rate-limited but
  // reasonable at ~100 req/sec.
  const [major, periodic] = await Promise.allSettled([
    fetchAllPages(key, begin, end, 'B001', 3),
    fetchAllPages(key, begin, end, 'A003', 3)
  ]);

  const rows: DartListRow[] = [];
  if (major.status === 'fulfilled') {
    rows.push(...major.value);
    manifest.major = `DART list B001 ${begin}-${end} (${major.value.length} rows)`;
  } else {
    manifest.major = `DART list B001 FAILED: ${(major.reason as Error).message}`;
  }
  if (periodic.status === 'fulfilled') {
    rows.push(...periodic.value);
    manifest.periodic = `DART list A003 ${begin}-${end} (${periodic.value.length} rows)`;
  } else {
    manifest.periodic = `DART list A003 FAILED: ${(periodic.reason as Error).message}`;
  }

  const reitDisclosures = rows.filter(isReitFiler);
  const realEstateTransactions = rows.filter((r) => !isReitFiler(r) && isRealEstateDisclosure(r));

  return {
    reitDisclosures,
    realEstateTransactions,
    totalFetched: rows.length,
    fetchedAt: new Date().toISOString(),
    sourceManifest: manifest
  };
}
