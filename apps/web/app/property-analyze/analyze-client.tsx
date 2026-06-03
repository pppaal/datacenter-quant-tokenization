'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FullReport } from '@/lib/services/property-analyzer/full-report';
import type { MapProviderConfig } from '@/lib/maps/config';
import { PropertyMap, type MapCoordinate } from '@/components/admin/property-map';
import { StatCard } from './_sections/headline';
import { VerdictBadge, krw, pct } from './_sections/shared';
import { ValuationSummary } from './_sections/valuation-summary';
import { DataQualityPanel } from './_sections/data-quality-panel';
import { ThreeApproachSection } from './_sections/three-approach';
import { MemoSection } from './_sections/memo-section';
import { VerdictSection } from './_sections/verdict-section';
import { ImpliedBidSection } from './_sections/implied-bid-section';
import {
  MacroRegimeSection,
  MacroExposureSection,
  MacroStressSection
} from './_sections/macro-sections';
import { ProFormaSummarySection } from './_sections/pro-forma-summary';
import { SourcesAndUsesSection } from './_sections/sources-and-uses';
import { BasisDepreciationSection } from './_sections/basis-depreciation';
import { IncomeStatementSection } from './_sections/income-statement';
import { CashFlowSection } from './_sections/cash-flow';
import { EquityWaterfallSection } from './_sections/equity-waterfall';
import { BalanceSheetSection } from './_sections/balance-sheet';
import { DebtScheduleSection } from './_sections/debt-schedule';
import { GpLpWaterfallSection } from './_sections/gp-lp-waterfall';
import { ReturnMetricsSection } from './_sections/return-metrics';
import { MonteCarloSection } from './_sections/monte-carlo';
import { DebtCovenantSection } from './_sections/debt-covenant';
import {
  CapRateSensitivitySection,
  InterestRateSensitivitySection,
  MacroDrivenSensitivitySection,
  TornadoSensitivitySection
} from './_sections/sensitivities';
import { RefinancingSection } from './_sections/refinancing';

const ANALYSIS_STEPS = [
  { key: 'geocode', label: 'Geocode + public data', approxMs: 600 },
  { key: 'classify', label: 'Asset-class classification', approxMs: 300 },
  { key: 'proforma', label: '10-year pro-forma', approxMs: 400 },
  { key: 'montecarlo', label: 'Monte Carlo (1,000 iter)', approxMs: 1200 },
  { key: 'sensitivity', label: 'Sensitivity matrices', approxMs: 600 },
  { key: 'verdict', label: 'Verdict + implied bid', approxMs: 700 },
  { key: 'memo', label: 'IC memo', approxMs: 3500 }
] as const;

const SUGGESTIONS = [
  '서울특별시 강남구 테헤란로 100',
  '서울특별시 영등포구 여의대로 24',
  '경기도 성남시 분당구 판교역로 235',
  '경기도 평택시 고덕면 삼성로 114'
];

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'cashflow', label: 'Cash flow' },
  { id: 'returns', label: 'Returns' },
  { id: 'risk', label: 'Risk' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'macro', label: 'Macro' }
];

type AnalyzePayload = { address: string } | { location: MapCoordinate };

