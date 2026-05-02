/**
 * Quarterly publication narrative orchestrator.
 *
 * Takes the aggregator output + transaction comps + approved House
 * views and turns them into the three structured strings the AI
 * narrative generator expects. Pure formatting — no DB / network —
 * so the publication page can prepare the input deterministically
 * regardless of whether the OpenAI key is set (we only call the
 * generator when there's a key).
 *
 * The matrices passed in are the aggregator's existing shape:
 * `Awaited<ReturnType<typeof aggregateCapRates>>['fromTransactions']`.
 * No new types needed.
 */
import type { CapRateBucket } from './cap-rate-aggregator';

type TransactionRow = {
  transactionDate: Date | null;
  market: string;
  region: string | null;
  assetClass: string | null;
  assetTier: string | null;
  priceKrw: number | null;
  capRatePct: number | null;
};

type HouseViewRow = {
  title: string;
  summary: string | null;
};

function formatCap(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatPriceKrw(value: number | null) {
  if (value === null) return '—';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}조 KRW`;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억 KRW`;
  return `${Math.round(value).toLocaleString()} KRW`;
}

/**
 * Render the cap-rate matrix as a compact text table the LLM can read.
 * Only the top 12 buckets by transaction count are included so the
 * prompt stays bounded. Empty markets / tiers fall through.
 */
export function renderCapRateMatrixForPrompt(buckets: CapRateBucket[]): string {
  if (buckets.length === 0) return '(no rows)';
  const sorted = [...buckets].sort((a, b) => b.count - a.count).slice(0, 12);
  const lines = sorted.map(
    (b) =>
      `${b.market}/${b.region ?? '-'} ${b.assetClass ?? '-'}/${b.assetTier ?? 'Untiered'}: ` +
      `n=${b.count} median ${formatCap(b.medianPct)} (${formatCap(b.minPct)}–${formatCap(b.maxPct)})`
  );
  return lines.join('\n');
}

export function renderTopTransactionsForPrompt(rows: TransactionRow[]): string {
  if (rows.length === 0) return '(no transactions)';
  // Top 6 by price, descending. Anything without a price falls to the
  // bottom; the agent already knows to weight large deals.
  const sorted = [...rows].sort((a, b) => (b.priceKrw ?? 0) - (a.priceKrw ?? 0)).slice(0, 6);
  const lines = sorted.map((row) => {
    const date = row.transactionDate?.toISOString().slice(0, 10) ?? 'undated';
    return (
      `${date} · ${row.market}/${row.region ?? '-'} · ` +
      `${row.assetClass ?? '-'}/${row.assetTier ?? 'Untiered'} · ` +
      `${formatPriceKrw(row.priceKrw)} · cap ${row.capRatePct != null ? formatCap(row.capRatePct) : '—'}`
    );
  });
  return lines.join('\n');
}

export function renderHouseViewBulletsForPrompt(rows: HouseViewRow[]): string {
  if (rows.length === 0) return '(no approved house views this quarter)';
  return rows
    .slice(0, 8)
    .map((row) => `- ${row.title}${row.summary ? ` — ${row.summary}` : ''}`)
    .join('\n');
}

export type QuarterlyNarrativePromptInputs = {
  capRateMatrix: string;
  topTransactions: string;
  houseViewBullets: string;
};

export function buildQuarterlyNarrativeInputs(input: {
  buckets: CapRateBucket[];
  transactions: TransactionRow[];
  houseViews: HouseViewRow[];
}): QuarterlyNarrativePromptInputs {
  return {
    capRateMatrix: renderCapRateMatrixForPrompt(input.buckets),
    topTransactions: renderTopTransactionsForPrompt(input.transactions),
    houseViewBullets: renderHouseViewBulletsForPrompt(input.houseViews)
  };
}
