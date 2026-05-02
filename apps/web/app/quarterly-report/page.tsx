'use client';

import { useState } from 'react';

const DEFAULT_SUBMARKETS = [
  '강남구',
  '서초구',
  '송파구',
  '영등포구',
  '중구',
  '성동구',
  '평택시',
  '성남시'
];

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}Q${q}`;
}

function priorQuarter(q: string): string {
  const m = /^(\d{4})Q([1-4])$/.exec(q);
  if (!m) return q;
  const year = Number(m[1]);
  const qn = Number(m[2]);
  const total = year * 4 + (qn - 1) - 1;
  return `${Math.floor(total / 4)}Q${(total % 4) + 1}`;
}

export default function QuarterlyReportPage() {
  const [quarter, setQuarter] = useState(priorQuarter(currentQuarter()));
  const [submarket, setSubmarket] = useState('전국');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [genSummary, setGenSummary] = useState<any>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(
        `/api/quarterly-report?quarter=${quarter}&submarket=${encodeURIComponent(submarket)}`
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Load failed');
      setReport(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  async function generate(withNarratives: boolean) {
    setGenerating(true);
    setError(null);
    setGenSummary(null);
    try {
      const res = await fetch('/api/quarterly-report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quarter,
          submarkets: DEFAULT_SUBMARKETS,
          generateNarratives: withNarratives
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Generate failed');
      setGenSummary(body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setGenerating(false);
    }
  }

  const s = report?.snapshot;
  const n = report?.narrative;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-2 text-3xl font-bold">CBRE-Style Quarterly Market Report</h1>
        <p className="mb-6 text-sm text-zinc-400">
          ECOS (BOK macro) + MOLIT 실거래가 + DART 전자공시 → Claude narrative. Fully rebuilds a
          quarter on demand.
        </p>

        <div className="mb-6 flex flex-wrap gap-3">
          <input
            className="w-28 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value.toUpperCase())}
            placeholder="2026Q1"
          />
          <select
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={submarket}
            onChange={(e) => setSubmarket(e.target.value)}
          >
            <option value="전국">전국 (national + DART)</option>
            {DEFAULT_SUBMARKETS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600 disabled:opacity-50"
            onClick={load}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load'}
          </button>
          <button
            className="rounded bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-500 disabled:opacity-50"
            onClick={() => generate(false)}
            disabled={generating}
          >
            {generating ? 'Aggregating…' : 'Aggregate only'}
          </button>
          <button
            className="rounded bg-emerald-600 px-4 py-2 text-sm hover:bg-emerald-500 disabled:opacity-50"
            onClick={() => generate(true)}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Aggregate + AI narrative'}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {genSummary && (
          <div className="mb-6 rounded border border-emerald-800 bg-emerald-950/40 p-4 text-sm">
            <div className="font-semibold text-emerald-200">Generation complete</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-zinc-300">
              <div>Quarter: {genSummary.quarter}</div>
              <div>Narratives: {genSummary.narrativesGenerated}</div>
              <div>Base rate: {genSummary.macro.baseRatePct ?? 'n/a'}%</div>
              <div>KRW/USD: {genSummary.macro.krwUsd ?? 'n/a'}</div>
              <div>DART REIT filings: {genSummary.dartSummary.reitDisclosures}</div>
              <div>DART RE transactions: {genSummary.dartSummary.realEstateTransactions}</div>
              <div>QoQ/YoY rows backfilled: {genSummary.deltasUpdated}</div>
              <div>
                Submarkets with MOLIT data:{' '}
                {genSummary.submarkets.filter((x: any) => x.hadMolitData).length} /{' '}
                {genSummary.submarkets.length}
              </div>
            </div>
          </div>
        )}

        {report && s && (
          <div className="space-y-6">
            {n && (
              <section className="rounded-lg border border-emerald-900 bg-emerald-950/20 p-6">
                <div className="mb-2 flex items-center gap-3 text-xs text-emerald-300">
                  <span className="rounded bg-emerald-900/50 px-2 py-0.5">{n.status}</span>
                  <span>{n.model}</span>
                </div>
                <h2 className="mb-4 text-xl font-bold">{n.headline}</h2>
                <NarrativeBlock title="Market Pulse" body={n.marketPulse} />
                <NarrativeBlock title="Supply Pipeline" body={n.supplyPipeline} />
                <NarrativeBlock title="Capital Markets" body={n.capitalMarkets} />
                <NarrativeBlock title="Outlook" body={n.outlook} />
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded border border-emerald-800 bg-emerald-950/40 p-3 text-sm">
                    <div className="mb-1 font-semibold text-emerald-200">Overweight</div>
                    <ul className="space-y-0.5 font-mono text-emerald-100">
                      {(n.overweightList ?? []).map((c: string) => (
                        <li key={c}>· {c}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded border border-red-900 bg-red-950/40 p-3 text-sm">
                    <div className="mb-1 font-semibold text-red-200">Underweight</div>
                    <ul className="space-y-0.5 font-mono text-red-100">
                      {(n.underweightList ?? []).map((c: string) => (
                        <li key={c}>· {c}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">Risks</h3>
                  <div className="space-y-2">
                    {(n.risks ?? []).map((r: any, i: number) => (
                      <div key={i} className="rounded border border-zinc-800 p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              'rounded px-2 py-0.5 text-xs ' +
                              (r.severity === 'HIGH'
                                ? 'bg-red-900/50 text-red-200'
                                : r.severity === 'MEDIUM'
                                  ? 'bg-amber-900/50 text-amber-200'
                                  : 'bg-zinc-800 text-zinc-300')
                            }
                          >
                            {r.severity}
                          </span>
                          <span className="font-semibold">{r.title}</span>
                        </div>
                        <p className="mt-1 text-zinc-300">{r.rationale}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold">Snapshot metrics</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Row k="Market" v={s.market} />
                <Row k="Submarket" v={s.submarket} />
                <Row k="Quarter" v={s.quarter} />
                <Row k="Asset class" v={s.assetClass ?? '(all)'} />
                <Row k="Base rate" v={s.baseRatePct ? `${s.baseRatePct}%` : 'n/a'} />
                <Row k="KRW/USD" v={s.krwUsd ?? 'n/a'} />
                <Row k="CPI YoY" v={s.cpiYoYPct ? `${s.cpiYoYPct}%` : 'n/a'} />
                <Row k="GDP YoY" v={s.gdpYoYPct ? `${s.gdpYoYPct}%` : 'n/a'} />
                <Row k="Transactions" v={s.transactionCount ?? 'n/a'} />
                <Row
                  k="Volume KRW"
                  v={
                    s.transactionVolumeKrw
                      ? `${(Number(s.transactionVolumeKrw) / 1e9).toFixed(2)}B`
                      : 'n/a'
                  }
                />
                <Row
                  k="Median price/sqm"
                  v={
                    s.medianPriceKrwPerSqm
                      ? `${(Number(s.medianPriceKrwPerSqm) / 1e6).toFixed(2)}M`
                      : 'n/a'
                  }
                />
                <Row k="QoQ %" v={s.priceChangeQoQPct ? `${s.priceChangeQoQPct}%` : 'n/a'} />
                <Row k="YoY %" v={s.priceChangeYoYPct ? `${s.priceChangeYoYPct}%` : 'n/a'} />
                <Row k="Generated" v={new Date(s.generatedAt).toLocaleString()} />
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold">Source manifest</h2>
              <pre className="overflow-x-auto text-xs text-zinc-400">
                {JSON.stringify(s.sourceManifest, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-zinc-800 py-1">
      <span className="text-zinc-400">{k}</span>
      <span className="font-mono text-zinc-100">{v}</span>
    </div>
  );
}

function NarrativeBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-emerald-300">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-zinc-200">{body}</p>
    </div>
  );
}
