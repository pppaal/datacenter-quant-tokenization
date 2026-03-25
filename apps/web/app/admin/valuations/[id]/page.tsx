import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { FeatureSnapshotPanel } from '@/components/admin/feature-snapshot-panel';
import { PrintImButton } from '@/components/marketing/print-im-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBreakdown } from '@/components/valuation/confidence-breakdown';
import { CreditAssessmentPanel } from '@/components/valuation/credit-assessment-panel';
import { MacroImpactHistoryPanel } from '@/components/valuation/macro-impact-history-panel';
import { FeatureAssumptionMapping } from '@/components/valuation/feature-assumption-mapping';
import { MacroRegimePanel } from '@/components/valuation/macro-regime-panel';
import { MarketEvidencePanel } from '@/components/valuation/market-evidence-panel';
import { SatelliteRiskSummary } from '@/components/valuation/satellite-risk-summary';
import { SensitivityTable } from '@/components/valuation/sensitivity-table';
import { ValuationBreakdown } from '@/components/valuation/valuation-breakdown';
import { ValuationProvenance } from '@/components/valuation/valuation-provenance';
import { ValuationRunBadges } from '@/components/valuation/valuation-run-badges';
import { ValuationSignals } from '@/components/valuation/valuation-signals';
import { getFxRateMap } from '@/lib/services/fx';
import { buildMacroImpactHistory } from '@/lib/services/macro/history';
import { getValuationRunById } from '@/lib/services/valuations';
import type { MacroInterpretation } from '@/lib/services/macro/regime';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import { buildFeatureAssumptionMappings } from '@/lib/valuation/feature-assumption-mapping';
import {
  filterValuationFeatureSnapshots,
  getValuationFeatureSourceDescriptors
} from '@/lib/valuation/feature-snapshot-usage';
import { resolveSatelliteRiskSnapshot } from '@/lib/valuation/satellite-risk';

export const dynamic = 'force-dynamic';

type ProvenanceEntry = {
  field: string;
  sourceSystem: string;
  value: unknown;
  mode: string;
  freshnessLabel: string;
};

function getRecommendation(confidenceScore?: number | null) {
  if ((confidenceScore ?? 0) >= 75) return 'Proceed To Committee';
  if ((confidenceScore ?? 0) >= 55) return 'Proceed With Conditions';
  return 'Further Diligence Required';
}

