/**
 * OpenDART 단일회사 전체 재무제표 connector — pulls a tenant/sponsor's
 * account-level financial statements from 전자공시(DART) so tenant-credit
 * scoring runs on observed corporate financials instead of synthetic input.
 *
 *   Register: https://opendart.fss.or.kr → 인증키 신청 (free, immediate)
 *   Env: DART_API_KEY
 *
 * The sibling `dart.ts` connector only lists *disclosure filings* (REIT /
 * real-estate transaction headers). It deliberately does NOT fetch financial
 * statements — and `lib/services/valuation/tenant-credit.ts` notes that
 * "this module does not fetch from DART. A separate connector handles that."
 * This file is that connector.
 *
 * Endpoint (단일회사 전체 재무제표):
 *   https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json
 *     ?crtfc_key=...&corp_code=...&bsns_year=YYYY&reprt_code=11011&fs_div=CFS
 *
 *   reprt_code: 11011 사업보고서 (annual), 11012 반기, 11013/11014 분기.
 *   fs_div:     CFS 연결재무제표 (consolidated), OFS 재무제표 (separate).
 *
 * The response is a flat list of account rows (account_nm / thstrm_amount …)
 * spanning 재무상태표(BS) and 손익계산서(IS). We bucket by `sj_div` and map
 * the standard 표준계정과목 names onto the canonical fields used by
 * `TenantFinancials` (tenant-credit) and `ParsedFinancialStatement`
 * (financial-statements).
 *
 * Scaffold-parity note: exact reprt_code / fs_div coverage and the long tail
 * of account-name variants need validation against a live sample. The mapping
 * below covers the 표준계정과목 names DART emits for most issuers; unmatched
 * accounts are simply ignored (graceful, never throws into callers).
 */

import { fetchJsonWithRetry, type Fetcher } from '@/lib/sources/http';
import type { IndustrySector, TenantFinancials } from '@/lib/services/valuation/tenant-credit';

const DART_FNLTT_ALL = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json';
const DART_CORP_CODE = 'https://opendart.fss.or.kr/api/company.json';

/** 사업보고서 (annual). Other periodic codes exist but annual is the credit input. */
export const DART_REPRT_ANNUAL = '11011';

/** sj_div bucket: BS 재무상태표, IS 손익계산서, CIS 포괄손익계산서, CF 현금흐름표. */
type DartFinancialRow = {
  rcept_no: string;
  bsns_year: string;
  corp_code: string;
  sj_div: string; // 'BS' | 'IS' | 'CIS' | 'CF' | 'SCE'
  sj_nm: string;
  account_id: string; // 표준계정 id, e.g. 'ifrs-full_Assets'
  account_nm: string; // 한글 계정명, e.g. '자산총계'
  thstrm_nm: string;
  thstrm_amount: string; // 당기 금액 (string, may be '', '-', or contain commas)
  frmtrm_amount?: string; // 전기 금액 (prior period)
  fs_div?: string;
  fs_nm?: string;
  ord?: string;
  currency?: string;
};

type DartFnlttResponse = {
  status: string;
  message: string;
  list?: DartFinancialRow[];
};

type DartCompanyResponse = {
  status: string;
  message: string;
  corp_name?: string;
  corp_code?: string;
  stock_code?: string; // listed issuers have a 6-digit code; '' when unlisted
  induty_code?: string; // KSIC industry code
};

export type DartFinancialsOptions = {
  /** Defaults to the current calendar year minus one (last completed FY). */
  bsnsYear?: number;
  /** Defaults to 11011 (사업보고서 / annual). */
  reprtCode?: string;
  /** 'CFS' 연결(default) → falls back to 'OFS' 별도 when consolidated is empty. */
  preferConsolidated?: boolean;
  fetcher?: Fetcher;
};

/**
 * Canonical, role-agnostic financial snapshot pulled from DART. A superset of
 * the fields tenant-credit needs, so the same payload can also seed the
 * `ParsedFinancialStatement` (financial-statements) ingestion path.
 */