export default function PropertyAnalyzePage({ mapConfig }: { mapConfig: MapProviderConfig }) {
  const [address, setAddress] = useState('경기도 평택시 고덕면 삼성로 114');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<FullReport | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [clickedPoint, setClickedPoint] = useState<MapCoordinate | null>(null);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
    };
  }, []);

  function advanceStep(index: number) {
    setCurrentStep(index);
    if (index >= ANALYSIS_STEPS.length - 1) return;
    stepTimer.current = setTimeout(() => advanceStep(index + 1), ANALYSIS_STEPS[index]!.approxMs);
  }

  const runAnalysis = useCallback(async (payload: AnalyzePayload) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
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
        body: JSON.stringify({ ...payload, includeAlternatives: 0 })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Analysis failed');
      setReport(body);
      setCurrentStep(ANALYSIS_STEPS.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      loadingRef.current = false;
      setLoading(false);
      if (stepTimer.current) clearTimeout(stepTimer.current);
    }
  }, []);

  function run(value?: string) {
    const target = (value ?? address).trim();
    if (!target) return;
    if (value) setAddress(value);
    void runAnalysis({ address: target });
  }

  const handleMapClick = useCallback(
    (coord: MapCoordinate) => {
      setClickedPoint(coord);
      void runAnalysis({ location: coord });
    },
    [runAnalysis]
  );

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
  const tornado = report?.sensitivities?.tornado;
  const refi = report?.refinancing;
  const wf = report?.gpLpWaterfall;
  const dq = report?.assumptionsQuality ?? report?.autoAnalyze?.provenance;

  // Headline metrics (defensive: the analysis payload is loosely typed).
  const scenarios = (a?.scenarios ?? []) as Array<Record<string, unknown>>;
  const baseScenario =
    scenarios.find((s) => /base/i.test(String(s.label ?? s.name ?? ''))) ??
    scenarios[Math.floor(scenarios.length / 2)];
  const impliedYield = baseScenario ? (baseScenario.impliedYieldPct as number | null) : null;
  const irr = (rm?.equityIrr ?? pf?.equityIrr) as number | null | undefined;
  const moic = (pf?.equityMultiple ?? rm?.equityMultiple) as number | null | undefined;
  const confidence = a?.confidenceScore as number | null | undefined;

  const hasResult = Boolean(
    report && a && resolved && cls && macro && pf && rm && dc && capMatrix && md && refi
  );

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-100">
      {/* ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 12% 0%, rgba(34,211,238,0.12), transparent 60%), radial-gradient(50% 45% at 92% 8%, rgba(99,102,241,0.12), transparent 60%), linear-gradient(180deg, #060b16 0%, #070d1a 50%, #05080f 100%)'
        }}
      />

      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* ---------------- HERO ---------------- */}
        <header className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-200/90">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> AI Underwriting Engine
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
            주소만 입력하면,
            <br />
            <span className="bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              기관급 분석이 끝까지
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-300/90">
            한국 주소 → 자산분류 → 10년 프로포마 → IRR · MOIC · DSCR → 몬테카를로 1,000회 → 민감도 ·
            매크로 스트레스 → IC 메모까지. 숫자 하나까지 실시간 계산합니다.
          </p>
        </header>

        {/* search */}
        <div className="mx-auto mt-8 max-w-2xl">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-md focus-within:border-cyan-300/40">
            <svg
              className="ml-2 h-5 w-5 shrink-0 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              id="property-address"
              className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15px] text-white placeholder:text-slate-500 focus:outline-none"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="도로명 또는 지번 주소를 입력하세요"
              aria-label="대상 부동산 주소"
              onKeyDown={(e) => {
                if (e.key === 'Enter') run();
              }}
              maxLength={256}
            />
            <button
              className="shrink-0 rounded-xl bg-gradient-to-b from-cyan-400 to-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => run()}
              disabled={loading || !address.trim()}
            >
              {loading ? '분석 중…' : '분석'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs text-slate-500">예시</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => run(s)}
                disabled={loading}
                className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-300/40 hover:text-white disabled:opacity-50"
              >
                {s.replace('대한민국 ', '')}
              </button>
            ))}
          </div>
        </div>

        {/* map */}
        <div className="mt-8 overflow-hidden rounded-3xl border border-white/[0.07] bg-[#0e1422]/70 p-2 backdrop-blur-sm">
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
              지도에서 건물 클릭 → 즉시 분석
            </span>
            {clickedPoint && (
              <span className="font-mono text-xs text-slate-500">
                {clickedPoint.latitude.toFixed(5)}, {clickedPoint.longitude.toFixed(5)}
              </span>
            )}
          </div>
          <PropertyMap
            markers={[]}
            selectedId={null}
            onSelect={() => {}}
            config={mapConfig}
            onMapClick={handleMapClick}
            clickedPoint={clickedPoint}
          />
        </div>

        {/* loading */}
        {loading && (
          <div
            className="mt-8 rounded-3xl border border-cyan-300/20 bg-cyan-400/[0.04] p-6"
            role="status"
            aria-live="polite"
          >
            <div className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-cyan-200">
              분석 진행 ({Math.min(currentStep + 1, ANALYSIS_STEPS.length)}/{ANALYSIS_STEPS.length})
            </div>
            <ol className="grid gap-2 sm:grid-cols-2">
              {ANALYSIS_STEPS.map((step, i) => {
                const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
                return (
                  <li
                    key={step.key}
                    className={`flex items-center gap-2 text-sm ${
                      state === 'done'
                        ? 'text-emerald-300'
                        : state === 'active'
                          ? 'text-cyan-100'
                          : 'text-slate-500'
                    }`}
                  >
                    <span aria-hidden>
                      {state === 'done' ? '✓' : state === 'active' ? '◐' : '○'}
                    </span>
                    {step.label}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {/* error */}
        {error && (
          <div className="mt-8 rounded-3xl border border-rose-400/25 bg-rose-500/[0.06] p-6 text-sm text-rose-200">
            <div className="font-semibold">분석을 완료하지 못했습니다</div>
            <p className="mt-1 text-rose-200/80">{error}</p>
            <p className="mt-2 text-xs text-rose-200/60">
              실시간 지오코딩은 데모 범위(서울 강남·여의도, 분당·판교, 평택 고덕 등)에서 동작합니다.
              위 예시 주소로 다시 시도해 보세요.
            </p>
          </div>
        )}

        {/* ---------------- RESULT ---------------- */}
        {hasResult &&
          a &&
          resolved &&
          cls &&
          macro &&
          pf &&
          rm &&
          dc &&
          capMatrix &&
          md &&
          refi && (
            <div className="mt-12">
              {/* headline bento */}
              <div id="overview" className="scroll-mt-24">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                      분석 완료
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">
                      {resolved.roadAddress || resolved.jibunAddress}
                    </h2>
                  </div>
                  {v && <VerdictBadge tier={v.tier} />}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <StatCard
                    label="Base value"
                    value={krw(a.baseCaseValueKrw, 2)}
                    sub={cls ? String(cls).replace(/_/g, ' ') : undefined}
                    tone="accent"
                    span={2}
                  />
                  <StatCard label="Implied yield" value={pct(impliedYield)} sub="going-in cap" />
                  <StatCard
                    label="Confidence"
                    value={confidence != null ? `${confidence.toFixed(1)} / 10` : 'N/A'}
                    tone={confidence != null && confidence >= 7.5 ? 'good' : 'warn'}
                  />
                  <StatCard
                    label="Equity IRR"
                    value={pct(irr)}
                    tone={
                      irr != null && irr >= 12
                        ? 'good'
                        : irr != null && irr < 8
                          ? 'warn'
                          : 'neutral'
                    }
                  />
                  <StatCard
                    label="Equity multiple"
                    value={moic != null ? `${moic.toFixed(2)}×` : 'N/A'}
                  />
                  <StatCard label="Stabilized NOI" value={krw(pf.stabilizedNoiKrw, 1)} />
                  <StatCard
                    label="Year-1 DSCR"
                    value={dc.baseYear1Dscr != null ? `${dc.baseYear1Dscr.toFixed(2)}×` : 'N/A'}
                    sub={`covenant ${dc.covenantFloor?.toFixed(2) ?? '—'}×`}
                    tone={
                      dc.baseYear1Dscr != null && dc.covenantFloor != null
                        ? dc.baseYear1Dscr >= dc.covenantFloor
                          ? 'good'
                          : 'danger'
                        : 'neutral'
                    }
                  />
                </div>
              </div>

              {/* sticky section nav */}
              <nav className="sticky top-3 z-20 mt-8 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-[#080d18]/80 p-1.5 backdrop-blur-md">
                {NAV.map((n) => (
                  <a
                    key={n.id}
                    href={`#${n.id}`}
                    className="whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    {n.label}
                  </a>
                ))}
              </nav>

              <div id="valuation" className="mt-6 scroll-mt-24 space-y-6">
                <ValuationSummary a={a} resolved={resolved} cls={cls} />
                {dq && <DataQualityPanel dq={dq} />}
                {a.threeApproach && <ThreeApproachSection a={a} />}
                {memo && <MemoSection memo={memo} />}
                {v && <VerdictSection v={v} />}
                {bid && <ImpliedBidSection bid={bid} />}
              </div>

              <div id="cashflow" className="mt-6 scroll-mt-24 space-y-6">
                <ProFormaSummarySection pf={pf} />
                {pfx && pfYears.length > 0 && (
                  <SourcesAndUsesSection pf={pf} pfx={pfx} pfYears={pfYears} />
                )}
                {pfx && <BasisDepreciationSection pfx={pfx} />}
                {pfYears.length > 0 && <IncomeStatementSection pfYears={pfYears} />}
                {pfYears.length > 0 && <CashFlowSection pfYears={pfYears} />}
                {pf && rm && pfYears.length > 0 && (
                  <EquityWaterfallSection pf={pf} pfx={pfx} rm={rm} pfYears={pfYears} />
                )}
                {pfx && pfYears.length > 0 && <BalanceSheetSection pfx={pfx} pfYears={pfYears} />}
                {pfYears.length > 0 && <DebtScheduleSection pf={pf} pfYears={pfYears} />}
              </div>

              <div id="returns" className="mt-6 scroll-mt-24 space-y-6">
                {wf && <GpLpWaterfallSection wf={wf} />}
                <ReturnMetricsSection rm={rm} />
              </div>

              <div id="risk" className="mt-6 scroll-mt-24 space-y-6">
                {mc && <MonteCarloSection mc={mc} />}
                <DebtCovenantSection dc={dc} />
              </div>

              <div id="sensitivity" className="mt-6 scroll-mt-24 space-y-6">
                <CapRateSensitivitySection capMatrix={capMatrix} />
                <InterestRateSensitivitySection irRows={irRows} />
                <MacroDrivenSensitivitySection md={md} />
                {tornado && tornado.drivers.length > 0 && (
                  <TornadoSensitivitySection tornado={tornado} pfx={pfx} />
                )}
              </div>

              <div id="macro" className="mt-6 scroll-mt-24 space-y-6">
                <MacroRegimeSection macro={macro} />
                <MacroExposureSection macro={macro} />
                <MacroStressSection macro={macro} />
                <RefinancingSection refi={refi} />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
