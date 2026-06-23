/**
 * Comparative financial-statement view model.
 *
 * Maps the summary figures stored on `FinancialStatement` (revenue → operating
 * income → net income; balance-sheet totals; cash-flow figures) into a
 * period-comparative structure — Income Statement / Balance Sheet / Cash Flow —
 * with derived subtotals, in the institutional layout the IM/PDF render and the
 * Excel export (#139) consume. Pure (no DB/IO) so it is unit-testable; the
 * `fromAssetStatements` adapter coerces the Prisma `Decimal` payload at the
 * boundary via `toNumberOrNull`.
 *
 * Granularity follows the schema (summary lines). Per-line `FinancialLineItem`
 * detail is a later layer; this is the always-available comparative core.
 */
import { round, toNumberOrNull } from '@/lib/math';
import type { XlsxWorkbookSpec } from '@/lib/services/exports/xlsx';

/** One period's stored figures, already coerced to numbers (KRW). */
export type StatementPeriodInput = {
  label: string;
  revenue: number | null;
  ebitda: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  interestExpense: number | null;
  cash: number | null;
  totalDebt: number | null;
  totalAssets: number | null;
  totalEquity: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  /** Optional extracted detail lines (FinancialLineItem) for this period. */
  lineItems?: { key: string; label: string; value: number | null }[];
};

export type StatementRowKind = 'line' | 'subtotal' | 'total';

export type StatementRow = {
  label: string;
  kind: StatementRowKind;
  indent: boolean;
  /** One value per period, aligned with `StatementView.periods`. */
  values: (number | null)[];
  /**
   * YoY % vs the next-older period (periods are newest-first), aligned with
   * `values`; the oldest column is null. Null where either endpoint is null/0.
   */
  yoy?: (number | null)[];
  /**
   * Common-size %: this row as a % of the section base (IS→매출액, BS→자산총계,
   * CF→영업활동현금흐름). Aligned with `values`; null for the 상세 항목 section.
   */
  commonSize?: (number | null)[];
  /** Trailing CAGR % over all periods (≥3 comparable periods); null otherwise. */
  cagrPct?: number | null;
};

export type StatementSection = {
  title: string;
  rows: StatementRow[];
};

/** Per-period data-integrity flags (a non-articulating statement shouldn't be trusted). */
export type StatementIntegrity = {
  label: string;
  flags: string[];
};

/** Per-period filing completeness over the canonical metric set. */
export type StatementCoverage = {
  label: string;
  present: number;
  total: number;
  coveragePct: number;
};

export type StatementView = {
  periods: string[];
  sections: StatementSection[];
  /** One entry per period (aligned with `periods`). */
  integrity: StatementIntegrity[];
  /** One entry per period (aligned with `periods`). */
  coverage: StatementCoverage[];
};

/** The canonical metric set a "complete" filing populates. */
const COVERAGE_KEYS = [
  'revenue',
  'ebitda',
  'operatingIncome',
  'netIncome',
  'interestExpense',
  'cash',
  'totalDebt',
  'totalAssets',
  'totalEquity',
  'currentAssets',
  'currentLiabilities',
  'operatingCashFlow',
  'capex'
] as const;

export function statementCoverage(periods: StatementPeriodInput[]): StatementCoverage[] {
  return periods.map((p) => {
    const present = COVERAGE_KEYS.filter((k) => p[k] !== null && p[k] !== undefined).length;
    return {
      label: p.label,
      present,
      total: COVERAGE_KEYS.length,
      coveragePct: Math.round((present / COVERAGE_KEYS.length) * 100)
    };
  });
}

/** Trailing CAGR % over the period series (newest-first); null unless ≥3 + positive endpoints. */
function cagrOf(values: (number | null)[]): number | null {
  const defined = values.filter((v): v is number => v !== null);
  if (values.length < 3 || defined.length < 3) return null;
  const latest = values[0];
  const earliest = values[values.length - 1];
  const n = values.length;
  if (latest === null || earliest === null || latest <= 0 || earliest <= 0) return null;
  return round((Math.pow(latest / earliest, 1 / (n - 1)) - 1) * 100, 1);
}

/**
 * Flag statements that don't articulate or look mis-parsed, so the viewer
 * doesn't render an impaired/garbage statement as authoritative. Conservative:
 * only flags clear violations, never on missing data.
 */
