'use client';

import { useEffect, useRef, useState } from 'react';
import type { FullReport } from '@/lib/services/property-analyzer/full-report';

const B = 1_000_000_000;
function krw(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  if (Math.abs(v) >= B * 1000) return `${(v / B / 1000).toFixed(d)}T`;
  if (Math.abs(v) >= B) return `${(v / B).toFixed(d)}B`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(d)}M`;
  return Math.round(v).toLocaleString();
}
function pct(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined) return 'N/A';
  return `${v.toFixed(d)}%`;
}

const ANALYSIS_STEPS = [
  { key: 'geocode', label: 'Geocode + public data', approxMs: 600 },
  { key: 'classify', label: 'Asset-class classification', approxMs: 300 },
  { key: 'proforma', label: '10-year pro-forma', approxMs: 400 },
  { key: 'montecarlo', label: 'Monte Carlo (1,000 iter)', approxMs: 1200 },
  { key: 'sensitivity', label: 'Sensitivity matrices', approxMs: 600 },
  { key: 'verdict', label: 'Verdict + implied bid', approxMs: 700 },
  { key: 'memo', label: 'IC memo', approxMs: 3500 }
] as const;

export default function PropertyAnalyzePage() {
  const [address, setAddress] = useState('경기도 평택시 고덕면 삼성로 114');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<FullReport | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
    };
  }, []);

  function advanceStep(index: number) {
    setCurrentStep(index);
    if (index >= ANALYSIS_STEPS.length - 1) return;
    stepTimer.current = setTimeout(
      () => advanceStep(index + 1),
      ANALYSIS_STEPS[index]!.approxMs
    );
  }

  async function run() {
    setLoading(true);
    setError(null);
    setReport(null);
    setCurrentStep(0);
    if (stepTimer.current) clearTimeout(stepTimer.current);
    stepTimer.current = setTimeout(() => advanceStep(1), ANALYSIS_STEPS[0]!.approxMs);

    try {
      const res = await fetch('/api/property-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, includeAlternatives: 0 })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Analysis failed');
      setReport(body);
      setCurrentStep(ANALYSIS_STEPS.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
      if (stepTimer.current) clearTimeout(stepTimer.current);
    }
  }

  const a = report?.autoAnalyze?.primaryAnalysis;
  const resolved = report?.autoAnalyze?.resolvedAddress;
  const cls = report?.autoAnalyze?.classification?.primary;
  const macro = report?.macro;
  const pf = report?.proForma?.summary;
  const pfYears = report?.proForma?.years ?? [];
  const pfx = report?.proFormaExtras;
  const rm = report?.returnMetrics;
  const mc = report?.monteCarlo;
  const v = report?.verdict;
  const bid = report?.impliedBid;
  const memo = report?.memo;
  const dc = report?.debtCovenant;
  const capMatrix = report?.sensitivities?.capRateExit;
  const irRows = report?.sensitivities?.interestRate ?? [];
  const md = report?.sensitivities?.macroDriven;
  const refi = report?.refinancing;
  const wf = report?.gpLpWaterfall;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-2 text-3xl font-bold">Click-Any-Building Analyzer</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Korean address → asset-class classification → 10-year pro-forma → IRR / MOIC / DSCR →
          sensitivity matrices → macro stress → refinancing recommendation.
        </p>

        <div className="mb-4 flex flex-col gap-2">
          <label htmlFor="property-address" className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            대상 부동산 주소 (도로명 또는 지번)
          </label>
          <div className="flex gap-3">
            <input
              id="property-address"
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="서울특별시 강남구 테헤란로 100"
              aria-describedby="property-address-hint"
              onKeyDown={(e) => {
                if (e.key === 'Enter') run();
              }}
              maxLength={256}
            />
            <button
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
              onClick={run}
              disabled={loading || !address.trim()}
            >
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
          <p id="property-address-hint" className="text-xs text-zinc-500">
            예: 서울특별시 강남구 테헤란로 100 · 경기도 평택시 고덕면 삼성로 114
          </p>
        </div>

        {loading && (
          <div
            className="mb-6 rounded border border-indigo-800 bg-indigo-950/40 p-4"
            role="status"
            aria-live="polite"
          >
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-300">
              Running analysis ({Math.min(currentStep + 1, ANALYSIS_STEPS.length)}/{ANALYSIS_STEPS.length})
            </div>
            <ol className="space-y-1 text-sm">
              {ANALYSIS_STEPS.map((step, i) => {
                const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
                return (
                  <li
                    key={step.key}
                    className={
                      state === 'done'
                        ? 'text-emerald-400'
                        : state === 'active'
                          ? 'text-indigo-200'
                          : 'text-zinc-500'
                    }
                  >
                    {state === 'done' ? '✓' : state === 'active' ? '◎' : '·'} {step.label}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {report && a && resolved && cls && macro && pf && rm && dc && capMatrix && md && refi && (
          <div className="space-y-6">
            <Section title={`${resolved.roadAddress ?? resolved.jibunAddress} · ${resolved.districtName}`}>
              <Row k="Primary class" v={`${a.asset.assetClass} (${cls.feasibility})`} />
              <Row k="Base valuation" v={`${krw(a.baseCaseValueKrw)} KRW`} />
              <Row
                k="Scenario range"
                v={`${krw(a.scenarios.find((s: any) => s.name === 'Bear')?.valuationKrw)} — ${krw(
                  a.scenarios.find((s: any) => s.name === 'Bull')?.valuationKrw
                )}`}
              />
            </Section>

            {a.threeApproach && (
              <Section title="감정평가 3방식 (3-Approach Reconciliation)">
                <div className="mb-3 text-xs text-zinc-500 leading-relaxed">
                  {a.threeApproach.methodology}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th scope="col" className="text-left py-2 pr-4">Approach</th>
                        <th scope="col" className="text-right py-2 px-2">Value (KRW)</th>
                        <th scope="col" className="text-right py-2 px-2">Per sqm</th>
                        <th scope="col" className="text-right py-2 px-2">Weight</th>
                        <th scope="col" className="text-left py-2 pl-2">Data quality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.threeApproach.approaches.map((ap) => (
                        <tr key={ap.approach} className="border-b border-zinc-900">
                          <td className="py-2 pr-4">
                            <div className="text-zinc-100">{ap.labelKo}</div>
                            <div className="text-xs text-zinc-500">{ap.labelEn}</div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-zinc-100">
                            {ap.valueKrw === null ? '—' : krw(ap.valueKrw)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-zinc-300">
                            {ap.valuePerSqmKrw === null ? '—' : krw(ap.valuePerSqmKrw)}
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-zinc-300">
                            {ap.weight === 0 ? '—' : `${(ap.weight * 100).toFixed(0)}%`}
                          </td>
                          <td className="py-2 pl-2 text-xs text-zinc-400 uppercase tracking-wide">
                            {ap.dataQuality}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-zinc-900/60">
                        <td className="py-2 pr-4 font-semibold text-zinc-100">Reconciled</td>
                        <td className="py-2 px-2 text-right font-mono font-semibold text-emerald-300">
                          {a.threeApproach.reconciledValueKrw === null
                            ? '—'
                            : krw(a.threeApproach.reconciledValueKrw)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-emerald-300">
                          {a.threeApproach.reconciledValuePerSqmKrw === null
                            ? '—'
                            : krw(a.threeApproach.reconciledValuePerSqmKrw)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-zinc-500">100%</td>
                        <td className="py-2 pl-2 text-xs text-zinc-500">weighted</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 space-y-1.5 text-xs text-zinc-500">
                  {a.threeApproach.approaches.map((ap) => (
                    <div key={ap.approach}>
                      <span className="text-zinc-400">{ap.labelKo}:</span> {ap.note}
                    </div>
                  ))}
                </div>
                {a.threeApproach.rulesApplied.length > 0 && (
                  <div className="mt-4 rounded border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="mb-1 text-xs uppercase tracking-wide text-indigo-400">
                      Rules applied
                    </div>
                    <ul className="space-y-1 text-xs text-zinc-400">
                      {a.threeApproach.rulesApplied.map((rule, i) => (
                        <li key={i} className="font-mono">· {rule}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>
            )}

            {memo && (
              <Section title="IC Memo (AI-generated)">
                <div className="mb-4">
                  <div className="text-lg font-semibold text-zinc-100 leading-snug">
                    {memo.headline}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 font-mono">
                    Generated by {memo.generatedBy}
                    {memo.promptTokens !== null && (
                      <> · {memo.promptTokens} / {memo.completionTokens} tok</>
                    )}
                  </div>
                </div>

                <div className="mb-4 rounded border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Executive Summary</div>
                  <p className="text-sm text-zinc-200 leading-relaxed">{memo.executiveSummary}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mb-4">
                  <div className="rounded border border-zinc-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-emerald-400 mb-1">Base Case</div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{memo.baseCaseNarrative}</p>
                  </div>
                  <div className="rounded border border-zinc-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-rose-400 mb-1">Downside</div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{memo.downsideNarrative}</p>
                  </div>
                </div>

                {memo.negotiationPlaybook.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs uppercase tracking-wide text-indigo-400 mb-2">Negotiation Playbook</div>
                    <ul className="space-y-1.5 text-sm text-zinc-200">
                      {memo.negotiationPlaybook.map((p: string, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-indigo-500 font-mono shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                          <span className="leading-relaxed">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded border border-indigo-900/60 bg-indigo-950/30 p-3">
                  <div className="text-xs uppercase tracking-wide text-indigo-400 mb-1">Recommended Action</div>
                  <p className="text-sm text-indigo-100 leading-relaxed font-medium">{memo.recommendedAction}</p>
                </div>
              </Section>
            )}

            {v && (
              <Section title="Investment Verdict (deterministic rubric)">
                <div className="flex flex-wrap items-center gap-4 mb-3">
                  <VerdictBadge tier={v.tier} />
                  <div className="text-sm text-zinc-300">{v.headline}</div>
                </div>
                <div className="text-xs text-zinc-500 mb-3 font-mono">
                  Score {v.totalScore}/{v.maxPossibleScore} (normalized {v.normalizedScore.toFixed(2)})
                  · target IRR {v.hurdlesUsed.targetLeveredIrrPct}% · floor P10 {v.hurdlesUsed.floorP10IrrPct}%
                  · max Prob(&lt;8%) {(v.hurdlesUsed.maxProbBelow8Pct * 100).toFixed(0)}%
                </div>

                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm font-mono" aria-label="Verdict dimension scoring">
                    <thead>
                      <tr className="text-zinc-400 text-xs">
                        <th scope="col" className="p-1.5 text-left">Dimension</th>
                        <th scope="col" className="p-1.5 text-left">Observed</th>
                        <th scope="col" className="p-1.5 text-left">Threshold</th>
                        <th scope="col" className="p-1.5 text-right">Score</th>
                        <th scope="col" className="p-1.5 text-right">Weight</th>
                        <th scope="col" className="p-1.5 text-right">Contrib</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.dimensions.map((d: any) => (
                        <tr key={d.dimension} className="border-t border-zinc-800">
                          <td className="p-1.5">{d.dimension}</td>
                          <td className="p-1.5 text-zinc-300">{d.observed}</td>
                          <td className="p-1.5 text-zinc-500">{d.threshold}</td>
                          <td
                            className={`p-1.5 text-right ${
                              d.score > 0 ? 'text-emerald-300' : d.score < 0 ? 'text-rose-300' : 'text-zinc-500'
                            }`}
                          >
                            {d.score > 0 ? '+' : ''}{d.score}
                          </td>
                          <td className="p-1.5 text-right text-zinc-500">×{d.weight}</td>
                          <td
                            className={`p-1.5 text-right ${
                              d.contribution > 0 ? 'text-emerald-300' : d.contribution < 0 ? 'text-rose-300' : 'text-zinc-500'
                            }`}
                          >
                            {d.contribution > 0 ? '+' : ''}{d.contribution}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {v.redFlags.length > 0 && (
                  <div className="mb-3 rounded border border-rose-900/60 bg-rose-950/30 p-3">
                    <div className="text-xs uppercase tracking-wide text-rose-400 mb-1">Red Flags</div>
                    <ul className="text-sm text-rose-200 space-y-1">
                      {v.redFlags.map((r: string, i: number) => <li key={i}>· {r}</li>)}
                    </ul>
                  </div>
                )}
                {v.positives.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs uppercase tracking-wide text-emerald-400 mb-1">Positives</div>
                    <ul className="text-sm text-emerald-200 space-y-1">
                      {v.positives.map((p: string, i: number) => <li key={i}>+ {p}</li>)}
                    </ul>
                  </div>
                )}
                {v.negatives.length > 0 && (
                  <div className="mb-2">
                    <div className="text-xs uppercase tracking-wide text-amber-400 mb-1">Concerns</div>
                    <ul className="text-sm text-amber-200 space-y-1">
                      {v.negatives.map((n: string, i: number) => <li key={i}>− {n}</li>)}
                    </ul>
                  </div>
                )}
                {v.conditions.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-indigo-400 mb-1">Conditions to Proceed</div>
                    <ul className="text-sm text-indigo-200 space-y-1">
                      {v.conditions.map((c: string, i: number) => <li key={i}>→ {c}</li>)}
                    </ul>
                  </div>
                )}
              </Section>
            )}

            {bid && (
              <Section title="Implied Bid Prices">
                <div className="text-xs text-zinc-400 mb-3">
                  Bisection on purchase price, holding all other assumptions constant.
                  Base price: <span className="font-mono text-zinc-200">{krw(bid.basePriceKrw)}</span>
                  {bid.baseBaseIrrPct !== null && (
                    <> · Base-case IRR at that price: <span className="font-mono text-zinc-200">{pct(bid.baseBaseIrrPct)}</span></>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-mono" aria-label="Implied bid prices">
                    <thead>
                      <tr className="text-zinc-400 text-xs">
                        <th scope="col" className="p-1.5 text-left">Target</th>
                        <th scope="col" className="p-1.5 text-right">Bid Price</th>
                        <th scope="col" className="p-1.5 text-right">vs Base</th>
                        <th scope="col" className="p-1.5 text-right">Achieved</th>
                        <th scope="col" className="p-1.5 text-left">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: `Base IRR = ${bid.targetIrrPct}% (recommended bid)`, sol: bid.atTargetIrr, highlight: true },
                        { label: `MC P50 IRR = ${bid.targetIrrPct}% (conservative)`, sol: bid.atP50TargetIrr },
                        { label: `MC P10 IRR = ${bid.floorIrrPct}% (stress-resilient max)`, sol: bid.atP10FloorIrr },
                        { label: 'Break-even (IRR = 0%)', sol: bid.breakEven }
                      ].map(({ label, sol, highlight }: any) => (
                        <tr
                          key={label}
                          className={`border-t border-zinc-800 ${highlight ? 'bg-indigo-950/30' : ''}`}
                        >
                          <td className="p-1.5">{label}</td>
                          <td className="p-1.5 text-right">{krw(sol.bidPriceKrw)}</td>
                          <td
                            className={`p-1.5 text-right ${
                              sol.discountPct > 0 ? 'text-emerald-300' : sol.discountPct < 0 ? 'text-rose-300' : 'text-zinc-400'
                            }`}
                          >
                            {sol.discountPct > 0 ? '-' : '+'}{Math.abs(sol.discountPct).toFixed(1)}%
                          </td>
                          <td className="p-1.5 text-right">
                            {sol.achievedIrrPct !== null ? pct(sol.achievedIrrPct) : 'N/A'}
                          </td>
                          <td className="p-1.5 text-xs text-zinc-500">
                            {sol.noteIfUnbounded ?? `${sol.iterations} iter${sol.converged ? '' : ' (unconverged)'}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                  Positive % = discount below base price. "Base IRR" uses the deterministic pro-forma;
                  MC variants run 400-iteration Monte Carlo per bisection step.
                </div>
              </Section>
            )}

            <Section title="1. Macro Regime Interpretation" collapsible defaultOpen={false}>
              <Row k="Label" v={macro?.regime?.label ?? '(n/a)'} />
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {(macro?.regime?.summary ?? []).slice(0, 5).map((l: string, i: number) => (
                  <li key={i}>· {l}</li>
                ))}
                {(!macro?.regime?.summary || macro.regime.summary.length === 0) && (
                  <li className="text-zinc-500">(empty)</li>
                )}
              </ul>
            </Section>

            <Section title="2. Deal Macro Exposure (0-100, higher = worse)">
              <Row
                k="Overall"
                v={`${macro.dealExposure.overallScore} [${macro.dealExposure.band}] (raw ${macro.dealExposure.rawScore})`}
              />
              <Row
                k="Correlation penalty"
                v={`+${macro.dealExposure.correlationPenalty.appliedPenaltyPct.toFixed(1)}%`}
              />
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {macro.dealExposure.dimensions.map((d: any) => (
                    <tr key={d.label} className="border-t border-zinc-800">
                      <td className="py-1.5 pr-4 text-zinc-400">{d.label}</td>
                      <td className="py-1.5 pr-4 text-right font-mono">{d.score}</td>
                      <td className="py-1.5 text-zinc-300">{d.commentary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm text-zinc-300">⇒ {macro.dealExposure.summary}</p>
            </Section>

            <Section title="3. Macro Stress Tests" collapsible defaultOpen={false}>
              <div className="space-y-3">
                {macro.stressTests.map((s: any) => (
                  <div key={s.scenario.name} className="rounded border border-zinc-800 p-3">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="font-medium">{s.scenario.name}</span>
                      <span className="text-zinc-400">{s.verdict}</span>
                      <span className="text-zinc-400">
                        ΔCap {pct(s.stressedCapRate && s.baselineCapRate ? s.stressedCapRate - s.baselineCapRate : null)}
                      </span>
                      <span className="text-zinc-400">
                        Value impact {pct(s.valuationImpactPct)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-300">→ {s.commentary}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="4. Pro-Forma Summary (10-year)">
              <Row k="Year-1 NOI" v={krw(pf.stabilizedNoiKrw)} />
              <Row k="Year-1 Revenue" v={krw(pf.annualRevenueKrw)} />
              <Row k={`Terminal Value (Y${pf.terminalYear})`} v={krw(pf.terminalValueKrw)} />
              <Row k="Initial Equity" v={krw(pf.initialEquityKrw)} />
              <Row k="Initial Debt" v={krw(pf.initialDebtFundingKrw)} />
              <Row k="Ending Debt Balance" v={krw(pf.endingDebtBalanceKrw)} />
              <Row k="Gross Exit Value" v={krw(pf.grossExitValueKrw)} />
              <Row k="Net Exit Proceeds" v={krw(pf.netExitProceedsKrw)} />
            </Section>

            {pfx && pfYears.length > 0 && (
              <Section title="4a. Sources & Uses at Entry" collapsible defaultOpen={false}>
                {(() => {
                  const purchasePrice = pfx.totalBasisKrw - pfx.acquisitionTaxKrw;
                  const y1 = pfYears[0]!;
                  const initialTenantCapital = y1.tenantCapitalCostKrw + y1.fitOutCostKrw;
                  const reserveFunding = pf.reserveRequirementKrw;
                  const totalUses = purchasePrice + pfx.acquisitionTaxKrw + initialTenantCapital + reserveFunding;
                  const totalSources = pf.initialDebtFundingKrw + pf.initialEquityKrw;
                  const balanceCheck = totalSources - totalUses;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Uses of Funds</div>
                        <Row k="Purchase Price" v={krw(purchasePrice)} />
                        <Row k="Acquisition Tax (4.6%)" v={krw(pfx.acquisitionTaxKrw)} />
                        <Row k="Initial TI + Fit-out (Y1)" v={krw(initialTenantCapital)} />
                        <Row k="Reserve Funding" v={krw(reserveFunding)} />
                        <Row k="Total Uses" v={krw(totalUses)} />
                      </div>
                      <div>
                        <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Sources of Funds</div>
                        <Row k={`Senior Debt (${((pf.initialDebtFundingKrw / Math.max(purchasePrice, 1)) * 100).toFixed(1)}% LTV)`} v={krw(pf.initialDebtFundingKrw)} />
                        <Row k="Sponsor Equity" v={krw(pf.initialEquityKrw)} />
                        <Row k="Total Sources" v={krw(totalSources)} />
                        <Row k="Balance (Sources − Uses)" v={krw(balanceCheck)} />
                      </div>
                    </div>
                  );
                })()}
              </Section>
            )}

            {pfx && (
              <Section title="4b. Basis / Depreciation / Exit Costs" collapsible defaultOpen={false}>
                <Row k="Acquisition Tax (4.6%)" v={krw(pfx.acquisitionTaxKrw)} />
                <Row k="Total Basis (price + 취득세)" v={krw(pfx.totalBasisKrw)} />
                <Row k="Annual Depreciation" v={krw(pfx.annualDepreciationKrw)} />
                <Row k="Accumulated Depreciation (10y)" v={krw(pfx.accumulatedDepreciationKrw)} />
                <Row k="Depreciation Tax Shield (cumulative)" v={krw(pfx.depreciationTaxShieldKrw)} />
                <Row k="Adjusted Basis at Exit" v={krw(pfx.adjustedBasisAtExitKrw)} />
                <Row k="Exit Transaction Cost (1.5%)" v={krw(pfx.exitTransactionCostKrw)} />
                <Row k="In-place Terminal NOI (Y10)" v={krw(pfx.inPlaceTerminalNoiKrw)} />
                <Row k="Forward Terminal NOI (Y11, used for exit cap)" v={krw(pfx.forwardTerminalNoiKrw)} />
                <Row k="Capex Reserve (cumulative)" v={krw(pfx.totalCapexReserveKrw)} />
                <Row k="Operating Reserve (cumulative)" v={krw(pfx.totalOperatingReserveKrw)} />
                <Row k="Released at Exit (reserves)" v={krw(pfx.releasedReservesAtExitKrw)} />
              </Section>
            )}

            {pfYears.length > 0 && (
              <Section title="4c. Income Statement (10-year)" collapsible defaultOpen={false}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm font-mono" aria-label="Annual income statement">
                    <thead>
                      <tr className="text-zinc-400">
                        <th scope="col" className="p-2 text-left">Line</th>
                        {pfYears.map((y) => (
                          <th scope="col" key={`is-h-${y.year}`} className="p-2 text-right">Y{y.year}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Gross Potential Revenue', pick: (y: typeof pfYears[number]) => y.grossPotentialRevenueKrw },
                        { label: '  (–) Downtime Loss', pick: (y: typeof pfYears[number]) => -(y.downtimeLossKrw + y.renewalDowntimeLossKrw) },
                        { label: '  (–) Rent-Free Loss', pick: (y: typeof pfYears[number]) => -(y.rentFreeLossKrw + y.renewalRentFreeLossKrw) },
                        { label: '  Contracted Rent (net)', pick: (y: typeof pfYears[number]) => y.contractedRevenueKrw },
                        { label: '  Renewal Rent (net)', pick: (y: typeof pfYears[number]) => y.renewalRevenueKrw },
                        { label: '  Residual / Market Rent', pick: (y: typeof pfYears[number]) => y.residualRevenueKrw },
                        { label: '  Fixed Recoveries', pick: (y: typeof pfYears[number]) => y.fixedRecoveriesKrw },
                        { label: '  Site Recoveries', pick: (y: typeof pfYears[number]) => y.siteRecoveriesKrw },
                        { label: '  Utility Pass-Through', pick: (y: typeof pfYears[number]) => y.utilityPassThroughRevenueKrw },
                        { label: '  Total Reimbursements (subtotal)', pick: (y: typeof pfYears[number]) => y.reimbursementRevenueKrw },
                        { label: 'Total Operating Revenue', pick: (y: typeof pfYears[number]) => y.totalOperatingRevenueKrw, bold: true },
                        { label: '  Revenue (alt subtotal)', pick: (y: typeof pfYears[number]) => y.revenueKrw },
                        { label: 'Operating Expenses', pick: (y: typeof pfYears[number]) => -y.operatingExpenseKrw },
                        { label: '  Power Cost', pick: (y: typeof pfYears[number]) => -y.powerCostKrw },
                        { label: '  Site Opex', pick: (y: typeof pfYears[number]) => -y.siteOperatingExpenseKrw },
                        { label: '  Non-Recoverable', pick: (y: typeof pfYears[number]) => -y.nonRecoverableOperatingExpenseKrw },
                        { label: '  Maintenance Reserve', pick: (y: typeof pfYears[number]) => -y.maintenanceReserveKrw },
                        { label: 'NOI', pick: (y: typeof pfYears[number]) => y.noiKrw, bold: true },
                        { label: 'Tenant Improvement (TI)', pick: (y: typeof pfYears[number]) => -y.tenantImprovementKrw },
                        { label: 'Leasing Commission (LC)', pick: (y: typeof pfYears[number]) => -y.leasingCommissionKrw },
                        { label: '  Tenant Capital (TI+LC subtotal)', pick: (y: typeof pfYears[number]) => -y.tenantCapitalCostKrw },
                        { label: 'Renewal Tenant Capital', pick: (y: typeof pfYears[number]) => -y.renewalTenantCapitalCostKrw },
                        { label: 'Fit-Out Cost', pick: (y: typeof pfYears[number]) => -y.fitOutCostKrw },
                        { label: 'CFADS (pre-debt)', pick: (y: typeof pfYears[number]) => y.cfadsBeforeDebtKrw, bold: true },
                        { label: 'Occupied (kW)', pick: (y: typeof pfYears[number]) => y.occupiedKw, isKw: true },
                        { label: 'Contracted (kW)', pick: (y: typeof pfYears[number]) => y.contractedKw, isKw: true },
                        { label: 'Residual Occupied (kW)', pick: (y: typeof pfYears[number]) => y.residualOccupiedKw, isKw: true },
                        { label: 'Active Renewal Leases', pick: (y: typeof pfYears[number]) => y.activeRenewalLeaseCount, isCount: true },
                        { label: 'Wtd Renewal Rate (KRW/kW)', pick: (y: typeof pfYears[number]) => y.weightedRenewalRatePerKwKrw, isRatePerKw: true }
                      ].map((row) => (
                        <tr key={`is-${row.label}`} className="border-t border-zinc-800">
                          <td className={`p-2 ${row.bold ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}>{row.label}</td>
                          {pfYears.map((y) => {
                            const val = row.pick(y);
                            const txt = row.isKw
                              ? `${Math.round(val as number).toLocaleString()} kW`
                              : row.isCount
                                ? `${val}`
                                : row.isRatePerKw
                                  ? (val == null ? 'N/A' : Math.round(val as number).toLocaleString())
                                  : krw(val as number);
                            return (
                              <td key={`is-${row.label}-${y.year}`} className={`p-2 text-right ${row.bold ? 'font-semibold' : ''}`}>
                                {txt}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {pfYears.length > 0 && (
              <Section title="4d. Cash Flow (10-year)" collapsible defaultOpen={false}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm font-mono" aria-label="Annual cash flow">
                    <thead>
                      <tr className="text-zinc-400">
                        <th scope="col" className="p-2 text-left">Line</th>
                        {pfYears.map((y) => (
                          <th scope="col" key={`cf-h-${y.year}`} className="p-2 text-right">Y{y.year}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'NOI', pick: (y: typeof pfYears[number]) => y.noiKrw },
                        { label: 'Tenant Improvement (TI)', pick: (y: typeof pfYears[number]) => -y.tenantImprovementKrw },
                        { label: 'Leasing Commission (LC)', pick: (y: typeof pfYears[number]) => -y.leasingCommissionKrw },
                        { label: 'Renewal Tenant Capital', pick: (y: typeof pfYears[number]) => -y.renewalTenantCapitalCostKrw },
                        { label: 'Fit-Out Cost', pick: (y: typeof pfYears[number]) => -y.fitOutCostKrw },
                        { label: 'Debt Draw', pick: (y: typeof pfYears[number]) => y.drawAmountKrw },
                        { label: 'Interest', pick: (y: typeof pfYears[number]) => -y.interestKrw },
                        { label: 'Principal', pick: (y: typeof pfYears[number]) => -y.principalKrw },
                        { label: 'Debt Service (total)', pick: (y: typeof pfYears[number]) => -y.debtServiceKrw },
                        { label: 'Ending Debt Balance', pick: (y: typeof pfYears[number]) => y.endingDebtBalanceKrw },
                        { label: 'Property Tax', pick: (y: typeof pfYears[number]) => -y.propertyTaxKrw },
                        { label: 'Insurance', pick: (y: typeof pfYears[number]) => -y.insuranceKrw },
                        { label: 'Management Fee', pick: (y: typeof pfYears[number]) => -y.managementFeeKrw },
                        { label: 'Reserve Contribution', pick: (y: typeof pfYears[number]) => -y.reserveContributionKrw },
                        { label: 'Corporate Tax', pick: (y: typeof pfYears[number]) => -y.corporateTaxKrw },
                        { label: 'After-Tax Distribution', pick: (y: typeof pfYears[number]) => y.afterTaxDistributionKrw, bold: true },
                        { label: 'DSCR', pick: (y: typeof pfYears[number]) => y.dscr, isRatio: true }
                      ].map((row) => (
                        <tr key={`cf-${row.label}`} className="border-t border-zinc-800">
                          <td className={`p-2 ${row.bold ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}>{row.label}</td>
                          {pfYears.map((y) => {
                            const val = row.pick(y);
                            return (
                              <td key={`cf-${row.label}-${y.year}`} className={`p-2 text-right ${row.bold ? 'font-semibold' : ''}`}>
                                {row.isRatio ? (val == null ? 'N/A' : `${(val as number).toFixed(2)}x`) : krw(val as number)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {pf && rm && pfYears.length > 0 && (
              <Section title="4e. Equity Waterfall" collapsible defaultOpen={false}>
                {(() => {
                  const initialEquity = pf.initialEquityKrw;
                  const cumulativeDistributions = pfYears.reduce((s, y) => s + y.afterTaxDistributionKrw, 0);
                  const cumInterest = pfYears.reduce((s, y) => s + y.interestKrw, 0);
                  const cumPrincipal = pfYears.reduce((s, y) => s + y.principalKrw, 0);
                  const cumPropertyTax = pfYears.reduce((s, y) => s + y.propertyTaxKrw, 0);
                  const cumCorpTax = pfYears.reduce((s, y) => s + y.corporateTaxKrw, 0);
                  const grossExit = pf.grossExitValueKrw;
                  const netExit = pf.netExitProceedsKrw;
                  const endingDebt = pf.endingDebtBalanceKrw;
                  const exitCostsTotal = grossExit - netExit;
                  const totalReturn = cumulativeDistributions + netExit;
                  const gain = totalReturn - initialEquity;
                  const moic = initialEquity > 0 ? totalReturn / initialEquity : 0;
                  const operatingShare = cumulativeDistributions / Math.max(totalReturn, 1);
                  const exitShare = netExit / Math.max(totalReturn, 1);
                  return (
                    <>
                      <div className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Sources &amp; Uses (entry)</div>
                      <Row k="Initial Debt Funding" v={krw(pf.initialDebtFundingKrw)} />
                      <Row k="(1) Initial Equity Outlay" v={krw(-initialEquity)} />

                      <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">Operating Cash (Y1–Y{pf.terminalYear})</div>
                      <Row k="Cumulative Interest Paid" v={krw(-cumInterest)} />
                      <Row k="Cumulative Principal Paid" v={krw(-cumPrincipal)} />
                      <Row k="Cumulative Property Tax" v={krw(-cumPropertyTax)} />
                      <Row k="Cumulative Corporate Tax" v={krw(-cumCorpTax)} />
                      <Row k="(2) Cumulative After-Tax Distributions" v={krw(cumulativeDistributions)} />

                      <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">Exit Decomposition (Y{pf.terminalYear})</div>
                      <Row k="Gross Exit Value" v={krw(grossExit)} />
                      <Row k="(–) Ending Debt Repayment" v={krw(-endingDebt)} />
                      <Row k="(–) Exit Transaction / Promote / Tax" v={krw(-exitCostsTotal)} />
                      {pfx && <Row k="    • Exit Transaction Cost (1.5%)" v={krw(-pfx.exitTransactionCostKrw)} />}
                      {pfx && pfx.releasedReservesAtExitKrw > 0 && (
                        <Row k="(+) Released SPV Reserves (capex + opex)" v={krw(pfx.releasedReservesAtExitKrw)} />
                      )}
                      <Row k="(3) Net Exit Proceeds" v={krw(netExit)} />

                      <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">Equity Return</div>
                      <Row k="(4) Total Return to Equity  [ (2) + (3) ]" v={krw(totalReturn)} />
                      <Row k="(5) Net Gain  [ (4) − |1| ]" v={krw(gain)} />
                      <Row k="(6) MOIC  [ (4) ÷ |1| ]" v={`${moic.toFixed(2)}x`} />
                      <Row k="  • Operating CF share of return" v={pct(operatingShare * 100)} />
                      <Row k="  • Exit proceeds share of return" v={pct(exitShare * 100)} />
                      <Row k="Levered Equity Value (PV)" v={krw(pf.leveredEquityValueKrw)} />
                      <Row k="Equity IRR" v={pct(rm.equityIrr)} />
                      <Row k="Unlevered IRR" v={pct(rm.unleveragedIrr)} />
                      <Row k="Payback Year" v={rm.paybackYear ?? 'never'} />
                    </>
                  );
                })()}
              </Section>
            )}

            {pfx && pfYears.length > 0 && (
              <Section title="4f. Balance Sheet (10-year)" collapsible defaultOpen={false}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm font-mono" aria-label="Annual balance sheet">
                    <thead>
                      <tr className="text-zinc-400">
                        <th scope="col" className="p-2 text-left">Line</th>
                        {pfYears.map((y) => (
                          <th scope="col" key={`bs-h-${y.year}`} className="p-2 text-right">Y{y.year}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const basis = pfx.totalBasisKrw;
                        const annualDep = pfx.annualDepreciationKrw;
                        let cumulativeReserve = 0;
                        let cumulativeRetained = 0;
                        const rows = pfYears.map((y) => {
                          cumulativeReserve += y.reserveContributionKrw;
                          cumulativeRetained += y.afterTaxDistributionKrw;
                          const accumDep = annualDep * y.year;
                          const netProperty = Math.max(basis - accumDep, 0);
                          const cashReserves = cumulativeReserve;
                          const totalAssets = netProperty + cashReserves;
                          const debt = y.endingDebtBalanceKrw;
                          const equity = totalAssets - debt;
                          const ltv = netProperty > 0 ? (debt / netProperty) * 100 : null;
                          return {
                            year: y.year,
                            basis,
                            accumDep,
                            netProperty,
                            cashReserves,
                            totalAssets,
                            debt,
                            equity,
                            retained: cumulativeRetained,
                            ltv
                          };
                        });
                        const defs: { label: string; bold?: boolean; isPct?: boolean; pick: (r: typeof rows[number]) => number | null }[] = [
                          { label: 'Property at Cost (basis)', pick: (r) => r.basis },
                          { label: '  (–) Accumulated Depreciation', pick: (r) => -r.accumDep },
                          { label: 'Net Property', pick: (r) => r.netProperty, bold: true },
                          { label: 'Cash / Reserve Balance', pick: (r) => r.cashReserves },
                          { label: 'TOTAL ASSETS', pick: (r) => r.totalAssets, bold: true },
                          { label: 'Debt (senior)', pick: (r) => r.debt },
                          { label: 'Equity (plug)', pick: (r) => r.equity, bold: true },
                          { label: '  Cumulative Distributions Paid', pick: (r) => r.retained },
                          { label: 'LTV (debt / net property)', pick: (r) => r.ltv, isPct: true }
                        ];
                        return defs.map((def) => (
                          <tr key={`bs-${def.label}`} className="border-t border-zinc-800">
                            <td className={`p-2 ${def.bold ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}>{def.label}</td>
                            {rows.map((r) => {
                              const val = def.pick(r);
                              const txt = def.isPct ? pct(val) : krw(val);
                              return (
                                <td key={`bs-${def.label}-${r.year}`} className={`p-2 text-right ${def.bold ? 'font-semibold' : ''}`}>
                                  {txt}
                                </td>
                              );
                            })}
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Depreciation runs off total basis. Cash/Reserve = cumulative reserve contributions
                  (operating distributions assumed paid out). Equity = plug (Assets − Debt).
                </p>
              </Section>
            )}

            {pfYears.length > 0 && (
              <Section title="4g. Debt Schedule (10-year)" collapsible defaultOpen={false}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm font-mono" aria-label="Annual debt schedule">
                    <thead>
                      <tr className="text-zinc-400">
                        <th scope="col" className="p-2 text-left">Line</th>
                        {pfYears.map((y) => (
                          <th scope="col" key={`ds-h-${y.year}`} className="p-2 text-right">Y{y.year}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const termNoi = pfYears[pfYears.length - 1]?.noiKrw ?? pf.stabilizedNoiKrw;
                        const exitCapProxy = pf.terminalValueKrw > 0 ? termNoi / pf.terminalValueKrw : null;
                        const rows = pfYears.map((y, i) => {
                          const opening = i === 0
                            ? pf.initialDebtFundingKrw - y.drawAmountKrw
                            : pfYears[i - 1]!.endingDebtBalanceKrw;
                          const impliedValue = exitCapProxy && exitCapProxy > 0 ? y.noiKrw / exitCapProxy : null;
                          const ltv = impliedValue && impliedValue > 0 ? (y.endingDebtBalanceKrw / impliedValue) * 100 : null;
                          const icr = y.interestKrw > 0 ? y.noiKrw / y.interestKrw : null;
                          return {
                            year: y.year,
                            opening,
                            draw: y.drawAmountKrw,
                            interest: y.interestKrw,
                            principal: y.principalKrw,
                            debtService: y.debtServiceKrw,
                            ending: y.endingDebtBalanceKrw,
                            impliedValue,
                            ltv,
                            dscr: y.dscr,
                            icr
                          };
                        });
                        const DSCR_FLOOR = 1.15;
                        const defs: { label: string; bold?: boolean; kind: 'krw' | 'pct' | 'ratio'; breach?: boolean; pick: (r: typeof rows[number]) => number | null }[] = [
                          { label: 'Opening Balance', kind: 'krw', pick: (r) => r.opening },
                          { label: '  (+) Draw', kind: 'krw', pick: (r) => r.draw },
                          { label: '  (–) Principal', kind: 'krw', pick: (r) => -r.principal },
                          { label: 'Ending Balance', kind: 'krw', bold: true, pick: (r) => r.ending },
                          { label: 'Interest', kind: 'krw', pick: (r) => r.interest },
                          { label: 'Total Debt Service', kind: 'krw', pick: (r) => r.debtService },
                          { label: 'Implied Property Value', kind: 'krw', pick: (r) => r.impliedValue },
                          { label: 'LTV', kind: 'pct', pick: (r) => r.ltv },
                          { label: 'DSCR (vs 1.15x floor)', kind: 'ratio', breach: true, pick: (r) => r.dscr },
                          { label: 'ICR (NOI / Interest)', kind: 'ratio', pick: (r) => r.icr }
                        ];
                        return defs.map((def) => (
                          <tr key={`ds-${def.label}`} className="border-t border-zinc-800">
                            <td className={`p-2 ${def.bold ? 'font-semibold text-zinc-100' : 'text-zinc-300'}`}>{def.label}</td>
                            {rows.map((r) => {
                              const val = def.pick(r);
                              let txt: string;
                              if (def.kind === 'krw') txt = krw(val);
                              else if (def.kind === 'pct') txt = pct(val);
                              else txt = val == null ? 'N/A' : `${val.toFixed(2)}x`;
                              const isBreach = def.breach && val != null && val < DSCR_FLOOR;
                              return (
                                <td
                                  key={`ds-${def.label}-${r.year}`}
                                  className={`p-2 text-right ${def.bold ? 'font-semibold' : ''} ${isBreach ? 'text-rose-400' : ''}`}
                                >
                                  {txt}
                                </td>
                              );
                            })}
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  Implied value uses a constant exit-cap proxy (terminal NOI / terminal value) applied
                  to each year's NOI. DSCR below 1.15× is flagged in red.
                </p>
              </Section>
            )}

            {wf && (
              <Section title="4h. GP/LP Promote Waterfall" collapsible defaultOpen={false}>
                <div className="mb-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-xs text-zinc-500">LP Commitment</div>
                    <div className="font-mono">{krw(wf.lpCommittedKrw)}</div>
                    <div className="text-xs text-zinc-500">{(wf.config.lpCommitmentPct * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">GP Commitment</div>
                    <div className="font-mono">{krw(wf.gpCommittedKrw)}</div>
                    <div className="text-xs text-zinc-500">{(wf.config.gpCommitmentPct * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Pref Return</div>
                    <div className="font-mono">{wf.config.preferredReturnPct.toFixed(1)}%</div>
                    <div className="text-xs text-zinc-500">Compounded, 100% LP</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Catch-up / Promote</div>
                    <div className="font-mono">
                      {(wf.config.catchUpLpSplit * 100).toFixed(0)}/{(wf.config.catchUpGpSplit * 100).toFixed(0)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Residual {(wf.config.residualLpSplit * 100).toFixed(0)}/{(wf.config.residualGpSplit * 100).toFixed(0)}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm font-mono" aria-label="GP/LP waterfall tiers">
                    <thead>
                      <tr className="text-zinc-400">
                        <th scope="col" className="p-2 text-left">Tier</th>
                        <th scope="col" className="p-2 text-right">Distributed</th>
                        <th scope="col" className="p-2 text-right">LP</th>
                        <th scope="col" className="p-2 text-right">GP</th>
                        <th scope="col" className="p-2 text-right">Cum. LP</th>
                        <th scope="col" className="p-2 text-right">Cum. GP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wf.tiers.map((t) => (
                        <tr key={t.name} className="border-t border-zinc-800">
                          <td className="p-2 text-zinc-200">{t.name}</td>
                          <td className="p-2 text-right">{krw(t.distributedKrw)}</td>
                          <td className="p-2 text-right">{krw(t.lpKrw)}</td>
                          <td className="p-2 text-right">{krw(t.gpKrw)}</td>
                          <td className="p-2 text-right text-zinc-400">{krw(t.cumulativeLpKrw)}</td>
                          <td className="p-2 text-right text-zinc-400">{krw(t.cumulativeGpKrw)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-zinc-700 font-semibold">
                        <td className="p-2 text-zinc-100">Total</td>
                        <td className="p-2 text-right">{krw(wf.totalDistributionsKrw)}</td>
                        <td className="p-2 text-right">{krw(wf.lpTotalKrw)}</td>
                        <td className="p-2 text-right">{krw(wf.gpTotalKrw)}</td>
                        <td className="p-2 text-right text-zinc-400">—</td>
                        <td className="p-2 text-right text-zinc-400">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-xs text-zinc-500">LP IRR</div>
                    <div className="font-mono text-emerald-300">{pct(wf.lpIrrPct)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">LP MOIC</div>
                    <div className="font-mono">{wf.lpMoic.toFixed(2)}x</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">GP IRR</div>
                    <div className="font-mono text-emerald-300">{pct(wf.gpIrrPct)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">GP MOIC</div>
                    <div className="font-mono">{wf.gpMoic.toFixed(2)}x</div>
                  </div>
                </div>

                <div className="mt-4 rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">GP Promote (Carry)</div>
                  <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-3">
                    <div>
                      <div className="text-xs text-zinc-500">Pro-rata LP (reference)</div>
                      <div className="font-mono">{krw(wf.proRataLpKrw)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Pro-rata GP (reference)</div>
                      <div className="font-mono">{krw(wf.proRataGpKrw)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">GP Promote Earned</div>
                      <div className="font-mono text-amber-300">{krw(wf.gpPromoteEarnedKrw)}</div>
                    </div>
                  </div>
                </div>

                <p className="mt-2 text-xs text-zinc-500">
                  American (deal-by-deal) waterfall on after-tax distributions + net exit proceeds.
                  Tier 1 returns capital pro-rata; Tier 2 pays the compounded preferred return 100% to
                  LP; Tier 3 catches GP up to the promote split; Tier 4 splits residual profits. GP
                  Promote = GP total minus pro-rata share (the carry earned above passive participation).
                </p>
              </Section>
            )}

            <Section title="5. Return Metrics">
              <Row k="Equity IRR" v={pct(rm.equityIrr)} />
              <Row k="Unlevered IRR" v={pct(rm.unleveragedIrr)} />
              <Row k="Equity Multiple" v={`${rm.equityMultiple.toFixed(2)}x`} />
              <Row k="Avg Cash-on-Cash" v={pct(rm.averageCashOnCash)} />
              <Row k="Payback Year" v={rm.paybackYear ?? 'never'} />
              <Row k="Peak Equity" v={krw(rm.peakEquityExposureKrw)} />
            </Section>

            {mc && (
              <Section title={`5b. Monte Carlo (${mc.iterations} iter, seed ${mc.seed})`}>
                <div className="mb-2 text-xs text-zinc-400">
                  Correlated truncated-normal draws on entry cap / exit cap / rent growth /
                  interest rate via Cholesky decomposition. Joint-stress tails (rates ↑ &amp;
                  caps ↑ &amp; growth ↓) are modeled — P10 reflects co-movement risk.
                </div>
                <table className="w-full text-sm font-mono" aria-label="Monte Carlo return metric percentiles">
                  <thead>
                    <tr className="text-zinc-400">
                      <th scope="col" className="p-2 text-left">Metric</th>
                      <th scope="col" className="p-2 text-right">Base</th>
                      <th scope="col" className="p-2 text-right">P10</th>
                      <th scope="col" className="p-2 text-right">P50</th>
                      <th scope="col" className="p-2 text-right">P90</th>
                      <th scope="col" className="p-2 text-right">Mean</th>
                      <th scope="col" className="p-2 text-right">σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-zinc-800">
                      <td className="p-2">Equity IRR</td>
                      <td className="p-2 text-right">{pct(mc.baseLeveredIrr)}</td>
                      <td className="p-2 text-right">{pct(mc.leveredIrr.p10)}</td>
                      <td className="p-2 text-right">{pct(mc.leveredIrr.p50)}</td>
                      <td className="p-2 text-right">{pct(mc.leveredIrr.p90)}</td>
                      <td className="p-2 text-right">{pct(mc.leveredIrr.mean)}</td>
                      <td className="p-2 text-right">{pct(mc.leveredIrr.stdDev)}</td>
                    </tr>
                    <tr className="border-t border-zinc-800">
                      <td className="p-2">Unlevered IRR</td>
                      <td className="p-2 text-right">{pct(mc.baseUnleveredIrr)}</td>
                      <td className="p-2 text-right">{pct(mc.unleveredIrr.p10)}</td>
                      <td className="p-2 text-right">{pct(mc.unleveredIrr.p50)}</td>
                      <td className="p-2 text-right">{pct(mc.unleveredIrr.p90)}</td>
                      <td className="p-2 text-right">{pct(mc.unleveredIrr.mean)}</td>
                      <td className="p-2 text-right">{pct(mc.unleveredIrr.stdDev)}</td>
                    </tr>
                    <tr className="border-t border-zinc-800">
                      <td className="p-2">MOIC</td>
                      <td className="p-2 text-right">{mc.baseMoic.toFixed(2)}x</td>
                      <td className="p-2 text-right">
                        {mc.moic.p10 !== null ? `${mc.moic.p10.toFixed(2)}x` : 'N/A'}
                      </td>
                      <td className="p-2 text-right">
                        {mc.moic.p50 !== null ? `${mc.moic.p50.toFixed(2)}x` : 'N/A'}
                      </td>
                      <td className="p-2 text-right">
                        {mc.moic.p90 !== null ? `${mc.moic.p90.toFixed(2)}x` : 'N/A'}
                      </td>
                      <td className="p-2 text-right">
                        {mc.moic.mean !== null ? `${mc.moic.mean.toFixed(2)}x` : 'N/A'}
                      </td>
                      <td className="p-2 text-right">
                        {mc.moic.stdDev !== null ? mc.moic.stdDev.toFixed(2) : 'N/A'}
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
                  Probability Equity IRR Below Target
                </div>
                <table className="text-sm font-mono" aria-label="Probability equity IRR below target">
                  <thead>
                    <tr className="text-zinc-400">
                      {mc.probLeveredIrrBelow.map((p: any) => (
                        <th scope="col" key={p.targetPct} className="p-2 text-right">
                          &lt; {p.targetPct}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {mc.probLeveredIrrBelow.map((p: any) => (
                        <td key={p.targetPct} className="p-2 text-right">
                          {(p.probability * 100).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>

                <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
                  Driver Draws (base ± σ, min/mean/max observed)
                </div>
                <table className="w-full text-sm font-mono" aria-label="Monte Carlo driver draws">
                  <thead>
                    <tr className="text-zinc-400">
                      <th scope="col" className="p-2 text-left">Driver</th>
                      <th scope="col" className="p-2 text-right">Base</th>
                      <th scope="col" className="p-2 text-right">σ</th>
                      <th scope="col" className="p-2 text-right">Min</th>
                      <th scope="col" className="p-2 text-right">Mean</th>
                      <th scope="col" className="p-2 text-right">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mc.drivers.map((d: any) => (
                      <tr key={d.name} className="border-t border-zinc-800">
                        <td className="p-2">{d.name}</td>
                        <td className="p-2 text-right">{d.basePct.toFixed(2)}%</td>
                        <td className="p-2 text-right">±{d.stdDevPct.toFixed(2)}pp</td>
                        <td className="p-2 text-right">{d.minDrawnPct.toFixed(2)}%</td>
                        <td className="p-2 text-right">{d.meanDrawnPct.toFixed(2)}%</td>
                        <td className="p-2 text-right">{d.maxDrawnPct.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {mc.leveredIrr.histogram && mc.leveredIrr.histogram.length > 0 && (
                  <>
                    <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
                      Equity IRR Histogram
                    </div>
                    <div className="flex items-end gap-1 h-24">
                      {mc.leveredIrr.histogram.map((b: any, i: number) => {
                        const maxCount = Math.max(...mc.leveredIrr.histogram.map((x: any) => x.count));
                        const h = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
                        return (
                          <div
                            key={i}
                            className="flex-1 bg-indigo-500/70 min-w-[4px]"
                            style={{ height: `${h}%` }}
                            title={`${b.binStart.toFixed(1)}% – ${b.binEnd.toFixed(1)}%: ${b.count}`}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-zinc-500 font-mono">
                      <span>{mc.leveredIrr.min !== null ? `${mc.leveredIrr.min.toFixed(1)}%` : ''}</span>
                      <span>{mc.leveredIrr.max !== null ? `${mc.leveredIrr.max.toFixed(1)}%` : ''}</span>
                    </div>
                  </>
                )}

                <div className="mt-4 mb-2 text-xs uppercase tracking-wide text-zinc-400">
                  Correlation — Assumed (lower-triangular) vs Realized
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs font-mono">
                    <thead>
                      <tr className="text-zinc-500">
                        <th className="p-1.5"></th>
                        {mc.driverOrder.map((name: string) => (
                          <th key={name} className="p-1.5 text-right">{name.split(' ')[0]}</th>
                        ))}
                        <th className="p-1.5 text-zinc-600 pl-3">│</th>
                        {mc.driverOrder.map((name: string) => (
                          <th key={`r-${name}`} className="p-1.5 text-right">{name.split(' ')[0]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mc.driverOrder.map((rowName: string, i: number) => (
                        <tr key={rowName} className="border-t border-zinc-800/50">
                          <td className="p-1.5 text-zinc-500">{rowName.split(' ')[0]}</td>
                          {mc.correlationMatrix[i].map((v: number, j: number) => (
                            <td
                              key={`a-${j}`}
                              className={`p-1.5 text-right ${
                                j > i ? 'text-zinc-600' : v > 0 ? 'text-emerald-300' : v < 0 ? 'text-rose-300' : 'text-zinc-400'
                              }`}
                            >
                              {j > i ? '·' : v.toFixed(2)}
                            </td>
                          ))}
                          <td className="p-1.5 text-zinc-600 pl-3">│</td>
                          {mc.realizedCorrelation[i].map((v: number, j: number) => (
                            <td
                              key={`r-${j}`}
                              className={`p-1.5 text-right ${
                                i === j ? 'text-zinc-500' : v > 0 ? 'text-emerald-300/80' : v < 0 ? 'text-rose-300/80' : 'text-zinc-400'
                              }`}
                            >
                              {i === j ? '1.00' : v.toFixed(2)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  Left: assumed (from literature). Right: realized Pearson ρ across {mc.validIterations} valid iterations
                  (clamping slightly attenuates tails). Green = positive, red = negative co-movement.
                </div>

                <div className="mt-4 text-xs text-zinc-500">
                  {mc.validIterations}/{mc.iterations} iterations produced valid IRRs.
                </div>
              </Section>
            )}

            <Section title="6. Debt Covenant (DSCR)">
              <Row k="Covenant floor" v={`${dc.covenantFloor.toFixed(2)}x`} />
              <Row k="Year-1 DSCR" v={dc.baseYear1Dscr ? `${dc.baseYear1Dscr.toFixed(2)}x` : 'N/A'} />
              <Row
                k={`Years < ${dc.covenantFloor}`}
                v={dc.yearsBelowFloor.length > 0 ? dc.yearsBelowFloor.join(',') : 'none'}
              />
              <Row
                k="Years < 1.00x"
                v={dc.yearsBelowOne.length > 0 ? dc.yearsBelowOne.join(',') : 'none'}
              />
              <Row k="Base breaches" v={dc.breachesInBase ? 'YES ⚠' : 'NO'} />
            </Section>

            <Section title="7. Sensitivity — Cap Rate × Exit Cap Rate (equity IRR)" collapsible defaultOpen={false}>
              <div className="overflow-x-auto">
                <table className="text-sm font-mono">
                  <thead>
                    <tr>
                      <th className="p-2"></th>
                      {capMatrix.colAxis.values.map((v: number) => (
                        <th key={v} className="p-2 text-right text-zinc-400">
                          Exit {v.toFixed(1)}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {capMatrix.cells.map((row: any[], r: number) => (
                      <tr key={r} className={r === capMatrix.baseRowIndex ? 'bg-indigo-950/30' : ''}>
                        <td className="p-2 text-zinc-400">
                          Cap {capMatrix.rowAxis.values[r].toFixed(1)}%
                        </td>
                        {row.map((c: any, ci: number) => (
                          <td key={ci} className="p-2 text-right">
                            {c.equityIrr === null ? 'N/A' : `${c.equityIrr.toFixed(1)}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="8. Sensitivity — Interest Rate Shift" collapsible defaultOpen={false}>
              <table className="text-sm font-mono" aria-label="Interest rate sensitivity">
                <thead>
                  <tr className="text-zinc-400">
                    <th scope="col" className="p-2 text-left">ΔRate</th>
                    <th scope="col" className="p-2 text-right">Equity IRR</th>
                    <th scope="col" className="p-2 text-right">MOIC</th>
                    <th scope="col" className="p-2 text-right">Y1 DSCR</th>
                  </tr>
                </thead>
                <tbody>
                  {irRows.map((row: any) => (
                    <tr key={row.shiftBps} className="border-t border-zinc-800">
                      <td className="p-2">{row.shiftBps}bps</td>
                      <td className="p-2 text-right">
                        {row.equityIrr === null ? 'N/A' : pct(row.equityIrr)}
                      </td>
                      <td className="p-2 text-right">{row.equityMultiple.toFixed(2)}x</td>
                      <td className="p-2 text-right">
                        {row.dscrYear1 ? `${row.dscrYear1.toFixed(2)}x` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="9. Macro-Driven Sensitivity (axes from stress scenarios)" collapsible defaultOpen={false}>
              <div className="mb-2 text-xs text-zinc-400">
                Rate axis: {md.rateAxisSourceScenario} · Occupancy axis:{' '}
                {md.occupancyAxisSourceScenario}
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm font-mono">
                  <thead>
                    <tr>
                      <th className="p-2"></th>
                      {md.colAxis.values.map((v: number) => (
                        <th key={v} className="p-2 text-right text-zinc-400">
                          +Vacancy {v.toFixed(1)}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {md.cells.map((row: any[], r: number) => (
                      <tr key={r}>
                        <td className="p-2 text-zinc-400">+{md.rowAxis.values[r]}bps</td>
                        {row.map((c: any, ci: number) => (
                          <td key={ci} className="p-2 text-right">
                            {c.equityIrr === null ? 'N/A' : `${c.equityIrr.toFixed(1)}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="10. Refinancing Analysis" collapsible defaultOpen={false}>
              <Row k="Triggers detected" v={refi.triggers.length} />
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {refi.triggers.slice(0, 5).map((t: any, i: number) => (
                  <li key={i}>
                    [{t.severity}] Y{t.year} — {t.reason}
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-2 text-sm">
                {refi.scenarios.slice(0, 4).map((s: any) => (
                  <div key={s.refiYear} className="border-t border-zinc-800 pt-2">
                    refi Y{s.refiYear} @ {s.newRatePct.toFixed(2)}% · DS savings{' '}
                    {krw(s.annualDebtServiceSavingKrw)}/yr · break-even{' '}
                    {s.breakEvenYears ? `${s.breakEvenYears.toFixed(1)}y` : 'never'}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-indigo-300">⇒ {refi.recommendation}</p>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = true
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  if (collapsible) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40">
        <details open={defaultOpen} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-lg font-semibold text-zinc-100 hover:bg-zinc-900/60">
            <span>{title}</span>
            <span className="text-xs text-zinc-500 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
          </summary>
          <div className="px-5 pb-5">{children}</div>
        </details>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 className="mb-3 text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

function VerdictBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    STRONG_BUY: 'bg-emerald-600 text-emerald-50 border-emerald-400',
    BUY: 'bg-emerald-700/70 text-emerald-100 border-emerald-500',
    CONDITIONAL: 'bg-amber-600/70 text-amber-50 border-amber-400',
    PASS: 'bg-rose-700/70 text-rose-100 border-rose-500',
    AVOID: 'bg-rose-600 text-rose-50 border-rose-400'
  };
  const label: Record<string, string> = {
    STRONG_BUY: 'STRONG BUY',
    BUY: 'BUY',
    CONDITIONAL: 'CONDITIONAL',
    PASS: 'PASS',
    AVOID: 'AVOID'
  };
  return (
    <span className={`inline-block rounded border px-3 py-1.5 text-sm font-bold tracking-wide ${styles[tier] ?? 'bg-zinc-700 text-zinc-100'}`}>
      {label[tier] ?? tier}
    </span>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between border-t border-zinc-800 py-1.5 text-sm first:border-t-0">
      <span className="text-zinc-400">{k}</span>
      <span className="font-mono text-zinc-100">{v}</span>
    </div>
  );
}