export type DartFinancialSnapshot = {
  corpCode: string;
  corpName: string | null;
  stockCode: string | null;
  isListed: boolean;
  /** KSIC industry code from the 기업개황 endpoint, when available. */
  indutyCode: string | null;
  fiscalYear: number;
  reprtCode: string;
  fsDiv: 'CFS' | 'OFS';
  currency: string;
  // Balance sheet
  totalAssetsKrw: number | null;
  totalLiabilitiesKrw: number | null;
  currentAssetsKrw: number | null;
  currentLiabilitiesKrw: number | null;
  cashAndEquivalentsKrw: number | null;
  totalDebtKrw: number | null;
  totalEquityKrw: number | null;
  // Income statement
  revenueKrw: number | null;
  operatingIncomeKrw: number | null;
  netIncomeKrw: number | null;
  interestExpenseKrw: number | null;
  priorYearRevenueKrw: number | null;
  // Cash flow
  operatingCashFlowKrw: number | null;
  sourceManifest: Record<string, string>;
};

function resolveKey(): string | null {
  return process.env.DART_API_KEY?.trim() || null;
}

/**
 * DART amounts arrive as strings that may carry thousands separators, a
 * parenthesised or leading-minus negative, or be blank/'-' for n/a rows.
 */
function parseDartAmount(raw?: string | null): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;
  const negative = /^\(.*\)$/.test(trimmed) || trimmed.startsWith('-');
  const digits = trimmed.replace(/[(),\s-]/g, '');
  if (digits === '') return null;
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Account-name → canonical field matcher. DART emits 표준계정과목 names, but
 * issuers vary, so we match on `account_id` (IFRS taxonomy id, stable) first
 * and fall back to substring matching on the 한글 `account_nm`.
 *
 * Multiple candidate accounts can satisfy one field; the first BS/IS row that
 * matches wins (DART orders parent totals before child line items), so e.g.
 * '자산총계' is preferred over a nested asset subtotal.
 */
const ACCOUNT_ID_MAP: Record<string, keyof DartFinancialMatchTargets> = {
  'ifrs-full_Assets': 'totalAssetsKrw',
  'ifrs-full_CurrentAssets': 'currentAssetsKrw',
  'ifrs-full_Liabilities': 'totalLiabilitiesKrw',
  'ifrs-full_CurrentLiabilities': 'currentLiabilitiesKrw',
  'ifrs-full_Equity': 'totalEquityKrw',
  'ifrs-full_EquityAttributableToOwnersOfParent': 'totalEquityKrw',
  'ifrs-full_CashAndCashEquivalents': 'cashAndEquivalentsKrw',
  'ifrs-full_Revenue': 'revenueKrw',
  'ifrs-full_ProfitLossFromOperatingActivities': 'operatingIncomeKrw',
  dart_OperatingIncomeLoss: 'operatingIncomeKrw',
  'ifrs-full_ProfitLoss': 'netIncomeKrw',
  'ifrs-full_FinanceCosts': 'interestExpenseKrw',
  dart_InterestExpense: 'interestExpenseKrw',
  'ifrs-full_CashFlowsFromUsedInOperatingActivities': 'operatingCashFlowKrw'
};

type DartFinancialMatchTargets = {
  totalAssetsKrw: number | null;
  totalLiabilitiesKrw: number | null;
  currentAssetsKrw: number | null;
  currentLiabilitiesKrw: number | null;
  cashAndEquivalentsKrw: number | null;
  totalEquityKrw: number | null;
  revenueKrw: number | null;
  operatingIncomeKrw: number | null;
  netIncomeKrw: number | null;
  interestExpenseKrw: number | null;
  operatingCashFlowKrw: number | null;
  priorYearRevenueKrw: number | null;
};

/** Korean 한글 account-name substring fallbacks, checked in declaration order. */
const ACCOUNT_NAME_MATCHERS: Array<{
  field: keyof DartFinancialMatchTargets;
  includes: string[];
  excludes?: string[];
}> = [
  { field: 'currentAssetsKrw', includes: ['유동자산'], excludes: ['비유동'] },
  { field: 'totalAssetsKrw', includes: ['자산총계', '자산 총계'] },
  { field: 'currentLiabilitiesKrw', includes: ['유동부채'], excludes: ['비유동'] },
  { field: 'totalLiabilitiesKrw', includes: ['부채총계', '부채 총계'] },
  { field: 'totalEquityKrw', includes: ['자본총계', '자본 총계'] },
  { field: 'cashAndEquivalentsKrw', includes: ['현금및현금성자산', '현금 및 현금성자산'] },
  { field: 'revenueKrw', includes: ['매출액', '수익(매출액)', '영업수익'] },
  { field: 'operatingIncomeKrw', includes: ['영업이익'] },
  { field: 'netIncomeKrw', includes: ['당기순이익', '당기순손익', '분기순이익'] },
  { field: 'interestExpenseKrw', includes: ['이자비용', '금융원가', '금융비용'] },
  { field: 'operatingCashFlowKrw', includes: ['영업활동현금흐름', '영업활동으로인한현금흐름'] }
];