export function checkStatementIntegrity(periods: StatementPeriodInput[]): StatementIntegrity[] {
  return periods.map((p) => {
    const flags: string[] = [];
    if (p.totalEquity !== null && p.totalEquity < 0) flags.push('자본잠식 (음수 자본)');
    if (p.totalAssets !== null && p.totalEquity !== null && p.totalEquity > p.totalAssets) {
      flags.push('자본 > 자산 (비정합)');
    }
    if (p.ebitda !== null && p.operatingIncome !== null && p.operatingIncome > p.ebitda) {
      flags.push('영업이익 > EBITDA (비정합)');
    }
    if (p.revenue !== null && p.revenue > 0 && p.netIncome !== null && p.netIncome > p.revenue) {
      flags.push('당기순이익 > 매출 (확인 필요)');
    }
    if (p.totalAssets !== null && p.currentAssets !== null && p.currentAssets > p.totalAssets + 1) {
      flags.push('유동자산 > 자산총계 (비정합)');
    }
    if (
      p.totalAssets !== null &&
      p.currentLiabilities !== null &&
      p.currentLiabilities > p.totalAssets + 1
    ) {
      // Current liabilities cannot exceed total assets on an articulating
      // balance sheet (they are a subset of total liabilities ≤ assets). A
      // breach is a parse/scale error, not a real position.
      flags.push('유동부채 > 자산총계 (비정합)');
    }
    if (p.revenue !== null && p.revenue < 0) {
      // Revenue (매출액) is a gross top-line and is non-negative by construction;
      // a negative value indicates a mis-parsed sign or a netting error.
      flags.push('매출액 음수 (비정합)');
    }
    return { label: p.label, flags };
  });
}

function sub(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) - (b ?? 0);
}

/** YoY % vs the next-older period (periods newest-first); oldest column null. */
function yoyOf(values: (number | null)[]): (number | null)[] {
  return values.map((v, i) => {
    const prev = values[i + 1];
    if (v === null || prev == null || prev === 0) return null;
    return round(((v - prev) / Math.abs(prev)) * 100, 1);
  });
}

/**
 * Row value as a % of the per-period section base. The base must be positive:
 * common-size analysis expresses each line as a share of a positive aggregate
 * (revenue / total assets / operating cash flow). A non-positive base — e.g. a
 * period with negative operating cash flow — would flip the sign of every
 * percentage and render a meaningless figure, so we collapse to null instead.
 */
function commonSizeOf(values: (number | null)[], basis: (number | null)[]): (number | null)[] {
  return values.map((v, i) => {
    const b = basis[i];
    if (v === null || b == null || b <= 0) return null;
    return round((v / b) * 100, 1);
  });
}

/** Per-period base for a section's common-size (IS→revenue, BS→assets, CF→OCF). */
function sectionBasis(title: string, periods: StatementPeriodInput[]): (number | null)[] | null {
  if (title === '손익계산서') return periods.map((p) => p.revenue);
  if (title === '재무상태표') return periods.map((p) => p.totalAssets);
  if (title === '현금흐름표') return periods.map((p) => p.operatingCashFlow);
  return null; // 상세 항목: no common-size base
}

function row(
  label: string,
  kind: StatementRowKind,
  indent: boolean,
  pick: (p: StatementPeriodInput) => number | null,
  periods: StatementPeriodInput[]
): StatementRow {
  return { label, kind, indent, values: periods.map(pick) };
}

/**
 * Build the comparative IS / BS / CF view from per-period summary figures.
 * Periods are rendered in the order given (caller decides newest-first vs
 * chronological).
 */
export function buildStatementView(periods: StatementPeriodInput[]): StatementView {
  const incomeStatement: StatementSection = {
    title: '손익계산서',
    rows: [
      row('매출액', 'line', true, (p) => p.revenue, periods),
      row('EBITDA', 'line', true, (p) => p.ebitda, periods),
      row('영업이익', 'subtotal', false, (p) => p.operatingIncome, periods),
      row(
        '이자비용',
        'line',
        true,
        (p) => (p.interestExpense === null ? null : -Math.abs(p.interestExpense)),
        periods
      ),
      row('당기순이익', 'total', false, (p) => p.netIncome, periods)
    ]
  };

  const balanceSheet: StatementSection = {
    title: '재무상태표',
    rows: [
      row('유동자산', 'line', true, (p) => p.currentAssets, periods),
      row('자산총계', 'subtotal', false, (p) => p.totalAssets, periods),
      row('유동부채', 'line', true, (p) => p.currentLiabilities, periods),
      row('총차입금', 'line', true, (p) => p.totalDebt, periods),
      // 부채총계 = 자산총계 − 자본총계 (derived; the schema stores assets + equity).
      row('부채총계', 'subtotal', false, (p) => sub(p.totalAssets, p.totalEquity), periods),
      row('자본총계', 'total', false, (p) => p.totalEquity, periods)
    ]
  };

  const cashFlow: StatementSection = {
    title: '현금흐름표',
    rows: [
      row('영업활동현금흐름', 'subtotal', false, (p) => p.operatingCashFlow, periods),
      row(
        '자본적지출(CAPEX)',
        'line',
        true,
        (p) => (p.capex === null ? null : -Math.abs(p.capex)),
        periods
      ),
      // 잉여현금흐름 = 영업활동현금흐름 − CAPEX.
      row(
        '잉여현금흐름(FCF)',
        'subtotal',
        false,
        (p) => sub(p.operatingCashFlow, p.capex === null ? null : Math.abs(p.capex)),
        periods
      ),
      row('기말 현금및현금성자산', 'total', false, (p) => p.cash, periods)
    ]
  };

  const sections: StatementSection[] = [incomeStatement, balanceSheet, cashFlow];

  // Detail lines (FinancialLineItem): union of keys across periods in first-seen
  // order, each row carrying the per-period value (null where a period lacks it).
  const order: string[] = [];
  const labelByKey = new Map<string, string>();
  for (const p of periods) {
    for (const li of p.lineItems ?? []) {
      if (!labelByKey.has(li.key)) {
        order.push(li.key);
        labelByKey.set(li.key, li.label);
      }
    }
  }
  if (order.length > 0) {
    sections.push({
      title: '상세 항목',
      rows: order.map((key) => ({
        label: labelByKey.get(key) ?? key,
        kind: 'line',
        indent: true,
        values: periods.map((p) => p.lineItems?.find((li) => li.key === key)?.value ?? null)
      }))
    });
  }

  // Attach YoY + common-size to every row (pure, aligned with `periods`).
  for (const section of sections) {
    const basis = sectionBasis(section.title, periods);
    for (const r of section.rows) {
      r.yoy = yoyOf(r.values);
      r.cagrPct = cagrOf(r.values);
      if (basis) r.commonSize = commonSizeOf(r.values, basis);
    }
  }

  return {
    periods: periods.map((p) => p.label),
    sections,
    integrity: checkStatementIntegrity(periods),
    coverage: statementCoverage(periods)
  };
}

