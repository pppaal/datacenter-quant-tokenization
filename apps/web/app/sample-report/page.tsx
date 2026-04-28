import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetClass } from '@prisma/client';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { PrintImButton } from '@/components/marketing/print-im-button';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfidenceBreakdown } from '@/components/valuation/confidence-breakdown';
import { ValuationBreakdown } from '@/components/valuation/valuation-breakdown';
import { ValuationProvenance } from '@/components/valuation/valuation-provenance';
import { ValuationSignals } from '@/components/valuation/valuation-signals';
import { getSampleReport } from '@/lib/services/dashboard';
import { getFxRateMap } from '@/lib/services/fx';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';

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

export default async function SampleReportPage() {
  const asset = await getSampleReport();
  if (!asset) notFound();

  const latestRun = asset.valuations[0];
  if (!latestRun) notFound();

  const scenarios = latestRun.scenarios ?? [];
  const provenance = Array.isArray(latestRun.provenance)
    ? (latestRun.provenance as ProvenanceEntry[])
    : [];
  const bullValue = scenarios[0]?.valuationKrw ?? null;
  const bearValue = scenarios[2]?.valuationKrw ?? null;
  const recommendation = getRecommendation(latestRun.confidenceScore);
  const isDataCenter = asset.assetClass === AssetClass.DATA_CENTER;
  const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
  const fxRateToKrw = (await getFxRateMap([displayCurrency]))[displayCurrency];

  return (
    <main className="pb-24">
      <div className="print-hidden">
        <SiteNav />
      </div>

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">Sample IM</Badge>
            <Badge>Investment Memo</Badge>
            <Badge>{asset.assetCode}</Badge>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-5">
              <div>
                <div className="fine-print">Committee Draft</div>
                <h1 className="mt-3 text-5xl font-semibold leading-[0.96] tracking-[-0.05em] text-white md:text-6xl">
                  Sample Investment Memo for
                  <br />
                  {asset.name}
                </h1>
              </div>

              <p className="max-w-3xl text-lg leading-8 text-slate-300">{asset.description}</p>

              <div className="print-hidden flex flex-wrap gap-3">
                <PrintImButton />
                <Link href="/admin/assets/new">
                  <Button>Start New Analysis</Button>
                </Link>
                <Link href="/admin">
                  <Button variant="ghost">Open Console</Button>
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="metric-card">
                  <div className="fine-print">Recommendation</div>
                  <div className="mt-3 text-2xl font-semibold text-white">{recommendation}</div>
                  <p className="mt-2 text-sm text-slate-400">
                    Generated from confidence, scenario spread, and diligence posture.
                  </p>
                </div>
                <div className="metric-card">
                  <div className="fine-print">Base Case Value</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {formatCurrencyFromKrwAtRate(
                      latestRun.baseCaseValueKrw,
                      displayCurrency,
                      fxRateToKrw
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Current modeled value for committee discussion.
                  </p>
                </div>
                <div className="metric-card">
                  <div className="fine-print">Confidence Score</div>
                  <div className="mt-3 text-2xl font-semibold text-white">
                    {formatNumber(latestRun.confidenceScore, 1)}
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    Reflects data coverage, freshness, and fallback usage.
                  </p>
                </div>
              </div>
            </div>

            <Card className="grid gap-4">
              <div>
                <div className="eyebrow">Memo Cover</div>
                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Prepared On</span>
                    <span>{formatDate(latestRun.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Location</span>
                    <span>{asset.address?.city ?? 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>{isDataCenter ? 'Power Capacity' : 'Rentable Area'}</span>
                    <span>
                      {isDataCenter
                        ? `${formatNumber(asset.powerCapacityMw)} MW`
                        : `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span>Engine Version</span>
                    <span>{latestRun.engineVersion}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-accent/20 bg-accent/10 p-5">
                <div className="fine-print text-accent">Investment View</div>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  This sample IM shows how the platform converts structured asset inputs, scenario
                  analysis, and diligence signals into a committee-ready investment narrative.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="app-shell py-4">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            [
              'Bull Case',
              formatCurrencyFromKrwAtRate(bullValue, displayCurrency, fxRateToKrw),
              'upside scenario'
            ],
            [
              'Bear Case',
              formatCurrencyFromKrwAtRate(bearValue, displayCurrency, fxRateToKrw),
              'downside scenario'
            ],
            ['Implied Yield', formatPercent(scenarios[1]?.impliedYieldPct), 'base scenario'],
            ['Exit Cap Rate', formatPercent(scenarios[1]?.exitCapRatePct), 'base scenario']
          ].map(([label, value, detail]) => (
            <div key={label} className="metric-card">
              <div className="fine-print">{label}</div>
              <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
              <p className="mt-2 text-sm text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="app-shell space-y-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card>
            <div className="eyebrow">Investment Memo (IM)</div>
            <div className="mt-5 space-y-5">
              <p className="text-base leading-8 text-slate-200">{latestRun.underwritingMemo}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Asset Thesis</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Asset quality, market positioning, and scenario resilience support the current
                    underwriting case.
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Return Profile</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    The base scenario anchors committee discussion, while the bull and bear cases
                    frame upside and downside.
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Diligence Posture</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Remaining open items are tracked directly below in the risk list and diligence
                    checklist.
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
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatDate(latestRun.createdAt)}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="fine-print">Latest Base Case</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {formatCurrencyFromKrwAtRate(
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
                    {formatCurrencyFromKrwAtRate(
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
    </main>
  );
}