export default async function ValuationRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getValuationRunById(id);
  if (!run) notFound();

  const provenance = Array.isArray(run.provenance) ? (run.provenance as ProvenanceEntry[]) : [];
  const satelliteRisk = resolveSatelliteRiskSnapshot({
    assumptions: run.assumptions,
    siteProfile: run.asset.siteProfile
  });
  const recommendation = getRecommendation(run.confidenceScore);
  const bullValue = run.scenarios[0]?.valuationKrw ?? null;
  const bearValue = run.scenarios[2]?.valuationKrw ?? null;
  const featureSources = getValuationFeatureSourceDescriptors(run.assumptions);
  const usedFeatureSnapshots = filterValuationFeatureSnapshots(run.asset.featureSnapshots, run.assumptions);
  const featureMappings = buildFeatureAssumptionMappings(usedFeatureSnapshots, run.assumptions, provenance);
  const isDataCenter = run.asset.assetClass === AssetClass.DATA_CENTER;
  const displayCurrency = resolveDisplayCurrency(run.asset.address?.country ?? run.asset.market);
  const fxRateToKrw = (await getFxRateMap([displayCurrency]))[displayCurrency];
  const macroRegime =
    typeof run.assumptions === 'object' &&
    run.assumptions !== null &&
    'macroRegime' in run.assumptions &&
    typeof run.assumptions.macroRegime === 'object'
      ? (run.assumptions.macroRegime as MacroInterpretation)
      : null;
  const macroImpactHistory = buildMacroImpactHistory(run.asset.valuations);

  return (
    <div className="space-y-6">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Investment Memo Detail</div>
          <h2 className="mt-2 text-3xl font-semibold text-white">{run.asset.name}</h2>
          <div className="mt-2 text-sm text-slate-400">
            {run.runLabel} / {formatDate(run.createdAt)} / {run.engineVersion}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrintImButton />
          <Link href={`/admin/assets/${run.assetId}`}>
            <Button variant="secondary">Open Asset</Button>
          </Link>
          <Link href="/admin/valuations">
            <Button>Back To Runs</Button>
          </Link>
        </div>
      </div>

      <div className="surface hero-mesh">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="good">Generated IM</Badge>
          <Badge>{run.asset.assetCode}</Badge>
          <Badge>{recommendation}</Badge>
        </div>

        <div className="mt-6 grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <div>
              <div className="fine-print">Committee Draft</div>
              <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                Investment Memo for
                <br />
                {run.asset.name}
              </h1>
            </div>

            <p className="max-w-3xl text-lg leading-8 text-slate-300">{run.asset.description}</p>

            <div className="mt-4">
              <ValuationRunBadges
                createdAt={run.createdAt}
                confidenceScore={run.confidenceScore}
                provenance={provenance}
                scenarios={run.scenarios}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="metric-card">
                <div className="fine-print">Recommendation</div>
                <div className="mt-3 text-2xl font-semibold text-white">{recommendation}</div>
                <p className="mt-2 text-sm text-slate-400">Current committee posture based on the latest model run.</p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Base Case Value</div>
                <div className="mt-3 text-2xl font-semibold text-white">
                  {formatCurrencyFromKrwAtRate(run.baseCaseValueKrw, displayCurrency, fxRateToKrw)}
                </div>
                <p className="mt-2 text-sm text-slate-400">Modeled central case for the current underwriting view.</p>
              </div>
              <div className="metric-card">
                <div className="fine-print">Confidence Score</div>
                <div className="mt-3 text-2xl font-semibold text-white">{formatNumber(run.confidenceScore, 1)}</div>
                <p className="mt-2 text-sm text-slate-400">Reflects data completeness, freshness, and source fallback usage.</p>
              </div>
            </div>
          </div>

          <Card className="grid gap-4">
            <div>
              <div className="eyebrow">Memo Cover</div>
              <div className="mt-4 grid gap-3 text-sm text-slate-300">
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Prepared On</span>
                  <span>{formatDate(run.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Location</span>
                  <span>{run.asset.address?.city ?? 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>{isDataCenter ? 'Power Capacity' : 'Rentable Area'}</span>
                  <span>
                    {isDataCenter
                      ? `${formatNumber(run.asset.powerCapacityMw)} MW`
                      : `${formatNumber(run.asset.rentableAreaSqm ?? run.asset.grossFloorAreaSqm)} sqm`}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Engine Version</span>
                  <span>{run.engineVersion}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-accent/20 bg-accent/10 p-5">
              <div className="fine-print text-accent">Investment View</div>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                This IM combines the scenario model, data freshness signals, and asset-level diligence context into a review-ready committee memo.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Bull Case', formatCurrencyFromKrwAtRate(bullValue, displayCurrency, fxRateToKrw), 'upside scenario'],
          ['Bear Case', formatCurrencyFromKrwAtRate(bearValue, displayCurrency, fxRateToKrw), 'downside scenario'],
          ['Implied Yield', formatPercent(run.scenarios[1]?.impliedYieldPct), 'base scenario'],
          ['Exit Cap Rate', formatPercent(run.scenarios[1]?.exitCapRatePct), 'base scenario']
        ].map(([label, value, detail]) => (
          <div key={label} className="metric-card">
            <div className="fine-print">{label}</div>
            <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
            <p className="mt-2 text-sm text-slate-400">{detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Card>
          <div className="eyebrow">Investment Memo (IM)</div>
          <div className="mt-5 space-y-5">
            <p className="text-base leading-8 text-slate-200">{run.underwritingMemo}</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Asset Thesis</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Asset quality, market positioning, and scenario resilience define the current investment case.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Return Profile</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  The modeled base scenario anchors the memo while the outer cases frame upside and downside.
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Diligence Posture</div>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Committee attention should focus on the remaining risk items and due diligence requirements below.
                </p>
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
                <div className="mt-2 text-lg font-semibold text-white">{formatDate(run.createdAt)}</div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Latest Base Case</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {formatCurrencyFromKrwAtRate(run.baseCaseValueKrw, displayCurrency, fxRateToKrw)}
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Asset Stage</div>
                <div className="mt-2 flex gap-2">
                  <Badge>{run.asset.status}</Badge>
                  <Badge tone="good">{run.asset.stage}</Badge>
                </div>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="fine-print">Feature Layers Applied</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {featureSources.length > 0 ? (
                    featureSources.map((feature) => <Badge key={feature.namespace}>{feature.label}</Badge>)
                  ) : (
                    <span className="text-sm text-slate-500">No promoted feature snapshots applied.</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="eyebrow">Key Risks</div>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {run.keyRisks.map((risk) => (
                <li key={risk} className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  {risk}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="eyebrow">DD Checklist</div>
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              {run.ddChecklist.map((item) => (
                <li key={item} className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <SatelliteRiskSummary snapshot={satelliteRisk} />

      <FeatureSnapshotPanel
        snapshots={usedFeatureSnapshots}
        title="Promoted Features Used"
        emptyMessage="This valuation run did not reference promoted feature snapshots yet."
      />

      <FeatureAssumptionMapping rows={featureMappings} />

      <CreditAssessmentPanel assessments={run.asset.creditAssessments} displayCurrency={displayCurrency} fxRateToKrw={fxRateToKrw} />

      <MacroRegimePanel macroRegime={macroRegime} />

      <MacroImpactHistoryPanel history={macroImpactHistory} />

      <MarketEvidencePanel
        assetClass={run.asset.assetClass}
        displayCurrency={displayCurrency}
        fxRateToKrw={fxRateToKrw}
        transactionComps={run.asset.transactionComps}
        rentComps={run.asset.rentComps}
        marketIndicators={run.asset.marketIndicatorSeries}
      />

      <SensitivityTable runs={run.sensitivityRuns} displayCurrency={displayCurrency} fxRateToKrw={fxRateToKrw} />

      <ValuationBreakdown
        assumptions={run.assumptions as Record<string, number | string | null>}
        provenance={provenance}
        displayCurrency={displayCurrency}
        fxRateToKrw={fxRateToKrw}
      />

      <ConfidenceBreakdown
        engineVersion={run.engineVersion}
        confidenceScore={run.confidenceScore}
        address={run.asset.address}
        siteProfile={run.asset.siteProfile}
        buildingSnapshot={run.asset.buildingSnapshot}
        permitSnapshot={run.asset.permitSnapshot}
        energySnapshot={run.asset.energySnapshot}
        marketSnapshot={run.asset.marketSnapshot}
        provenance={provenance}
      />

      <ValuationSignals
        confidenceScore={run.confidenceScore}
        assumptions={run.assumptions as Record<string, number | string | null>}
        provenance={provenance}
      />

      <div className="print-break grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4">
          <div className="eyebrow">Scenario Table</div>
          {run.scenarios.map((scenario) => (
            <div key={scenario.id} className="rounded-[22px] border border-white/10 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-white">{scenario.name}</div>
                <div className="text-sm text-slate-300">
                  {formatCurrencyFromKrwAtRate(scenario.valuationKrw, displayCurrency, fxRateToKrw)}
                </div>
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
            <h2 className="mt-3 text-2xl font-semibold text-white">Continue from the asset dossier.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Move back to the asset record to refresh source enrichment, upload new diligence materials, or rerun the analysis with updated assumptions.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/admin/assets/${run.assetId}`}>
                <Button>Open Asset Dossier</Button>
              </Link>
              <Link href="/admin/valuations">
                <Button variant="secondary">Back To Runs</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
