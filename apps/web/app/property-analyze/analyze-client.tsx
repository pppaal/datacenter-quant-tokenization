'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FullReport } from '@/lib/services/property-analyzer/full-report';
import type { MapProviderConfig } from '@/lib/maps/config';
import { PropertyMap, type MapCoordinate } from '@/components/admin/property-map';
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

  function run() {
    if (!address.trim()) return;
    void runAnalysis({ address });
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-2 text-3xl font-bold">Click-Any-Building Analyzer</h1>
        <p className="mb-6 text-sm text-zinc-400">
          Korean address → asset-class classification → 10-year pro-forma → IRR / MOIC / DSCR →
          sensitivity matrices → macro stress → refinancing recommendation.
        </p>

        <div className="mb-4 flex flex-col gap-2">
          <label
            htmlFor="property-address"
            className="text-xs font-medium uppercase tracking-wide text-zinc-400"
          >
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

        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              지도에서 건물 클릭 → 즉시 분석
            </span>
            {clickedPoint && (
              <span className="font-mono text-xs text-zinc-500">
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

        {loading && (
          <div
            className="mb-6 rounded border border-indigo-800 bg-indigo-950/40 p-4"
            role="status"
            aria-live="polite"
          >
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-300">
              Running analysis ({Math.min(currentStep + 1, ANALYSIS_STEPS.length)}/
              {ANALYSIS_STEPS.length})
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
            <ValuationSummary a={a} resolved={resolved} cls={cls} />

            {dq && <DataQualityPanel dq={dq} />}

            {a.threeApproach && <ThreeApproachSection a={a} />}

            {memo && <MemoSection memo={memo} />}

            {v && <VerdictSection v={v} />}

            {bid && <ImpliedBidSection bid={bid} />}

            <MacroRegimeSection macro={macro} />

            <MacroExposureSection macro={macro} />

            <MacroStressSection macro={macro} />

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

            {wf && <GpLpWaterfallSection wf={wf} />}

            <ReturnMetricsSection rm={rm} />

            {mc && <MonteCarloSection mc={mc} />}

            <DebtCovenantSection dc={dc} />

            <CapRateSensitivitySection capMatrix={capMatrix} />

            <InterestRateSensitivitySection irRows={irRows} />

            <MacroDrivenSensitivitySection md={md} />

            {tornado && tornado.drivers.length > 0 && (
              <TornadoSensitivitySection tornado={tornado} pfx={pfx} />
            )}

            <RefinancingSection refi={refi} />
          </div>
        )}
      </div>
    </div>
  );
}
