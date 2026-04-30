import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PrintImButton } from '@/components/marketing/print-im-button';
import { generateQuarterlyMarketNarrative } from '@/lib/ai/openai';
import { prisma } from '@/lib/db/prisma';
import { aggregateCapRates } from '@/lib/services/research/cap-rate-aggregator';
import { buildQuarterlyNarrativeInputs } from '@/lib/services/research/quarterly-narrative';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type SearchParams = {
  quarter?: string;
};

/**
 * Browser-printable quarterly research report.
 *
 * Why a print page instead of server-side PDF: we already have the
 * print-stylesheet pattern wired (`/sample-report` uses it), and adding
 * a Puppeteer / wkhtmltopdf dependency for one route nets a build-time
 * cost that hasn't earned its keep yet. Operator hits Cmd-P and saves
 * to PDF; the layout is bounded by the print stylesheet's page-break
 * rules so it produces a clean multi-page document.
 *
 * What this surfaces (CBRE-quarterly-style outline):
 *   - Cover: market + quarter + asset-class scope.
 *   - Submarket × tier cap-rate matrix from the aggregator.
 *   - Quarter's transaction comps (deal-level disclosure).
 *   - Approved HOUSE-view ResearchSnapshots (the editorial layer).
 */

const QUARTER_RE = /^(\d{4})Q([1-4])$/;

function parseQuarter(value: string | undefined): { label: string; start: Date; end: Date } {
  const fallback = (() => {
    const now = new Date();
    const month = now.getUTCMonth();
    const q = Math.floor(month / 3) + 1;
    return { year: now.getUTCFullYear(), q };
  })();
  const parsed = value && QUARTER_RE.exec(value);
  const year = parsed ? Number(parsed[1]) : fallback.year;
  const q = parsed ? Number(parsed[2]) : fallback.q;
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999));
  return { label: `${year}Q${q}`, start, end };
}

function formatCap(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatPriceKrw(value: number | null) {
  if (value === null) return '—';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}조 KRW`;
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억 KRW`;
  return `${formatNumber(value, 0)} KRW`;
}