/**
 * Total interest-bearing debt isn't a single standard DART account; it's the
 * sum of short- and long-term borrowings / bonds across the BS. Match those
 * 한글 names and accumulate.
 */
const DEBT_ACCOUNT_INCLUDES = [
  '단기차입금',
  '장기차입금',
  '유동성장기차입금',
  '사채',
  '유동성사채',
  '전환사채',
  '리스부채'
];

function buildMatchTargets(rows: DartFinancialRow[]): DartFinancialMatchTargets {
  const targets: DartFinancialMatchTargets = {
    totalAssetsKrw: null,
    totalLiabilitiesKrw: null,
    currentAssetsKrw: null,
    currentLiabilitiesKrw: null,
    cashAndEquivalentsKrw: null,
    totalEquityKrw: null,
    revenueKrw: null,
    operatingIncomeKrw: null,
    netIncomeKrw: null,
    interestExpenseKrw: null,
    operatingCashFlowKrw: null,
    priorYearRevenueKrw: null
  };

  for (const row of rows) {
    const amount = parseDartAmount(row.thstrm_amount);
    if (amount === null) continue;

    // 1) Stable IFRS taxonomy id match (preferred).
    const byId = ACCOUNT_ID_MAP[row.account_id?.trim()];
    if (byId && targets[byId] === null) {
      targets[byId] = amount;
      if (byId === 'revenueKrw' && targets.priorYearRevenueKrw === null) {
        targets.priorYearRevenueKrw = parseDartAmount(row.frmtrm_amount);
      }
      continue;
    }

    // 2) 한글 account-name substring fallback.
    const name = (row.account_nm ?? '').replace(/\s+/g, '');
    for (const matcher of ACCOUNT_NAME_MATCHERS) {
      if (targets[matcher.field] !== null) continue;
      const hit = matcher.includes.some((inc) => name.includes(inc.replace(/\s+/g, '')));
      const blocked = (matcher.excludes ?? []).some((exc) =>
        name.includes(exc.replace(/\s+/g, ''))
      );
      if (hit && !blocked) {
        targets[matcher.field] = amount;
        if (matcher.field === 'revenueKrw' && targets.priorYearRevenueKrw === null) {
          targets.priorYearRevenueKrw = parseDartAmount(row.frmtrm_amount);
        }
        break;
      }
    }
  }

  return targets;
}

function sumDebt(rows: DartFinancialRow[]): number | null {
  let total = 0;
  let matched = false;
  for (const row of rows) {
    if (row.sj_div !== 'BS') continue;
    const name = (row.account_nm ?? '').replace(/\s+/g, '');
    if (DEBT_ACCOUNT_INCLUDES.some((inc) => name.includes(inc))) {
      const amount = parseDartAmount(row.thstrm_amount);
      if (amount !== null) {
        total += amount;
        matched = true;
      }
    }
  }
  return matched ? total : null;
}

async function fetchCompany(
  key: string,
  corpCode: string,
  fetcher?: Fetcher
): Promise<DartCompanyResponse | null> {
  const params = new URLSearchParams({ crtfc_key: key, corp_code: corpCode });
  try {
    const body = (await fetchJsonWithRetry(`${DART_CORP_CODE}?${params.toString()}`, undefined, {
      fetcher
    })) as DartCompanyResponse;
    if (body.status !== '000') return null;
    return body;
  } catch {
    return null;
  }
}

