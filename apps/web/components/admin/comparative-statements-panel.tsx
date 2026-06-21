import { Card } from '@/components/ui/card';
import type { AssetFinancialStatement } from '@/lib/services/financial-statements';
import {
  buildStatementView,
  fromAssetStatements,
  type StatementRow,
  type StatementView
} from '@/lib/services/financials/statement-view';
import {
  buildStatementCreditInsights,
  type StatementCreditInsights
} from '@/lib/services/credit/insights';

type Props = {
  statements: AssetFinancialStatement[];
};

function fmt(value: number | null): string {
  if (value === null) return '—';
  // Stored figures are KRW; show in 백만원 (millions) to match audited layout.
  const millions = value / 1_000_000;
  const abs = Math.abs(millions);
  const s = abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return millions < 0 ? `(${s})` : s;
}

function rowClass(kind: StatementRow['kind']): string {
  if (kind === 'total') {
    return 'bg-[hsl(var(--accent-tint))] font-semibold text-[hsl(var(--foreground))]';
  }
  if (kind === 'subtotal') {
    return 'bg-[hsl(var(--panel-alt))] font-semibold';
  }
  return '';
}

function StatementTable({ view }: { view: StatementView }) {
  return (
    <div className="space-y-5">
      {view.sections.map((section) => (
        <div key={section.title} className="overflow-x-auto rounded-[14px] border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--panel-alt))] text-xs uppercase tracking-wide text-[hsl(var(--foreground-muted))]">
                <th className="px-4 py-2 text-left font-semibold">{section.title}</th>
                {view.periods.map((p) => (
                  <th key={p} className="px-4 py-2 text-right font-semibold tabular-nums">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {section.rows.map((r) => (
                <tr key={`${section.title}-${r.label}`} className={rowClass(r.kind)}>
                  <td
                    className={`px-4 py-2 ${r.indent ? 'pl-8 text-[hsl(var(--foreground-muted))]' : ''}`}
                  >
                    {r.label}
                  </td>
                  {r.values.map((v, i) => (
                    <td key={i} className="px-4 py-2 text-right align-top tabular-nums">
                      <div>{fmt(v)}</div>
                      {r.yoy?.[i] != null ? (
                        <div className="text-[10px] font-normal text-[hsl(var(--foreground-faint))]">
                          YoY {r.yoy[i]! >= 0 ? '+' : ''}
                          {r.yoy[i]!.toFixed(1)}%
                        </div>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function Chip({ text, tone }: { text: string; tone: 'bad' | 'warn' | 'good' }) {
  const cls =
    tone === 'bad'
      ? 'border-[hsl(var(--danger)/0.25)] bg-[hsl(var(--danger-tint))] text-[hsl(var(--danger))]'
      : tone === 'warn'
        ? 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-tint))] text-[hsl(var(--warning))]'
        : 'border-[hsl(var(--success)/0.25)] bg-[hsl(var(--success-tint))] text-[hsl(var(--success))]';
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {text}
    </span>
  );
}

/** Multi-period credit insights derived from the counterparty's filings. */
function CreditInsightStrip({ insights }: { insights: StatementCreditInsights }) {
  const { marginalFirm, trend, freshness } = insights;
  const hasAny =
    marginalFirm.isMarginalFirm ||
    freshness.flag ||
    trend.flags.length > 0 ||
    trend.deteriorating.length > 0 ||
    trend.improving.length > 0;
  if (!hasAny) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {marginalFirm.isMarginalFirm ? <Chip text={marginalFirm.label} tone="bad" /> : null}
      {trend.flags.map((f) => (
        <Chip key={f} text={f} tone="bad" />
      ))}
      {trend.deteriorating.map((f) => (
        <Chip key={f} text={`▼ ${f}`} tone="warn" />
      ))}
      {trend.improving.map((f) => (
        <Chip key={f} text={`▲ ${f}`} tone="good" />
      ))}
      {freshness.flag ? <Chip text={freshness.flag} tone="warn" /> : null}
    </div>
  );
}

/**
 * Comparative IS / BS / CF (+ detail line items) per counterparty, built from
 * the same `buildStatementView` model the Excel export (#140) uses — so screen,
 * Excel, and PDF stay in lockstep. Additive to FinancialStatementsPanel (which
 * shows per-period figures + KR credit ratios); this is the period-comparative
 * statement layout. Renders nothing when there are no statements.
 */
export function ComparativeStatementsPanel({ statements }: Props) {
  if (statements.length === 0) return null;

  // Group by counterparty; build one comparative view per group (fetch is
  // already ordered counterparty → fiscalYear desc).
  const groups = new Map<string, AssetFinancialStatement[]>();
  for (const s of statements) {
    const list = groups.get(s.counterpartyId) ?? [];
    list.push(s);
    groups.set(s.counterpartyId, list);
  }

  return (
    <Card>
      <div className="eyebrow">재무제표 (비교식)</div>
      <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--foreground-muted))]">
        손익계산서 · 재무상태표 · 현금흐름표를 기간 비교식으로. 단위: 백만원. 동일 모델이 Excel
        내보내기 · PDF에 적용됩니다.
      </p>
      <div className="mt-5 space-y-8">
        {[...groups.entries()].map(([counterpartyId, rows]) => {
          const view = buildStatementView(fromAssetStatements(rows));
          const insights = buildStatementCreditInsights(rows);
          return (
            <div key={counterpartyId}>
              <div className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
                {rows[0]?.counterparty?.name ?? counterpartyId}
              </div>
              <CreditInsightStrip insights={insights} />
              {view.integrity.some((p) => p.flags.length > 0) ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {view.integrity.flatMap((p) =>
                    p.flags.map((f) => (
                      <Chip key={`${p.label}-${f}`} text={`${p.label}: ${f}`} tone="bad" />
                    ))
                  )}
                </div>
              ) : null}
              <StatementTable view={view} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