export default async function QuarterlyResearchPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await props.searchParams;
  const quarter = parseQuarter(sp.quarter);

  if (!quarter) notFound();

  const [aggregation, transactions, houseViews, marketUniverses] = await Promise.all([
    aggregateCapRates({ since: quarter.start }),
    prisma.transactionComp.findMany({
      where: {
        capRatePct: { not: null },
        OR: [
          { transactionDate: null },
          { transactionDate: { gte: quarter.start, lte: quarter.end } }
        ]
      },
      orderBy: { transactionDate: 'desc' },
      take: 30,
      include: { asset: { select: { assetCode: true, name: true } } }
    }),
    prisma.researchSnapshot.findMany({
      where: {
        viewType: 'HOUSE',
        approvalStatus: 'APPROVED',
        snapshotDate: { gte: quarter.start, lte: quarter.end }
      },
      orderBy: { snapshotDate: 'desc' },
      include: {
        marketUniverse: { select: { label: true } },
        submarket: { select: { label: true } },
        asset: { select: { assetCode: true, name: true } }
      }
    }),
    prisma.marketUniverse.count()
  ]);

  // Editorial narrative is best-effort: when OPENAI_API_KEY is absent
  // the helper returns null and the page falls back to a "no narrative
  // generated" badge instead of crashing.
  const narrativeInputs = buildQuarterlyNarrativeInputs({
    buckets: aggregation.fromTransactions.length > 0
      ? aggregation.fromTransactions
      : aggregation.fromIndicators,
    transactions,
    houseViews: houseViews.map((row) => ({ title: row.title, summary: row.summary }))
  });
  const narrative = await generateQuarterlyMarketNarrative({
    quarterLabel: quarter.label,
    capRateMatrix: narrativeInputs.capRateMatrix,
    topTransactions: narrativeInputs.topTransactions,
    houseViewBullets: narrativeInputs.houseViewBullets
  });

  return (
    <main className="space-y-6">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Research</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            {quarter.label} House view publication
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Print-friendly quarterly research report. Cmd-P (or
            <span className="mx-1 font-mono text-xs">Print</span>) to save as PDF. Edit the
            URL parameter <code className="ml-1 rounded bg-white/5 px-1.5 py-0.5">?quarter=2026Q1</code>
            to render a different quarter.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrintImButton />
          <Link href="/admin/research">
            <Button variant="ghost">← Workspace</Button>
          </Link>
        </div>
      </div>

      <header className="print-break rounded-[32px] border border-white/10 bg-slate-950/60 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="good">House view</Badge>
          <Badge>{quarter.label}</Badge>
          <Badge>{marketUniverses} markets tracked</Badge>
        </div>
        <h1 className="mt-5 text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-white">
          Korea Real Estate Quarterly
          <br />
          {quarter.label}
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-slate-300">
          Internal research view assembled from approved HOUSE-view ResearchSnapshots, the
          submarket × tier cap-rate aggregator, and transaction comps recorded between{' '}
          {formatDate(quarter.start)} and {formatDate(quarter.end)}. Every claim cites the
          underlying ResearchSnapshot or TransactionComp row.
        </p>
        <p className="mt-4 max-w-3xl text-sm text-slate-500">
          This is an internal IC document — not a public-distribution research piece. Numbers in
          the matrix below are MEDIANS across the bucket; tail behavior is in the
          <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5">/admin/research/comps</code>
          deep-dive.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="eyebrow">House view narrative</div>
          {narrative ? (
            <Badge tone="good">AI generated · ED review required</Badge>
          ) : (
            <Badge tone="warn">no narrative · OPENAI_API_KEY missing</Badge>
          )}
        </div>
        {narrative ? (
          <div className="space-y-3 rounded-[18px] border border-white/10 bg-white/[0.03] p-5 text-sm leading-7 text-slate-200">
            {narrative.split(/\n{2,}/).map((paragraph, i) => (
              <p key={i}>{paragraph.trim()}</p>
            ))}
            <p className="text-xs text-slate-500">
              Generated from the cap-rate matrix + top transactions + approved house views below.
              Editor must review and accept before this PDF is distributed externally — the badge
              above goes green only after approval (see review-gate workflow).
            </p>
          </div>
        ) : (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            Narrative generator skipped: no OPENAI_API_KEY in this environment. The publication
            still renders the matrices, transactions, and approved house views below — the
            narrative is editorial scaffolding, not a primary data source.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <div className="eyebrow">Cap-rate matrix · deal-level (TransactionComp)</div>
          <p className="mt-1 text-sm text-slate-400">
            Aggregated from {aggregation.totals.transactionRows} transactions across{' '}
            {aggregation.totals.distinctSubmarkets} submarkets. Compare against the published-series
            median in the next table.
          </p>
        </div>
        {aggregation.fromTransactions.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No deal-level cap rates recorded for this quarter.
          </div>
        ) : (
          <MatrixTable buckets={aggregation.fromTransactions} />
        )}
      </section>

      <section className="space-y-3">
        <div>
          <div className="eyebrow">Cap-rate matrix · published series</div>
          <p className="mt-1 text-sm text-slate-400">
            REB / MOLIT-published cap-rate observations. Divergence from the deal-level table above
            is itself a useful repricing signal.
          </p>
        </div>
        {aggregation.fromIndicators.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No published cap-rate series for this quarter.
          </div>
        ) : (
          <MatrixTable buckets={aggregation.fromIndicators} />
        )}
      </section>

      <section className="print-break space-y-3">
        <div>
          <div className="eyebrow">Quarter transaction comps</div>
          <p className="mt-1 text-sm text-slate-400">
            Up to 30 most recent deals with disclosed cap rate within the quarter window.
          </p>
        </div>
        {transactions.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No qualifying transactions recorded in this quarter.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Submarket</th>
                  <th className="px-3 py-2 font-semibold">Class / tier</th>
                  <th className="px-3 py-2 text-right font-semibold">Price</th>
                  <th className="px-3 py-2 text-right font-semibold">Cap %</th>
                  <th className="px-3 py-2 font-semibold">Asset</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                {transactions.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {row.transactionDate ? formatDate(row.transactionDate) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">{row.market}/{row.region}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.assetClass ?? '—'} / {row.assetTier ?? 'Untiered'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {formatPriceKrw(row.priceKrw)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {row.capRatePct ? formatCap(row.capRatePct) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.asset?.assetCode ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="print-break space-y-4">
        <div>
          <div className="eyebrow">Approved house views</div>
          <p className="mt-1 text-sm text-slate-400">
            ResearchSnapshot rows with viewType=HOUSE and approvalStatus=APPROVED, dated within
            the quarter. Editorial commentary the operator promoted from draft.
          </p>
        </div>
        {houseViews.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No approved house views for this quarter. Promote drafts from the Research workspace.
          </div>
        ) : (
          <div className="space-y-3">
            {houseViews.map((snap) => (
              <article
                key={snap.id}
                className="rounded-[18px] border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone="good">{snap.snapshotType}</Badge>
                  <span>{formatDate(snap.snapshotDate ?? snap.createdAt)}</span>
                  {snap.marketUniverse?.label ? <span>· {snap.marketUniverse.label}</span> : null}
                  {snap.submarket?.label ? <span>· {snap.submarket.label}</span> : null}
                  {snap.asset?.assetCode ? <span>· {snap.asset.assetCode}</span> : null}
                </div>
                <h3 className="mt-2 text-xl font-semibold text-white">{snap.title}</h3>
                {snap.summary ? (
                  <p className="mt-3 text-sm leading-7 text-slate-300">{snap.summary}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="rounded-[18px] border border-white/10 bg-white/[0.03] px-5 py-4 text-xs text-slate-500">
        Generated {formatDate(new Date())} · {quarter.label} window
        {' '}{formatDate(quarter.start)} – {formatDate(quarter.end)} · Internal use only.
      </footer>
    </main>
  );
}

function MatrixTable({
  buckets
}: {
  buckets: Awaited<ReturnType<typeof aggregateCapRates>>['fromTransactions'];
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">Submarket</th>
            <th className="px-3 py-2 font-semibold">Class / tier</th>
            <th className="px-3 py-2 text-right font-semibold">n</th>
            <th className="px-3 py-2 text-right font-semibold">Min</th>
            <th className="px-3 py-2 text-right font-semibold">Median</th>
            <th className="px-3 py-2 text-right font-semibold">Max</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-200">
          {buckets.map((bucket, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-xs">
                {bucket.market}/{bucket.region ?? '—'}
              </td>
              <td className="px-3 py-2 text-xs">
                {bucket.assetClass ?? '—'} / {bucket.assetTier ?? 'Untiered'}
              </td>
              <td className="px-3 py-2 text-right text-xs">{bucket.count}</td>
              <td className="px-3 py-2 text-right font-mono text-xs">{formatCap(bucket.minPct)}</td>
              <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-white">
                {formatCap(bucket.medianPct)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">{formatCap(bucket.maxPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
