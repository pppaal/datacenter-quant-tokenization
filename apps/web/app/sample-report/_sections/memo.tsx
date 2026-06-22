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
            <p className="text-base leading-8 text-[hsl(var(--foreground))]">
              {latestRun.underwritingMemo}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4">
                <div className="fine-print">Asset Thesis</div>
                <p className="mt-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
                  {assetThesis}
                </p>
              </div>
              <div className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4">
                <div className="fine-print">Return Profile</div>
                <p className="mt-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
                  {returnProfile}
                </p>
              </div>
              <div className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4">
                <div className="fine-print">Diligence Posture</div>
                <p className="mt-3 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
                  {diligencePosture}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card>
            <div className="eyebrow">Committee Snapshot</div>
            <div className="mt-4 grid gap-4 text-sm text-[hsl(var(--foreground-muted))]">
              <div className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4">
                <div className="fine-print">Updated</div>
                <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
                  {formatDate(latestRun.createdAt)}
                </div>
              </div>
              <div className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4">
                <div className="fine-print">Latest Base Case</div>
                <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
                  {formatCompactCurrencyFromKrwAtRate(
                    latestRun.baseCaseValueKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </div>
              </div>
              <div className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] p-4">
                <div className="fine-print">Confidence</div>
                <div className="mt-2 text-lg font-semibold text-[hsl(var(--foreground))]">
                  {formatNumber(latestRun.confidenceScore, 1)}
                  {latestRun.confidenceScore !== null && latestRun.confidenceScore !== undefined ? (
                    <span className="ml-1 text-xs font-normal text-[hsl(var(--foreground-muted))]">
                      / 10
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="eyebrow">Key Risks</div>
            <ul className="mt-4 space-y-3 text-sm text-[hsl(var(--foreground-muted))]">
              {latestRun.keyRisks.map((risk) => (
                <li
                  key={risk}
                  className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-3"
                >
                  {risk}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="eyebrow">DD Checklist</div>
            <ul className="mt-4 space-y-3 text-sm text-[hsl(var(--foreground-muted))]">
              {latestRun.ddChecklist.map((item) => (
                <li
                  key={item}
                  className="rounded-[18px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-hover))] px-4 py-3"
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
              className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                  {scenario.name}
                </h3>
                <span className="text-sm text-[hsl(var(--foreground-muted))]">
                  {formatCompactCurrencyFromKrwAtRate(
                    scenario.valuationKrw,
                    displayCurrency,
                    fxRateToKrw
                  )}
                </span>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-[hsl(var(--foreground-muted))] md:grid-cols-3">
                <div>
                  <div className="text-[hsl(var(--muted))]">Implied Yield</div>
                  <div>{formatPercent(scenario.impliedYieldPct)}</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--muted))]">Exit Cap Rate</div>
                  <div>{formatPercent(scenario.exitCapRatePct)}</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--muted))]">DSCR</div>
                  <div>{formatNumber(scenario.debtServiceCoverage, 2)}x</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-[hsl(var(--foreground-muted))]">{scenario.notes}</p>
            </div>
          ))}
        </Card>

        <div className="grid gap-6">
          <ValuationProvenance entries={provenance} />

          <Card className="hero-mesh print-hidden">
            <div className="eyebrow">Next Step</div>
            <h2 className="mt-3 text-2xl font-semibold text-[hsl(var(--foreground))]">
              See how this IM is generated from a live workflow.
            </h2>
            <p className="mt-4 text-sm leading-7 text-[hsl(var(--foreground-muted))]">
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