async function fetchStatementRows(
  key: string,
  corpCode: string,
  bsnsYear: number,
  reprtCode: string,
  fsDiv: 'CFS' | 'OFS',
  fetcher?: Fetcher
): Promise<DartFinancialRow[]> {
  const params = new URLSearchParams({
    crtfc_key: key,
    corp_code: corpCode,
    bsns_year: String(bsnsYear),
    reprt_code: reprtCode,
    fs_div: fsDiv
  });
  const body = (await fetchJsonWithRetry(`${DART_FNLTT_ALL}?${params.toString()}`, undefined, {
    fetcher
  })) as DartFnlttResponse;
  // status '013' = 조회된 데이터 없음 (no data) — treat as empty, not an error.
  if (body.status === '013') return [];
  if (body.status !== '000') {
    throw new Error(`DART fnlttSinglAcntAll ${body.status}: ${body.message}`);
  }
  return body.list ?? [];
}

/**
 * Fetch a single company's financial-statement snapshot from OpenDART.
 *
 * Fail-closed: returns `null` when DART_API_KEY is unset, on HTTP/timeout
 * error, or when the response carries no usable totals. Never throws into the
 * caller, so the existing heuristic / document-upload credit path keeps
 * working unchanged.
 */
export async function fetchDartFinancials(
  corpCode: string,
  options: DartFinancialsOptions = {}
): Promise<DartFinancialSnapshot | null> {
  const key = resolveKey();
  if (!key) return null;
  if (!/^\d{8}$/.test(corpCode.trim())) return null;

  const fiscalYear = options.bsnsYear ?? new Date().getFullYear() - 1;
  const reprtCode = options.reprtCode ?? DART_REPRT_ANNUAL;
  const preferConsolidated = options.preferConsolidated ?? true;
  const manifest: Record<string, string> = {};
  const ts = () => new Date().toISOString();

  const fsOrder: Array<'CFS' | 'OFS'> = preferConsolidated ? ['CFS', 'OFS'] : ['OFS', 'CFS'];

  let rows: DartFinancialRow[] = [];
  let usedFsDiv: 'CFS' | 'OFS' = fsOrder[0]!;

  for (const fsDiv of fsOrder) {
    try {
      const fetched = await fetchStatementRows(
        key,
        corpCode.trim(),
        fiscalYear,
        reprtCode,
        fsDiv,
        options.fetcher
      );
      manifest[fsDiv] = `DART fnlttSinglAcntAll ${fsDiv} ${fiscalYear} (${fetched.length} rows)`;
      if (fetched.length > 0) {
        rows = fetched;
        usedFsDiv = fsDiv;
        break;
      }
    } catch (error) {
      manifest[fsDiv] = `DART fnlttSinglAcntAll ${fsDiv} FAILED: ${(error as Error).message}`;
    }
  }

  if (rows.length === 0) return null;

  const targets = buildMatchTargets(rows);
  const totalDebtKrw = sumDebt(rows);

  // Require at least a balance-sheet anchor; otherwise the snapshot is unusable
  // and we fail closed so the heuristic path is not displaced by an empty pull.
  if (targets.totalAssetsKrw === null && targets.revenueKrw === null) return null;

  const company = await fetchCompany(key, corpCode.trim(), options.fetcher);
  const stockCode = company?.stock_code?.trim() || null;
  const currency = rows.find((row) => row.currency)?.currency?.trim() || 'KRW';

  manifest.fetchedAt = ts();

  return {
    corpCode: corpCode.trim(),
    corpName: company?.corp_name?.trim() || null,
    stockCode,
    isListed: Boolean(stockCode),
    indutyCode: company?.induty_code?.trim() || null,
    fiscalYear,
    reprtCode,
    fsDiv: usedFsDiv,
    currency,
    totalAssetsKrw: targets.totalAssetsKrw,
    totalLiabilitiesKrw: targets.totalLiabilitiesKrw,
    currentAssetsKrw: targets.currentAssetsKrw,
    currentLiabilitiesKrw: targets.currentLiabilitiesKrw,
    cashAndEquivalentsKrw: targets.cashAndEquivalentsKrw,
    totalDebtKrw,
    totalEquityKrw: targets.totalEquityKrw,
    revenueKrw: targets.revenueKrw,
    operatingIncomeKrw: targets.operatingIncomeKrw,
    netIncomeKrw: targets.netIncomeKrw,
    interestExpenseKrw: targets.interestExpenseKrw,
    priorYearRevenueKrw: targets.priorYearRevenueKrw,
    operatingCashFlowKrw: targets.operatingCashFlowKrw,
    sourceManifest: manifest
  };
}

