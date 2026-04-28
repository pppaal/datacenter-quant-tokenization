import { SiteNav } from '@/components/marketing/site-nav';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

const sections = [
  {
    title: 'Research Intake And Deal Dossier',
    body: 'Capture sponsor, location, market, pricing, operating assumptions, financing context, and live execution data in one structured investment record.'
  },
  {
    title: 'Evidence Review And Provenance',
    body: 'Pull geospatial, permit, utility, market, macro, and document-derived evidence into the same record while tracking freshness, fallback usage, provenance, and review state.'
  },
  {
    title: 'Underwriting, IC, And Readiness',
    body: 'Run valuation, downside, diligence, and committee workflows, then package review-gated outputs with deterministic readiness metadata.'
  },
  {
    title: 'Portfolio And Capital Shell',
    body: 'Track held-asset KPI history, covenant tests, capex plans, vehicles, investors, commitments, calls, distributions, and reporting shells in the same operating system.'
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
            <Badge>Korea Real Estate Investment-Firm OS</Badge>
          </div>
          <h1 className="mt-5 max-w-5xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white md:text-6xl">
            Operate Korean real-estate investments
            <br />
            through one research, underwriting, and portfolio workflow.
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            Nexus Seoul is an AI-native operating system for Korean real-estate investment teams.
            Open a case, enrich the record, review evidence, underwrite the opportunity, manage the
            deal, and carry the asset into portfolio and capital workflows from the same
            application.
          </p>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            DATA_CENTER remains one vertical pack, OFFICE is the first full non-data-center pack,
            and INDUSTRIAL / LOGISTICS is the next native playbook on the same review-gated evidence
            stack.
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-500">
            The blockchain layer remains registry-only: document hashes, registry ids, and packet
            metadata can be anchored, while evidence, extracted text, valuations, and workflows stay
            offchain.
          </p>
        </div>
      </section>

      <section className="app-shell py-10">
        <div className="mb-6 max-w-3xl">
          <div className="eyebrow">Why It Matters</div>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            The product combines research, underwriting, execution, portfolio operations, and
            capital shell data in one operating system. Teams do not need to split asset intake,
            diligence, IC material, portfolio tracking, and investor reporting across separate
            tools.
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
