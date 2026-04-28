import Link from 'next/link';
import { AssetClass } from '@prisma/client';
import { InquiryForm } from '@/components/marketing/inquiry-form';
import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrencyFromKrwAtRate, resolveDisplayCurrency } from '@/lib/finance/currency';
import { getLandingData } from '@/lib/services/dashboard';
import { getFxRateMap } from '@/lib/services/fx';
import { formatNumber, formatPercent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const workflow = [
  {
    step: '01',
    title: 'Research Intake',
    body: 'Open a new investment case with asset, market, sponsor, financing, and document context in one operating record.'
  },
  {
    step: '02',
    title: 'Evidence Review',
    body: 'Pull market, permit, legal, lease, and geospatial evidence into the file and move only approved evidence into the underwriting layer.'
  },
  {
    step: '03',
    title: 'Underwriting And IC',
    body: 'Run valuation, downside, and diligence analysis, then generate committee-ready outputs from the same record.'
  },
  {
    step: '04',
    title: 'Portfolio And Capital Ops',
    body: 'Track live deals, held-asset KPIs, covenant watchlists, and capital formation shells without moving evidence or logic onchain.'
  }
];

const outputs = [
  {
    label: 'Valuation Surface',
    detail:
      'Base case value, downside, approved evidence coverage, and scenario dispersion in one investment view.'
  },
  {
    label: 'Research Dossier',
    detail:
      'Macro thesis, market indicators, comps, permit context, and approved micro evidence tied to the same asset record.'
  },
  {
    label: 'IC And DD Output',
    detail:
      'Committee memo, DD checklist, and risk memo grounded in approved evidence and current valuation state.'
  },
  {
    label: 'Execution Trail',
    detail:
      'Deals, document hashes, review packets, and registry-only anchor references linked back to each opportunity.'
  }
];

function getPrimaryMetric(asset: Awaited<ReturnType<typeof getLandingData>>['assets'][number]) {
  if (asset.assetClass === AssetClass.DATA_CENTER) {
    return ['Power', `${formatNumber(asset.powerCapacityMw)} MW`];
  }

  return ['Area', `${formatNumber(asset.rentableAreaSqm ?? asset.grossFloorAreaSqm)} sqm`];
}

export default async function LandingPage() {
  const { assets, summary } = await getLandingData();
  const fxRateMap = await getFxRateMap(
    assets.map((asset) => resolveDisplayCurrency(asset.address?.country ?? asset.market))
  );
  const averageCapRate =
    assets.reduce((total, asset) => total + (asset.marketSnapshot?.capRatePct ?? 0), 0) /
    Math.max(assets.filter((asset) => asset.marketSnapshot?.capRatePct !== null).length, 1);
  const totalArea = assets.reduce(
    (total, asset) => total + (asset.rentableAreaSqm ?? asset.grossFloorAreaSqm ?? 0),
    0
  );
  const latestBaseValue =
    assets[0]?.valuations[0]?.baseCaseValueKrw ?? assets[0]?.currentValuationKrw ?? null;
  const latestBaseValueCurrency = assets[0]
    ? resolveDisplayCurrency(assets[0].address?.country ?? assets[0].market)
    : 'KRW';
  const latestBaseValueFxRate = fxRateMap[latestBaseValueCurrency];
  const activeAssetClasses = new Set(assets.map((asset) => asset.assetClass)).size;

  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-6 md:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="surface relative hero-mesh glow-ring reveal-up overflow-hidden">
            <div className="floating-orb absolute right-10 top-10 hidden h-28 w-28 rounded-full bg-accent/10 blur-2xl lg:block" />
            <div className="relative space-y-8">
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone="good">Korea Real Estate Investment-Firm OS</Badge>
                <Badge>Research + Underwriting + Deals + Portfolio + Capital Shell</Badge>
              </div>

              <div className="space-y-5">
                <h1 className="max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-7xl">
                  Operate Korean real-estate investments
                  <br />
                  from research through portfolio management.
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-slate-300">
                  Run research, review-gated underwriting, deal execution, portfolio operations, and
                  capital-formation workflows in one operator system built for Korean real-estate
                  investing.
                </p>
                <p className="max-w-3xl text-base leading-7 text-slate-400">
                  DATA_CENTER remains one vertical pack, OFFICE is the first full non-data-center
                  pack, and INDUSTRIAL / LOGISTICS is the next native playbook on the same
                  review-gated evidence model.
                </p>
                <p className="max-w-3xl text-sm leading-7 text-slate-500">
                  Files, extracted text, valuation logic, and workflows remain offchain. Only
                  registry identifiers, document hashes, and packet metadata are anchorable onchain
                  under the registry-only model.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/admin/assets/new">
                  <Button>Open New Investment Case</Button>
                </Link>
                <Link href="/sample-report">
                  <Button variant="secondary">View Sample IC Output</Button>
                </Link>
                <Link href="/admin">
                  <Button variant="ghost">Open Investment Console</Button>
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                {[
                  ['Tracked Assets', formatNumber(summary.assetCount, 0)],
                  ['Asset Classes', formatNumber(activeAssetClasses, 0)],
                  ['Documents', formatNumber(summary.documentCount, 0)],
                  ['IM Runs', formatNumber(summary.valuationCount, 0)]
                ].map(([label, value]) => (
                  <div key={label} className="metric-card">
                    <div className="fine-print">{label}</div>
                    <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            <Card className="grid-lines overflow-hidden">
              <div className="eyebrow">What You Get</div>
              <div className="mt-4 grid gap-4">
                {outputs.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[24px] border border-white/10 bg-slate-950/45 p-5"
                  >
                    <div className="fine-print">{item.label}</div>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{item.detail}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="eyebrow">Workflow</div>
              <div className="mt-4 grid gap-3">
                {workflow.map((item) => (
                  <div
                    key={item.step}
                    className="flex gap-4 rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="font-mono text-sm text-accent">{item.step}</div>
                    <div>
                      <div className="text-base font-semibold text-white">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-400">{item.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="app-shell py-2">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['Asset Classes', formatNumber(activeAssetClasses, 0), 'active underwriting sectors'],
            ['Average Cap Rate', formatPercent(averageCapRate), 'latest market snapshots'],
            ['Tracked Area', `${formatNumber(totalArea)} sqm`, 'across current assets'],
            [
              'Latest Base Value',
              formatCurrencyFromKrwAtRate(
                latestBaseValue,
                latestBaseValueCurrency,
                latestBaseValueFxRate
              ),
              'latest modeled base case'
            ]
          ].map(([label, value, detail]) => (
            <div key={label} className="metric-card">
              <div className="fine-print">{label}</div>
              <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
              <p className="mt-2 text-sm text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Asset Pipeline</div>
            <h2 className="section-title mt-3">Current underwriting and research cases</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              Each asset below runs through the same operating chain: intake, research enrichment,
              evidence review, underwriting, execution, and readiness packaging.
            </p>
          </div>
          <Link
            href="/product"
            className="fine-print rounded-full border border-white/10 px-4 py-3 transition hover:border-white/20 hover:text-white"
          >
            Investment OS Overview
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {assets.map((asset, index) => {
            const [metricLabel, metricValue] = getPrimaryMetric(asset);
            const displayCurrency = resolveDisplayCurrency(asset.address?.country ?? asset.market);
            const fxRateToKrw = fxRateMap[displayCurrency];

            return (
              <Card key={asset.id} className="overflow-hidden">
                <div className="fine-print">Asset {String(index + 1).padStart(2, '0')}</div>
                <div className="mt-4 flex items-center justify-between gap-4">
                  <Badge>{asset.assetClass}</Badge>
                  <span className="fine-print">{asset.assetCode}</span>
                </div>
                <div className="mt-5">
                  <h3 className="text-2xl font-semibold text-white">{asset.name}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{asset.description}</p>
                </div>
                <div className="mt-6 grid gap-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>Location</span>
                    <span>{asset.address?.city}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>{metricLabel}</span>
                    <span>{metricValue}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>Cap Rate</span>
                    <span>{formatPercent(asset.marketSnapshot?.capRatePct)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <span>Latest Base Case</span>
                    <span>
                      {formatCurrencyFromKrwAtRate(
                        asset.valuations[0]?.baseCaseValueKrw ?? asset.currentValuationKrw,
                        displayCurrency,
                        fxRateToKrw
                      )}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <div className="eyebrow">Platform Stack</div>
            <h2 className="section-title mt-3">
              One product for analysis, memo generation, and review.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
              A single Next.js application handles asset intake, enrichment, return analysis, IM
              generation, and document workflow. The frontend reads like a product, while the
              backend stays connected to real service layers.
            </p>

            <div className="mt-6 grid gap-3">
              {[
                [
                  'Assets API',
                  '/api/assets',
                  'Creates the asset dossier used by every downstream analysis and memo run.'
                ],
                [
                  'Valuation API',
                  '/api/valuations',
                  'Runs the model and writes back valuation output plus the generated IM.'
                ],
                [
                  'Document API',
                  '/api/documents/upload',
                  'Stores diligence files, extracted notes, and version history.'
                ],
                [
                  'Inquiry API',
                  '/api/inquiries',
                  'Captures demo and review requests in the same operating system.'
                ]
              ].map(([label, route, detail]) => (
                <div
                  key={route}
                  className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-white">{label}</div>
                    <span className="fine-print">{route}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-400">{detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="hero-mesh">
            <div className="eyebrow">Core Promise</div>
            <div className="mt-4 grid gap-4">
              {[
                'Evaluate a deal before committee with structured assumptions, not scattered spreadsheets.',
                'Compare bull, base, and bear scenarios instead of relying on a single static case.',
                'Generate the investment memo automatically so the narrative stays tied to the model output.',
                'Keep assumptions, diligence documents, and generated outputs inside one asset record.'
              ].map((line) => (
                <div
                  key={line}
                  className="rounded-[22px] border border-white/10 bg-slate-950/45 p-5 text-sm leading-7 text-slate-300"
                >
                  {line}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section className="app-shell py-10">
        <Card className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="eyebrow">Institutional Inquiry</div>
            <h2 className="section-title mt-3">Review the workflow and sample IM.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
              Explore the analysis flow, generated memo, and admin console. Inquiry records are
              stored in the same backend stack used by the rest of the platform.
            </p>
          </div>
          <InquiryForm />
        </Card>
      </section>

      <section className="app-shell py-6">
        <Card className="hero-mesh grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="eyebrow">Final CTA</div>
            <h2 className="section-title mt-3">Run the analysis, then open the memo.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              Intake, enrichment, valuation, risk summary, and investment memo generation now sit
              inside one operating workflow for real estate underwriting.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <Link href="/admin/assets/new">
              <Button>Start Analysis</Button>
            </Link>
            <Link href="/sample-report">
              <Button variant="secondary">Open Sample IM</Button>
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
