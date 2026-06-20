import Link from 'next/link';
import { formatCompactCurrencyFromKrwAtRate } from '@/lib/finance/currency';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBreakdown } from '@/components/valuation/confidence-breakdown';
import { ValuationBreakdown } from '@/components/valuation/valuation-breakdown';
import { ValuationProvenance } from '@/components/valuation/valuation-provenance';
import { ValuationSignals } from '@/components/valuation/valuation-signals';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import type { SampleReportData } from './types';

export function MemoSection({ data }: { data: SampleReportData }) {
  const {
    asset,
    latestRun,
    scenarios,
    provenance,
    displayCurrency,
    fxRateToKrw,
    proForma,
    bullValue,
    bearValue,
    recommendation
  } = data;

  // Data-driven memo cards (previously identical static prose for every asset).
  const baseCaseLabel = formatCompactCurrencyFromKrwAtRate(
    latestRun.baseCaseValueKrw,
    displayCurrency,
    fxRateToKrw
  );
  const scenarioRangeLabel =
    bearValue !== null && bullValue !== null
      ? `${formatCompactCurrencyFromKrwAtRate(bearValue, displayCurrency, fxRateToKrw)} – ${formatCompactCurrencyFromKrwAtRate(bullValue, displayCurrency, fxRateToKrw)}`
      : null;
  const irrLabel =
    proForma && proForma.summary.equityIrr !== null
      ? formatPercent(proForma.summary.equityIrr)
      : null;
  const multipleLabel =
    proForma && proForma.summary.equityMultiple > 0
      ? `${formatNumber(proForma.summary.equityMultiple, 2)}x`
      : null;
  const riskCount = latestRun.keyRisks.length;
  const ddCount = latestRun.ddChecklist.length;

  const assetClassLabel = asset.assetClass.replace(/_/g, ' ').toLowerCase();
  const assetThesis = `${assetClassLabel.charAt(0).toUpperCase()}${assetClassLabel.slice(1)} asset in ${asset.market}; current committee posture is ${recommendation} at a ${baseCaseLabel} base case.`;
  const returnProfile =
    irrLabel || multipleLabel
      ? `Base case targets ${[irrLabel ? `${irrLabel} equity IRR` : null, multipleLabel ? `${multipleLabel} equity multiple` : null].filter(Boolean).join(' / ')}${scenarioRangeLabel ? `; scenarios span ${scenarioRangeLabel}.` : '.'}`
      : scenarioRangeLabel
        ? `The base scenario anchors the case; bull/bear scenarios span ${scenarioRangeLabel}.`
        : 'The base scenario anchors committee discussion; scenario returns are not yet available.';
  const diligencePosture =
    riskCount > 0 || ddCount > 0
      ? `${riskCount} key risk${riskCount === 1 ? '' : 's'} and ${ddCount} diligence checklist item${ddCount === 1 ? '' : 's'} are tracked directly below.`
      : 'No open key risks or diligence checklist items are recorded on this run.';

  return (
    <section id="im-memo" className="app-shell space-y-6 py-6">
      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Card>
          <div className="eyebrow">Investment Memo (IM)</div>
          <div className="mt-5 space-y-5">
            <p className="text-base leading-8 text-slate-200">{latestRun.underwritingMemo}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Asset Thesis</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{assetThesis}</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Return Profile</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{returnProfile}</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Diligence Posture</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">{diligencePosture}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card>
            <div className="eyebrow">Committee Snapshot</div>
            <div className="mt-4 grid gap-4 text-sm text-slate-300">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Updated</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatDate(latestRun.createdAt)}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Latest Base Case</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatCompactCurrencyFromKrwAtRate(
                    latestRun.baseCaseValueKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Confidence</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatNumber(latestRun.confidenceScore, 1)}
                  {latestRun.confidenceScore !== null && latestRun.confidenceScore !== undefined ? (
                    <span className="ml-1 text-xs font-normal text-slate-400">/ 10</span>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="eyebrow">Key Risks</div>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {latestRun.keyRisks.map((risk) => (
                <li
                  key={risk}
                  className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  {risk}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="eyebrow">DD Checklist</div>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {latestRun.ddChecklist.map((item) => (
                <li
                  key={item}
                  className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <ValuationBreakdown
        assumptions={latestRun.assumptions as Record<string, number | string | null>}
        provenance={provenance}
        displayCurrency={displayCurrency}
        fxRateToKrw={fxRateToKrw}
      />

      <ConfidenceBreakdown
        engineVersion={latestRun.engineVersion}
        confidenceScore={latestRun.confidenceScore}
        address={asset.address}
        siteProfile={asset.siteProfile}
        buildingSnapshot={asset.buildingSnapshot}
        permitSnapshot={asset.permitSnapshot}
        energySnapshot={asset.energySnapshot}
        marketSnapshot={asset.marketSnapshot}
        provenance={provenance}
      />

      <ValuationSignals
        confidenceScore={latestRun.confidenceScore}
        assumptions={latestRun.assumptions as Record<string, number | string | null>}
        provenance={provenance}
      />

      <div className="print-break grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4">
          <div className="eyebrow">Scenario Table</div>
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className="rounded-[22px] border border-white/10 bg-slate-950/45 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">{scenario.name}</h3>
                <span className="text-sm text-slate-400">
                  {formatCompactCurrencyFromKrwAtRate(
                    scenario.valuationKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </span>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
                <div>
                  <div className="text-slate-500">Implied Yield</div>
                  <div>{formatPercent(scenario.impliedYieldPct)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Exit Cap Rate</div>
                  <div>{formatPercent(scenario.exitCapRatePct)}</div>
                </div>
                <div>
                  <div className="text-slate-500">DSCR</div>
                  <div>{formatNumber(scenario.debtServiceCoverage, 2)}x</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-400">{scenario.notes}</p>
            </div>
          ))}
        </Card>

        <div className="grid gap-6">
          <ValuationProvenance entries={provenance} />

          <Card className="hero-mesh print-hidden">
            <div className="eyebrow">Next Step</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              See how this IM is generated from a live workflow.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Open the admin console to create a new asset, run the analysis, and produce a new
              committee-ready memo from live data and assumptions.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/admin/assets/new">
                <Button>Start New Analysis</Button>
              </Link>
              <Link href="/admin">
                <Button variant="secondary">Open Console</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