/**
 * Map a DART KSIC `induty_code` onto the credit engine's coarse sector enum.
 * Best-effort: unknown / missing codes fall back to GENERAL.
 */
function inferIndustry(indutyCode?: string | null): IndustrySector {
  const code = indutyCode?.trim() ?? '';
  if (!code) return 'GENERAL';
  const major = Number(code.slice(0, 2));
  if (!Number.isFinite(major)) return 'GENERAL';
  if (major >= 10 && major <= 34) return 'MANUFACTURING';
  if (major >= 58 && major <= 63) return 'TECH';
  if (major >= 64 && major <= 66) return 'FINANCE';
  if (major >= 45 && major <= 47) return 'RETAIL';
  if (major >= 49 && major <= 52) return 'LOGISTICS';
  if (major >= 86 && major <= 88) return 'HEALTHCARE';
  if (major === 56) return 'F_AND_B';
  if (major >= 41 && major <= 42) return 'CONSTRUCTION';
  return 'GENERAL';
}

/**
 * Adapt a DART snapshot into the `TenantFinancials` shape consumed by
 * `assessCredit` / `projectRentDefault`. Returns `null` when the snapshot is
 * missing fields the credit engine treats as required (it expects non-null
 * numbers, so we only emit when the core balance-sheet + income anchors are
 * present). Zero-fills the few optional cash-flow / interest fields the engine
 * tolerates as 0.
 */
export function dartSnapshotToTenantFinancials(
  snapshot: DartFinancialSnapshot | null,
  meta: { companyId?: string; industry?: IndustrySector; indutyCode?: string | null } = {}
): TenantFinancials | null {
  if (!snapshot) return null;
  const {
    totalAssetsKrw,
    totalLiabilitiesKrw,
    currentAssetsKrw,
    currentLiabilitiesKrw,
    revenueKrw,
    operatingIncomeKrw
  } = snapshot;

  if (
    totalAssetsKrw === null ||
    totalLiabilitiesKrw === null ||
    currentAssetsKrw === null ||
    currentLiabilitiesKrw === null ||
    revenueKrw === null ||
    operatingIncomeKrw === null
  ) {
    return null;
  }

  return {
    companyId: meta.companyId ?? `DART_${snapshot.corpCode}`,
    companyName: snapshot.corpName ?? snapshot.corpCode,
    industry: meta.industry ?? inferIndustry(meta.indutyCode ?? snapshot.indutyCode),
    fiscalYear: snapshot.fiscalYear,
    isListed: snapshot.isListed,
    totalAssetsKrw,
    totalLiabilitiesKrw,
    currentAssetsKrw,
    currentLiabilitiesKrw,
    cashAndEquivalentsKrw: snapshot.cashAndEquivalentsKrw ?? 0,
    totalDebtKrw: snapshot.totalDebtKrw ?? 0,
    revenueKrw,
    operatingIncomeKrw,
    netIncomeKrw: snapshot.netIncomeKrw ?? operatingIncomeKrw,
    interestExpenseKrw: snapshot.interestExpenseKrw ?? 0,
    operatingCashFlowKrw: snapshot.operatingCashFlowKrw ?? 0,
    priorYearRevenueKrw: snapshot.priorYearRevenueKrw ?? undefined
  };
}

/**
 * One-shot convenience: fetch a company's DART financials and adapt them
 * straight into `TenantFinancials`. Fail-closed end to end — `null` means the
 * caller should keep its existing heuristic / manual credit input.
 */
export async function fetchDartTenantFinancials(
  corpCode: string,
  options: DartFinancialsOptions & {
    companyId?: string;
    industry?: IndustrySector;
    indutyCode?: string | null;
  } = {}
): Promise<TenantFinancials | null> {
  const snapshot = await fetchDartFinancials(corpCode, options);
  return dartSnapshotToTenantFinancials(snapshot, {
    companyId: options.companyId,
    industry: options.industry,
    indutyCode: options.indutyCode
  });
}
