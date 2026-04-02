import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const sections = [
  {
    title: 'Asset Intake And Deal Dossier',
    body:
      'Capture sponsor, location, market, pricing, operating assumptions, and financing inputs in one structured asset record across data center, office, industrial, retail, and multifamily.'
  },
  {
    title: 'Source Enrichment And Provenance',
    body:
      'Pull geospatial, permit, utility, macro, and climate overlays into the underwriting record while tracking freshness, fallback usage, and source provenance.'
  },
  {
    title: 'Scenario Analysis And Memo Generation',
    body:
      'Run bull, base, and bear analysis, calculate value and downside, and generate an investment memo with key risks, diligence items, and committee-ready language.'
  },
  {
    title: 'Document Room And Review Trail',
    body:
      'Store uploaded files, extracted notes, version history, and generated outputs in the same operating system so assumptions and evidence do not drift apart.'
  }
];

export default function ProductOverviewPage() {
  return (
    <main className="pb-24">
      <SiteNav />

      <section className="app-shell py-10">
        <div className="surface hero-mesh">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">Product Overview</Badge>
            <Badge>Korea Real Estate Underwriting & Research OS</Badge>
          </div>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            Underwrite Korean real estate
            <br />
            through one research, valuation, and IC workflow.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            Nexus Seoul is an underwriting and research operating system for Korean real estate teams. Input an
            asset, enrich the record, review evidence, run scenario analysis, and produce committee outputs from the
            same application.
          </p>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            DATA_CENTER remains a vertical pack, OFFICE is now the first full non-data-center pack, and
            INDUSTRIAL / LOGISTICS is scaffolded on the same review-gated workflow.
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">
            The blockchain layer remains registry-only: document hashes, registry ids, and packet metadata can be
            anchored, while underwriting logic and evidence stay offchain.
          </p>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">Why It Matters</div>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            The product combines underwriting math and memo creation in one operating system. Teams do not need to
            split asset intake, scenario work, diligence tracking, and committee material across separate tools.
          </p>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {sections.map((section, index) => (
            <Card key={section.title} className="min-h-[250px]">
              <div className="fine-print">Module {String(index + 1).padStart(2, '0')}</div>
              <h2 className="mt-4 text-2xl font-semibold text-white">{section.title}</h2>
              <p className="mt-4 text-sm leading-7 text-slate-400">{section.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