/** A structural subset of the Prisma FinancialStatement payload (Decimal-bearing). */
type AssetStatementLike = {
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  revenueKrw: unknown;
  ebitdaKrw: unknown;
  operatingIncomeKrw: unknown;
  netIncomeKrw: unknown;
  interestExpenseKrw: unknown;
  cashKrw: unknown;
  totalDebtKrw: unknown;
  totalAssetsKrw: unknown;
  totalEquityKrw: unknown;
  currentAssetsKrw: unknown;
  currentLiabilitiesKrw: unknown;
  operatingCashFlowKrw: unknown;
  capexKrw: unknown;
  lineItems?: { lineKey: string; lineLabel: string; valueKrw: unknown }[];
};

/** Coerce stored Prisma statements (Decimal columns) into period inputs. */
export function fromAssetStatements(statements: AssetStatementLike[]): StatementPeriodInput[] {
  return statements.map((s) => ({
    label: s.fiscalYear ? `${s.fiscalYear}${s.fiscalPeriod ? ` ${s.fiscalPeriod}` : ''}` : '—',
    revenue: toNumberOrNull(s.revenueKrw),
    ebitda: toNumberOrNull(s.ebitdaKrw),
    operatingIncome: toNumberOrNull(s.operatingIncomeKrw),
    netIncome: toNumberOrNull(s.netIncomeKrw),
    interestExpense: toNumberOrNull(s.interestExpenseKrw),
    cash: toNumberOrNull(s.cashKrw),
    totalDebt: toNumberOrNull(s.totalDebtKrw),
    totalAssets: toNumberOrNull(s.totalAssetsKrw),
    totalEquity: toNumberOrNull(s.totalEquityKrw),
    currentAssets: toNumberOrNull(s.currentAssetsKrw),
    currentLiabilities: toNumberOrNull(s.currentLiabilitiesKrw),
    operatingCashFlow: toNumberOrNull(s.operatingCashFlowKrw),
    capex: toNumberOrNull(s.capexKrw),
    lineItems: (s.lineItems ?? []).map((li) => ({
      key: li.lineKey,
      label: li.lineLabel,
      value: toNumberOrNull(li.valueKrw)
    }))
  }));
}

/** Map a statement view to a multi-sheet Excel workbook spec (#139 builder). */
export function statementViewToXlsxSpec(view: StatementView, title: string): XlsxWorkbookSpec {
  const periodCols = view.periods.map((label, i) => ({
    header: label,
    key: `p${i}`,
    type: 'currency' as const,
    width: 16
  }));
  // Analysis columns (latest period): common-size %, YoY %, and CAGR % when ≥3 periods.
  const hasCagr = view.periods.length >= 3;
  const analysisCols = [
    { header: '구성비(%)', key: 'cs', type: 'number' as const, width: 12 },
    { header: 'YoY(%)', key: 'yoy', type: 'number' as const, width: 12 },
    ...(hasCagr ? [{ header: 'CAGR(%)', key: 'cagr', type: 'number' as const, width: 12 }] : [])
  ];
  return {
    title,
    sheets: view.sections.map((section) => {
      const dataRows = section.rows.filter((r) => r.kind !== 'total');
      const totalRow = section.rows.find((r) => r.kind === 'total');
      const toRecord = (r: StatementRow) => {
        const rec: Record<string, string | number | null> = {
          item: r.indent ? `  ${r.label}` : r.label
        };
        r.values.forEach((v, i) => {
          rec[`p${i}`] = v;
        });
        rec.cs = r.commonSize?.[0] ?? null;
        rec.yoy = r.yoy?.[0] ?? null;
        if (hasCagr) rec.cagr = r.cagrPct ?? null;
        return rec;
      };
      return {
        name: section.title,
        columns: [
          { header: '과목', key: 'item', type: 'text' as const, width: 28 },
          ...periodCols,
          ...analysisCols
        ],
        rows: dataRows.map(toRecord),
        totals: totalRow ? toRecord(totalRow) : undefined
      };
    })
  };
}
